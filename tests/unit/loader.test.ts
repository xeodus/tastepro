import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ContentLoader, resolveContentDir } from "../../src/core/content/loader.js";
import type { CatalogEntry, Provenance } from "../../src/core/schema.js";

const provenance: Provenance = {
  source: "tastepro",
  repo: "",
  commit: "workspace",
  path: "content/test.json",
  license: "Apache-2.0",
  authors: ["TastePro"],
  url: "",
  transformations: [],
};

const domainPack = {
  id: "domain/test",
  kind: "domain",
  name: "Test domain",
  summary: "A test domain used by loader fixtures.",
  quality: "verified",
  provenance,
  family: "software",
  description: "A test domain.",
  aliases: ["test"],
  status: "available",
  depth: "seed",
  launchTier: false,
  upstreamSectors: [],
};

const referencePack = {
  id: "reference/test",
  kind: "reference",
  name: "Test reference",
  summary: "A test reference used by loader fixtures.",
  quality: "reference",
  provenance,
  title: "Test reference",
  headings: ["Test"],
  bodyPath: "references/test.md",
  body: "",
  useFor: ["tests"],
};

const catalogEntry = (pack: { id: string; kind: string; name: string; summary: string }) =>
  ({
    id: pack.id,
    kind: pack.kind,
    name: pack.name,
    summary: pack.summary,
    quality: "verified",
    source: "tastepro",
    domains: [],
    tags: [],
    moods: [],
    sectors: [],
  }) as CatalogEntry;

const tempDirs: string[] = [];

