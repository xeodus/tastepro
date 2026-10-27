import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type CatalogEntry,
  CatalogEntrySchema,
  type ContentKind,
  type DomainPack,
  type GuidelinePack,
  KIND_FILE_NAMES,
  type Pack,
  PackSchema,
  type ReferencePack,
  type SourceInfo,
  SourceInfoSchema,
  type Stats,
  StatsSchema,
} from "../schema.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * The content directory is deliberately resolved from several places so the
 * same code works from `src/` (tsx), `dist/` (npm package), a Docker image, and
 * a test fixture. An explicit option always wins; the environment variable is
 * next; then the package-relative directory.
 */
export function resolveContentDir(explicit?: string): string {
  const candidates: string[] = [];
  if (explicit) candidates.push(resolve(explicit));
  const env = process.env.TASTEPRO_CONTENT_DIR;
  if (env) candidates.push(resolve(env));
  candidates.push(resolve(MODULE_DIR, "../../../content"));
  candidates.push(resolve(process.cwd(), "content"));

  const unique = [...new Set(candidates)];
  for (const candidate of unique) {
    if (existsSync(join(candidate, "generated", "catalog.json"))) return candidate;
  }
  throw new Error(
    [
      "TastePro content not found.",
      "Run `npm run ingest` to generate it, or set TASTEPRO_CONTENT_DIR.",
      `Tried: ${unique.join(", ")}`,
    ].join("\n"),
  );
}