async function makeFixture(options: {
  catalog?: unknown;
  domains?: unknown;
  references?: unknown;
  stats?: unknown;
  sources?: unknown;
  referenceBody?: string;
}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tastepro-loader-"));
  tempDirs.push(dir);
  await mkdir(join(dir, "generated", "kinds"), { recursive: true });
  await mkdir(join(dir, "references"), { recursive: true });
  await writeFile(
    join(dir, "generated", "catalog.json"),
    JSON.stringify(options.catalog ?? [catalogEntry(domainPack), catalogEntry(referencePack)]),
  );
  await writeFile(
    join(dir, "generated", "kinds", "domains.json"),
    JSON.stringify(options.domains ?? [domainPack]),
  );
  await writeFile(
    join(dir, "generated", "kinds", "references.json"),
    JSON.stringify(options.references ?? [referencePack]),
  );
  await writeFile(
    join(dir, "references", "test.md"),
    options.referenceBody ?? "# Test\n\nA reference body long enough to be useful.",
  );
  if (options.stats !== undefined) {
    await writeFile(join(dir, "generated", "stats.json"), JSON.stringify(options.stats));
  }
  if (options.sources !== undefined) {
    await writeFile(join(dir, "generated", "sources.json"), JSON.stringify(options.sources));
  }
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("content loader", () => {
  it("loads the committed catalog and every kind", async () => {
    const loader = new ContentLoader();
    const [catalog, stats, domains, guidelines, references] = await Promise.all([
      loader.catalog(),
      loader.stats(),
      loader.domains(),
      loader.guidelines(),
      loader.packs("reference"),
    ]);
    expect(catalog).toHaveLength(873);
    expect(stats.catalogEntries).toBe(873);
    expect(domains).toHaveLength(40);
    expect(guidelines).toHaveLength(104);
    expect(references).toHaveLength(25);
    expect(domains.every((domain) => domain.kind === "domain")).toBe(true);
  });

  it("resolves exact ids, bare suffixes, and whitespace", async () => {
    const loader = new ContentLoader();
    await expect(loader.resolveId("domain/fintech-payments")).resolves.toBe(
      "domain/fintech-payments",
    );
    await expect(loader.resolveId("fintech-payments")).resolves.toBe("domain/fintech-payments");
    await expect(loader.resolveId("  /domain/fintech-payments/  ")).resolves.toBe(
      "domain/fintech-payments",
    );
    await expect(loader.resolveId("app-style/framed-sheet")).resolves.toBe(
      "app-style/framed-sheet",
    );
    await expect(loader.resolveId("framed-sheet")).resolves.toBeNull();
    await expect(loader.resolveId("does-not-exist")).resolves.toBeNull();
    await expect(loader.resolveId("   ")).resolves.toBeNull();
  });

  it("loads reference bodies from the content directory", async () => {
    const loader = new ContentLoader();
    const document = await loader.referenceDocument("reference/taste-skill-type");
    expect(document).not.toBeNull();
    expect(document?.mimeType).toBe("text/markdown");
    expect(document?.body).toContain("Type");
    expect(document?.body.length).toBeGreaterThan(500);
    await expect(loader.referenceDocument("domain/fintech-payments")).resolves.toBeNull();
  });

  it("memoizes packs and clears them on request", async () => {
    const loader = new ContentLoader();
    const first = await loader.pack("domain/fintech-payments");
    const second = await loader.pack("domain/fintech-payments");
    expect(first).toBe(second);
    loader.clear();
    const third = await loader.pack("domain/fintech-payments");
    expect(third).not.toBe(first);
    expect(third?.id).toBe(first?.id);
  });

  it("uses TASTEPRO_CONTENT_DIR when no explicit directory is given", async () => {
    const dir = await makeFixture({});
    const previous = process.env.TASTEPRO_CONTENT_DIR;
    process.env.TASTEPRO_CONTENT_DIR = dir;
    try {
      expect(resolveContentDir()).toBe(dir);
      const loader = new ContentLoader();
      expect(loader.contentDir).toBe(dir);
    } finally {
      if (previous === undefined) delete process.env.TASTEPRO_CONTENT_DIR;
      else process.env.TASTEPRO_CONTENT_DIR = previous;
    }
  });

  it("rejects duplicate catalog ids", async () => {
    const entry = catalogEntry(domainPack);
    const dir = await makeFixture({ catalog: [entry, entry] });
    const loader = new ContentLoader({ contentDir: dir });
    await expect(loader.catalog()).rejects.toThrow(/Duplicate catalog id/);
  });

  it("rejects invalid catalog entries", async () => {
    const dir = await makeFixture({ catalog: [{ id: "x" }] });
    const loader = new ContentLoader({ contentDir: dir });
    await expect(loader.catalog()).rejects.toThrow(/Invalid catalog entry/);
  });

  it("rejects a pack stored in the wrong kind file", async () => {
    const dir = await makeFixture({
      domains: [{ ...domainPack, kind: "direction" }],
    });
    const loader = new ContentLoader({ contentDir: dir });
    await expect(loader.packs("domain")).rejects.toThrow(/has kind direction/);
  });

  it("rejects malformed JSON", async () => {
    const dir = await makeFixture({});
    await writeFile(join(dir, "generated", "catalog.json"), "{not json");
    const loader = new ContentLoader({ contentDir: dir });
    await expect(loader.catalog()).rejects.toThrow(/Invalid JSON in catalog/);
  });

  it("rejects reference paths that escape the content directory", async () => {
    const dir = await makeFixture({
      references: [{ ...referencePack, bodyPath: "../outside.md" }],
    });
    const loader = new ContentLoader({ contentDir: dir });
    await expect(loader.referenceDocument("reference/test")).rejects.toThrow(
      /escapes the content directory/,
    );
  });

  it("returns null for a missing reference body", async () => {
    const dir = await makeFixture({});
    await rm(join(dir, "references", "test.md"));
    const loader = new ContentLoader({ contentDir: dir });
    await expect(loader.referenceDocument("reference/test")).resolves.toBeNull();
  });

  it("validates stats and source files", async () => {
    const dir = await makeFixture({
      stats: {
        version: 1,
        generatedAt: "now",
        contentHash: "x",
        catalogEntries: 0,
        counts: {},
        quality: {},
        sources: [],
      },
      sources: [{ id: "not-a-source" }],
    });
    const loader = new ContentLoader({ contentDir: dir });
    await expect(loader.stats()).resolves.toMatchObject({ contentHash: "x" });
    await expect(loader.sources()).rejects.toThrow(/Invalid source/);
  });
});