async function readJsonFile<T>(path: string, label: string): Promise<T> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    throw new Error(
      `Unable to read ${label} at ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(
      `Invalid JSON in ${label} at ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export interface ContentLoaderOptions {
  contentDir?: string;
}

export interface ReferenceDocument {
  id: string;
  bodyPath: string;
  body: string;
  mimeType: "text/markdown";
}

/**
 * Lazy, validated access to the generated content catalog. The loader keeps
 * every kind file in memory after first use and never mutates pack objects.
 */
export class ContentLoader {
  readonly contentDir: string;
  private catalogPromise?: Promise<CatalogEntry[]>;
  private catalogByIdPromise?: Promise<Map<string, CatalogEntry>>;
  private statsPromise?: Promise<Stats>;
  private sourcesPromise?: Promise<SourceInfo[]>;
  private packsByKind = new Map<ContentKind, Promise<Pack[]>>();
  private packById = new Map<string, Promise<Pack | null>>();

  constructor(options: ContentLoaderOptions = {}) {
    this.contentDir = resolveContentDir(options.contentDir);
  }

  async catalog(): Promise<CatalogEntry[]> {
    this.catalogPromise ??= (async () => {
      const raw = await readJsonFile<unknown>(
        join(this.contentDir, "generated", "catalog.json"),
        "catalog",
      );
      if (!Array.isArray(raw)) throw new Error("Catalog must be a JSON array");
      const entries = raw.map((entry, index) => {
        const parsed = CatalogEntrySchema.safeParse(entry);
        if (!parsed.success) {
          throw new Error(
            `Invalid catalog entry at index ${index}: ${parsed.error.issues
              .map((issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`)
              .join("; ")}`,
          );
        }
        return parsed.data;
      });
      const seen = new Set<string>();
      for (const entry of entries) {
        if (seen.has(entry.id)) throw new Error(`Duplicate catalog id: ${entry.id}`);
        seen.add(entry.id);
      }
      return entries;
    })();
    return this.catalogPromise;
  }

  private async catalogById(): Promise<Map<string, CatalogEntry>> {
    this.catalogByIdPromise ??= this.catalog().then(
      (entries) => new Map(entries.map((entry) => [entry.id, entry])),
    );
    return this.catalogByIdPromise;
  }

  async stats(): Promise<Stats> {
    this.statsPromise ??= (async () => {
      const raw = await readJsonFile<unknown>(
        join(this.contentDir, "generated", "stats.json"),
        "stats",
      );
      const parsed = StatsSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(
          `Invalid stats: ${parsed.error.issues
            .map((issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`)
            .join("; ")}`,
        );
      }
      return parsed.data;
    })();
    return this.statsPromise;
  }

  async sources(): Promise<SourceInfo[]> {
    this.sourcesPromise ??= (async () => {
      const raw = await readJsonFile<unknown>(
        join(this.contentDir, "generated", "sources.json"),
        "sources",
      );
      if (!Array.isArray(raw)) throw new Error("Sources must be a JSON array");
      return raw.map((source, index) => {
        const parsed = SourceInfoSchema.safeParse(source);
        if (!parsed.success) {
          throw new Error(
            `Invalid source at index ${index}: ${parsed.error.issues
              .map((issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`)
              .join("; ")}`,
          );
        }
        return parsed.data;
      });
    })();
    return this.sourcesPromise;
  }

  async packs(kind: ContentKind): Promise<Pack[]> {
    let promise = this.packsByKind.get(kind);
    if (!promise) {
      promise = (async () => {
        const path = join(this.contentDir, "generated", "kinds", KIND_FILE_NAMES[kind]);
        const raw = await readJsonFile<unknown>(path, `${kind} packs`);
        if (!Array.isArray(raw)) throw new Error(`${kind} packs must be a JSON array`);
        return raw.map((pack, index) => {
          const parsed = PackSchema.safeParse(pack);
          if (!parsed.success) {
            throw new Error(
              `Invalid ${kind} pack at index ${index}: ${parsed.error.issues
                .map((issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`)
                .join("; ")}`,
            );
          }
          if (parsed.data.kind !== kind) {
            throw new Error(
              `Pack ${parsed.data.id} is stored in ${KIND_FILE_NAMES[kind]} but has kind ${parsed.data.kind}`,
            );
          }
          return parsed.data as Pack;
        });
      })();
      this.packsByKind.set(kind, promise);
    }
    return promise;
  }

  /**
   * Resolve a public id. Exact ids are preferred. A bare suffix is accepted
   * only when it identifies exactly one catalog entry.
   */
  async resolveId(input: string): Promise<string | null> {
    const id = input.trim();
    if (!id) return null;
    const byId = await this.catalogById();
    if (byId.has(id)) return id;
    const normalized = id.replace(/^\/+|\/+$/g, "");
    if (byId.has(normalized)) return normalized;
    const matches = [...byId.keys()].filter(
      (candidate) => candidate === normalized || candidate.endsWith(`/${normalized}`),
    );
    return matches.length === 1 ? matches[0]! : null;
  }

  async pack(input: string): Promise<Pack | null> {
    const id = await this.resolveId(input);
    if (!id) return null;
    let promise = this.packById.get(id);
    if (!promise) {
      promise = (async () => {
        const entry = (await this.catalogById()).get(id);
        if (!entry) return null;
        const kindPacks = await this.packs(entry.kind);
        return kindPacks.find((pack) => pack.id === id) ?? null;
      })();
      this.packById.set(id, promise);
    }
    return promise;
  }

  async referenceDocument(input: string | ReferencePack): Promise<ReferenceDocument | null> {
    const pack = typeof input === "string" ? await this.pack(input) : input;
    if (pack?.kind !== "reference") return null;
    const body = pack.body || (await this.readReferenceBody(pack.bodyPath));
    if (body === null) return null;
    return {
      id: pack.id,
      bodyPath: pack.bodyPath,
      body,
      mimeType: "text/markdown",
    };
  }

  private async readReferenceBody(bodyPath: string): Promise<string | null> {
    if (!bodyPath) return null;
    const absolute = resolve(this.contentDir, bodyPath);
    const relativePath = relative(this.contentDir, absolute);
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      throw new Error(`Reference body path escapes the content directory: ${bodyPath}`);
    }
    try {
      return await readFile(absolute, "utf8");
    } catch {
      return null;
    }
  }

  async domains(): Promise<DomainPack[]> {
    const packs = (await this.packs("domain")) as DomainPack[];
    return [...packs].sort((a, b) => a.name.localeCompare(b.name));
  }

  async guidelines(): Promise<GuidelinePack[]> {
    return (await this.packs("guideline")) as GuidelinePack[];
  }

  /** Clear memoized content; intended for ingest watchers and tests. */
  clear(): void {
    this.catalogPromise = undefined;
    this.catalogByIdPromise = undefined;
    this.statsPromise = undefined;
    this.sourcesPromise = undefined;
    this.packsByKind.clear();
    this.packById.clear();
  }
}
