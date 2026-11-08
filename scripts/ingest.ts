import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import {
  type CatalogEntry,
  CatalogEntrySchema,
  type ContentKind,
  type DomainPack,
  DomainPackSchema,
  KIND_FILE_NAMES,
  type Pack,
  PackSchema,
  type Provenance,
  type ReferencePack,
  ReferencePackSchema,
  type SourceInfo,
  type Stats,
} from "../src/core/schema.js";
import { normalizeWhitespace, slugify, uniqueStrings } from "../src/core/text.js";
import { inferMoods, parseDesignMarkdown } from "./lib/brand.js";
import { computeContentHash } from "./lib/content-hash.js";
import { mapBrandCategory } from "./lib/domains.js";
import { fetchCached, fetchJsonCached, mapLimit } from "./lib/fetch.js";
import { parseGuidelines } from "./lib/guidelines.js";
import { commitSnapshot, discardStaging, prepareStaging } from "./lib/snapshot.js";
import { type LockSource, loadSourceLock, sourceCacheKey } from "./lib/source-lock.js";
import { parseReference, parseTasteLibrary } from "./lib/taste.js";
import { validateContent } from "./lib/validate-content.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CONTENT_DIR = join(ROOT, "content");
const DEFAULT_CACHE_DIR = join(ROOT, ".cache", "sources");

interface IngestOptions {
  contentDir: string;
  cacheDir: string;
  offline: boolean;
  refresh: boolean;
}

interface ReadmeBrand {
  name: string;
  category: string;
  description: string;
}

function lockUrl(source: LockSource, path: string): string {
  return `https://raw.githubusercontent.com/${source.repo.replace("https://github.com/", "")}/${source.commit}/${path}`;
}

function githubTreeUrl(source: LockSource): string {
  return `https://api.github.com/repos/${source.repo.replace(
    "https://github.com/",
    "",
  )}/git/trees/${source.commit}?recursive=1`;
}

function provenanceFor(
  source: LockSource,
  path: string,
  transformations: string[] = [],
): Provenance {
  return {
    source: source.id as Provenance["source"],
    repo: source.repo,
    commit: source.commit,
    path,
    license: source.license,
    authors: source.authors,
    url: source.url,
    transformations,
  };
}

function sourceUrl(source: LockSource, path = ""): string {
  return path ? `${source.repo}/blob/${source.commit}/${path}` : source.repo;
}

function normalizeBrandKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.com\b/g, "")
    .replace(/\.app\b/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]/g, "")
    .replace(/(19|20)\d{2}$/g, "");
}

const BRAND_DIR_ALIASES: Record<string, string> = {
  cal: "cal",
  "linear.app": "linear",
  runwayml: "runway",
  "x.ai": "xai",
  "opencode.ai": "opencodeai",
  "mistral.ai": "mistralai",
  "together.ai": "togetherai",
};

// A few directories are present in the pinned tree but missing from the
// README's category list. Keep the mapping explicit rather than guessing from
// the design tokens.
const BRAND_CATEGORY_OVERRIDES: Record<string, string> = {
  slack: "Productivity & SaaS",
};

function parseReadmeBrands(markdown: string): Map<string, ReadmeBrand> {
  const brands = new Map<string, ReadmeBrand>();
  let category = "";
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^###\s+(.+?)\s*$/);
    if (heading?.[1]) {
      category = normalizeWhitespace(heading[1]);
      continue;
    }
    const bullet = line.match(/^-\s+\[\*\*(.+?)\*\*\]\([^)]+\)\s*-\s*(.+?)\s*$/);
    if (!bullet?.[1]) continue;
    const name = normalizeWhitespace(bullet[1]);
    const description = normalizeWhitespace(bullet[2] ?? "");
    if (!category || category.toLowerCase() === "how to use") continue;
    brands.set(normalizeBrandKey(name), { name, category, description });
  }
  return brands;
}

function brandDisplayNameFromSlug(slug: string): string {
  return slug
    .split(/[-.]/)
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function catalogEntryFor(pack: Pack): CatalogEntry {
  const metrics: Record<string, string | number | boolean> = {};
  if (pack.kind === "site" && pack.score !== undefined) metrics.score = pack.score;
  if (pack.kind === "type" && pack.typeClass) metrics.typeClass = pack.typeClass;
  if (pack.kind === "app-style") metrics.theme = pack.theme;
  if (pack.kind === "app-pattern" && pack.screen) metrics.screen = pack.screen;
  if (pack.kind === "guideline") {
    metrics.category = pack.category;
    metrics.severity = pack.severity;
  }
  if (pack.kind === "domain") {
    metrics.launchTier = pack.launchTier;
  }
  if (pack.kind === "palette") {
    const ratio = pack.contrast?.["bg-ink"]?.ratio;
    if (ratio !== undefined) metrics.contrastBgInk = ratio;
  }
  return CatalogEntrySchema.parse({
    id: pack.id,
    kind: pack.kind,
    name: pack.name,
    summary: pack.summary,
    domains: pack.domains,
    sectors: pack.sectors,
    tags: pack.tags.slice(0, 24),
    moods: pack.moods,
    quality: pack.quality,
    status: pack.kind === "domain" ? pack.status : undefined,
    depth: pack.kind === "domain" ? pack.depth : undefined,
    source: pack.provenance.source,
    sourceUrl: pack.sourceUrl,
    metrics: Object.keys(metrics).length > 0 ? metrics : undefined,
  });
}

function validatePack(pack: Pack): Pack {
  const parsed = PackSchema.parse(pack);
  return parsed as Pack;
}

function validateDomainRefs(pack: Pack, domainIds: Set<string>, warnings: string[]): void {
  for (const domain of pack.domains) {
    if (!domainIds.has(domain)) {
      warnings.push(`${pack.id} references unknown domain ${domain}`);
    }
  }
}

function validateSeedPlaybook(
  domain: DomainPack,
  directionIds: Set<string>,
  paletteIds: Set<string>,
  warnings: string[],
): void {
  if (!domain.playbook) return;
  for (const direction of domain.playbook.recommendedDirections) {
    if (!directionIds.has(`direction/${direction}`)) {
      warnings.push(`${domain.id} recommends unknown direction ${direction}`);
    }
  }
  for (const palette of domain.playbook.recommendedPalettes) {
    if (!paletteIds.has(`palette/${palette}`)) {
      warnings.push(`${domain.id} recommends unknown palette ${palette}`);
    }
  }
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value.endsWith("\n") ? value : `${value}\n`, "utf8");
}

function countBy<T>(items: readonly T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const value = key(item);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function sortPacks(packs: Pack[]): Pack[] {
  return packs.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.name.localeCompare(b.name);
  });
}

async function fetchLicense(
  source: LockSource,
  options: IngestOptions,
  contentDir: string,
): Promise<string> {
  const text = await fetchCached(source.licenseUrl, sourceCacheKey(source, "LICENSE"), options);
  const licensePath = join(contentDir, "sources", "licenses", `${source.id}.txt`);
  await writeText(licensePath, text);
  return `sources/licenses/${source.id}.txt`;
}

async function fetchTasteSource(
  source: LockSource,
  options: IngestOptions,
  contentDir: string,
): Promise<{ packs: Pack[]; references: ReferencePack[]; sourceInfo: SourceInfo }> {
  const files = {
    directions: source.paths.directions!,
    palettes: source.paths.palettes!,
    types: source.paths.types!,
    heroes: source.paths.heroes!,
    sections: source.paths.sections!,
    motions: source.paths.motions!,
    sites: source.paths.sites!,
    photos: source.paths.photos!,
    app: source.paths.app!,
  };
  const loaded: Record<string, unknown> = {};
  for (const [key, path] of Object.entries(files)) {
    loaded[key] = await fetchJsonCached(
      lockUrl(source, path),
      sourceCacheKey(source, path),
      options,
    );
  }
  const library = parseTasteLibrary(
    {
      directions: loaded.directions as unknown[],
      palettes: loaded.palettes as unknown[],
      types: loaded.types as unknown[],
      heroes: loaded.heroes as unknown[],
      sections: loaded.sections as unknown[],
      motions: loaded.motions as unknown[],
      sites: loaded.sites as unknown[],
      app: loaded.app as Record<string, unknown>,
      photos: loaded.photos as Record<string, unknown>,
    },
    (path, transformations) => provenanceFor(source, path, transformations),
  );

  const referenceFiles: Array<{ file: string; slug: string; useFor: string[] }> = [
    {
      file: "skills/taste-skill/SKILL.md",
      slug: "skill",
      useFor: ["workflow", "design-direction", "audit"],
    },
    { file: "skills/taste-skill/references/type.md", slug: "type", useFor: ["typography"] },
    {
      file: "skills/taste-skill/references/colour.md",
      slug: "colour",
      useFor: ["palette", "colour"],
    },
    { file: "skills/taste-skill/references/layout.md", slug: "layout", useFor: ["layout"] },
    { file: "skills/taste-skill/references/motion.md", slug: "motion", useFor: ["motion"] },
    { file: "skills/taste-skill/references/copy.md", slug: "copy", useFor: ["copy"] },
    { file: "skills/taste-skill/references/imagery.md", slug: "imagery", useFor: ["imagery"] },
    {
      file: "skills/taste-skill/references/critique.md",
      slug: "critique",
      useFor: ["audit", "critique"],
    },
    {
      file: "skills/taste-skill/references/tells.md",
      slug: "tells",
      useFor: ["audit", "anti-patterns"],
    },
    { file: "skills/taste-skill/references/research.md", slug: "research", useFor: ["research"] },
    {
      file: "skills/taste-skill/references/scenes.md",
      slug: "scenes",
      useFor: ["imagery", "art-direction"],
    },
    {
      file: "skills/taste-skill/references/app-screens.md",
      slug: "app-screens",
      useFor: ["app-screens", "product-surfaces"],
    },
  ];
  const references: ReferencePack[] = [...library.references];
  for (const reference of referenceFiles) {
    const body = await fetchCached(
      lockUrl(source, reference.file),
      sourceCacheKey(source, reference.file),
      options,
    );
    references.push(
      parseReference({
        slug: reference.slug,
        body,
        bodyPath: `references/taste-skill/${reference.slug}.md`,
        useFor: reference.useFor,
        source: "taste-skill",
        quality: "verified",
        sourceUrl: sourceUrl(source, reference.file),
        provenance: provenanceFor(source, reference.file),
      }),
    );
  }

  const packs: Pack[] = [
    ...library.directions,
    ...library.palettes,
    ...library.types,
    ...library.heroes,
    ...library.sections,
    ...library.motions,
    ...library.sites,
    ...library.appStyles,
    ...library.appShells,
    ...library.appPatterns,
  ];
  const licenseFile = await fetchLicense(source, options, contentDir);
  return {
    packs,
    references,
    sourceInfo: {
      id: "taste-skill",
      name: source.name,
      repo: source.repo,
      commit: source.commit,
      license: source.license,
      licenseFile,
      authors: source.authors,
      url: source.url,
      retrievedAt: new Date().toISOString(),
      notes: source.notes,
      paths: source.paths,
      counts: countBy(packs, (pack) => pack.kind),
    },
  };
}

async function fetchAwesomeDesignMd(
  source: LockSource,
  options: IngestOptions,
  contentDir: string,
): Promise<{ packs: Pack[]; sourceInfo: SourceInfo; warnings: string[] }> {
  const warnings: string[] = [];
  const tree = await fetchJsonCached<{ tree: Array<{ path: string; type: string }> }>(
    githubTreeUrl(source),
    sourceCacheKey(source, "tree.json"),
    options,
  );
  const designPaths = tree.tree
    .map((entry) => entry.path)
    .filter((path) => /^design-md\/[^/]+\/DESIGN\.md$/.test(path))
    .sort();
  const readme = await fetchCached(
    lockUrl(source, source.paths.readme ?? "README.md"),
    sourceCacheKey(source, "README.md"),
    options,
  );
  const readmeBrands = parseReadmeBrands(readme);
  const slugs = designPaths.map((path) => path.split("/")[1]!);

  const packs = await mapLimit(slugs, 8, async (slug) => {
    const path = `design-md/${slug}/DESIGN.md`;
    const raw = await fetchCached(lockUrl(source, path), sourceCacheKey(source, path), options);
    const readmeKey = normalizeBrandKey(BRAND_DIR_ALIASES[slug] ?? slug);
    const readmeBrand = readmeBrands.get(readmeKey);
    const displayName = readmeBrand?.name ?? brandDisplayNameFromSlug(slug);
    const category = readmeBrand?.category ?? BRAND_CATEGORY_OVERRIDES[slug] ?? "Uncategorized";
    if (!readmeBrand && !BRAND_CATEGORY_OVERRIDES[slug]) {
      warnings.push(`No README category found for brand ${slug}`);
    }
    const domains = mapBrandCategory(category);
    const pack = parseDesignMarkdown(raw, {
      id: `brand/${slug}`,
      slug,
      displayName,
      category,
      provenance: provenanceFor(source, path),
      domains,
      sectors: [],
      sourceUrl: `https://getdesign.md/${slug}/design-md`,
      readmePath: `design-md/${slug}/README.md`,
    });
    if (pack.unresolvedTokens.length > 0) {
      warnings.push(`${pack.id} has unresolved tokens: ${pack.unresolvedTokens.join(", ")}`);
    }
    if (pack.contrastIssues.length > 0) {
      warnings.push(`${pack.id} contrast: ${pack.contrastIssues.join("; ")}`);
    }
    return pack;
  });

  const licenseFile = await fetchLicense(source, options, contentDir);
  return {
    packs,
    warnings,
    sourceInfo: {
      id: "awesome-design-md",
      name: source.name,
      repo: source.repo,
      commit: source.commit,
      license: source.license,
      licenseFile,
      authors: source.authors,
      url: source.url,
      retrievedAt: new Date().toISOString(),
      notes: source.notes,
      paths: source.paths,
      counts: { brand: packs.length },
    },
  };
}

async function fetchGuidelines(
  source: LockSource,
  options: IngestOptions,
  contentDir: string,
): Promise<{ packs: Pack[]; references: ReferencePack[]; sourceInfo: SourceInfo }> {
  const markdown = await fetchCached(
    lockUrl(source, source.paths.rules ?? "command.md"),
    sourceCacheKey(source, "command.md"),
    options,
  );
  const provenance = provenanceFor(source, source.paths.rules ?? "command.md");
  const rules = parseGuidelines(markdown, provenance);
  const agents = await fetchCached(
    lockUrl(source, source.paths.agents ?? "AGENTS.md"),
    sourceCacheKey(source, "AGENTS.md"),
    options,
  );
  const references = [
    parseReference({
      slug: "agents",
      body: agents,
      bodyPath: "references/web-interface-guidelines/agents.md",
      useFor: ["agent-instructions", "audit"],
      source: "web-interface-guidelines",
      quality: "reference",
      sourceUrl: sourceUrl(source, source.paths.agents ?? "AGENTS.md"),
      provenance: provenanceFor(source, source.paths.agents ?? "AGENTS.md"),
    }),
  ];
  const licenseFile = await fetchLicense(source, options, contentDir);
  return {
    packs: rules,
    references,
    sourceInfo: {
      id: "web-interface-guidelines",
      name: source.name,
      repo: source.repo,
      commit: source.commit,
      license: source.license,
      licenseFile,
      authors: source.authors,
      url: source.url,
      retrievedAt: new Date().toISOString(),
      notes: source.notes,
      paths: source.paths,
      counts: { guideline: rules.length, reference: references.length },
    },
  };
}

async function fetchPlaywright(
  source: LockSource,
  options: IngestOptions,
  contentDir: string,
): Promise<{ packs: Pack[]; references: ReferencePack[]; sourceInfo: SourceInfo }> {
  const tree = await fetchJsonCached<{ tree: Array<{ path: string; type: string }> }>(
    githubTreeUrl(source),
    sourceCacheKey(source, "tree.json"),
    options,
  );
  const paths = tree.tree
    .map((entry) => entry.path)
    .filter(
      (path) =>
        path === "skills/playwright-cli/SKILL.md" ||
        /^skills\/playwright-cli\/references\/[^/]+\.md$/.test(path),
    )
    .sort();
  const references: ReferencePack[] = [];
  for (const path of paths) {
    const slug = path.endsWith("SKILL.md")
      ? "skill"
      : slugify(path.split("/").pop()?.replace(/\.md$/, "") ?? path);
    const body = await fetchCached(lockUrl(source, path), sourceCacheKey(source, path), options);
    references.push(
      parseReference({
        slug,
        body,
        bodyPath: `references/playwright-cli/${slug}.md`,
        useFor: ["browser-audit", "playwright"],
        source: "playwright-cli",
        quality: "reference",
        sourceUrl: sourceUrl(source, path),
        provenance: provenanceFor(source, path),
      }),
    );
  }
  const licenseFile = await fetchLicense(source, options, contentDir);
  return {
    packs: [],
    references,
    sourceInfo: {
      id: "playwright-cli",
      name: source.name,
      repo: source.repo,
      commit: source.commit,
      license: source.license,
      licenseFile,
      authors: source.authors,
      url: source.url,
      retrievedAt: new Date().toISOString(),
      notes: source.notes,
      paths: source.paths,
      counts: { reference: references.length },
    },
  };
}

async function buildDomains(
  contentDir: string,
): Promise<{ packs: DomainPack[]; warnings: string[] }> {
  const warnings: string[] = [];
  const taxonomyPath = join(contentDir, "taxonomy", "domains.json");
  const taxonomy = await readJson<Array<Record<string, unknown>>>(taxonomyPath);
  let seed: Record<string, Record<string, unknown>> = {};
  try {
    seed = await readJson<Record<string, Record<string, unknown>>>(
      join(contentDir, "domains", "seed.json"),
    );
  } catch {
    warnings.push("content/domains/seed.json not found; serving taxonomy-only domains");
  }
  const packs = taxonomy.map((entry) => {
    const id = String(entry.id);
    const playbook = seed[id];
    const status = playbook
      ? "available"
      : ((entry.status as "available" | "planned") ?? "planned");
    const depth = playbook
      ? "seed"
      : ((entry.depth as "taxonomy" | "seed" | "playbook") ?? "taxonomy");
    return DomainPackSchema.parse({
      id: `domain/${id}`,
      kind: "domain",
      name: String(entry.name),
      summary: String(entry.description),
      domains: [id],
      sectors: Array.isArray(entry.upstreamSectors) ? entry.upstreamSectors.map(String) : [],
      tags: uniqueStrings([
        "domain",
        String(entry.family ?? ""),
        ...(Array.isArray(entry.aliases) ? entry.aliases.map(String) : []),
      ]).slice(0, 24),
      moods: inferMoods(String(entry.description ?? "")),
      quality: playbook ? "verified" : "reference",
      provenance: {
        source: "tastepro",
        repo: "",
        commit: "workspace",
        path: "content/taxonomy/domains.json",
        license: "Apache-2.0",
        authors: ["TastePro"],
        url: "",
        transformations: playbook
          ? ["curated taxonomy", "authored seed playbook"]
          : ["curated taxonomy"],
      },
      family: String(entry.family ?? ""),
      description: String(entry.description ?? ""),
      aliases: Array.isArray(entry.aliases) ? entry.aliases.map(String) : [],
      status,
      depth,
      launchTier: Boolean(entry.launchTier),
      upstreamSectors: Array.isArray(entry.upstreamSectors)
        ? entry.upstreamSectors.map(String)
        : [],
      appKinds: Array.isArray(entry.appKinds) ? entry.appKinds.map(String) : [],
      brandCategories: Array.isArray(entry.brandCategories)
        ? entry.brandCategories.map(String)
        : [],
      questions: Array.isArray(entry.questions) ? entry.questions.map(String) : [],
      playbook: playbook
        ? {
            ...playbook,
            questions: Array.isArray(playbook.questions)
              ? playbook.questions
              : Array.isArray(entry.questions)
                ? entry.questions
                : [],
          }
        : undefined,
    });
  });
  return { packs, warnings };
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("tastepro-ingest")
    .description("Fetch pinned upstream sources and build the TastePro content catalog.")
    .option("--content-dir <dir>", "content directory", DEFAULT_CONTENT_DIR)
    .option("--cache-dir <dir>", "source cache directory", DEFAULT_CACHE_DIR)
    .option("--offline", "use the local source cache only", false)
    .option("--refresh", "ignore the local source cache and re-fetch", false)
    .parse(process.argv);
  const raw = program.opts<{
    contentDir: string;
    cacheDir: string;
    offline: boolean;
    refresh: boolean;
  }>();
  const options: IngestOptions = {
    contentDir: resolve(raw.contentDir),
    cacheDir: resolve(raw.cacheDir),
    offline: raw.offline,
    refresh: raw.refresh,
  };

  const lock = await loadSourceLock(options.contentDir, ROOT);
  const byId = new Map(lock.sources.map((source) => [source.id, source]));
  const required = [
    "taste-skill",
    "awesome-design-md",
    "web-interface-guidelines",
    "playwright-cli",
  ];
  for (const id of required) {
    if (!byId.has(id)) throw new Error(`sources.lock.json is missing ${id}`);
  }

  const staging = await prepareStaging(options.contentDir);
  try {
    console.error("Ingesting pinned sources…");
    const taste = await fetchTasteSource(byId.get("taste-skill")!, options, staging);
    const brands = await fetchAwesomeDesignMd(byId.get("awesome-design-md")!, options, staging);
    const guidelines = await fetchGuidelines(
      byId.get("web-interface-guidelines")!,
      options,
      staging,
    );
    const playwright = await fetchPlaywright(byId.get("playwright-cli")!, options, staging);
    const domains = await buildDomains(options.contentDir);

    const warnings = [...brands.warnings, ...domains.warnings];
    const allPacks: Pack[] = sortPacks([
      ...taste.packs,
      ...brands.packs,
      ...guidelines.packs,
      ...domains.packs,
    ]);
    const references: ReferencePack[] = sortPacks([
      ...taste.references,
      ...guidelines.references,
      ...playwright.references,
    ]) as ReferencePack[];

    const domainIds = new Set(domains.packs.map((pack) => pack.id.replace(/^domain\//, "")));
    const directionIds = new Set(
      allPacks.filter((pack) => pack.kind === "direction").map((pack) => pack.id),
    );
    const paletteIds = new Set(
      allPacks.filter((pack) => pack.kind === "palette").map((pack) => pack.id),
    );
    for (const pack of allPacks) validateDomainRefs(pack, domainIds, warnings);
    for (const domain of domains.packs) {
      validateSeedPlaybook(domain, directionIds, paletteIds, warnings);
    }

    const parsedPacks = allPacks.map(validatePack);
    const parsedReferences = references.map((reference) =>
      ReferencePackSchema.parse(reference),
    ) as ReferencePack[];
    const allContent: Pack[] = [...parsedPacks, ...parsedReferences];
    const ids = new Set<string>();
    for (const pack of allContent) {
      if (ids.has(pack.id)) throw new Error(`Duplicate content id: ${pack.id}`);
      ids.add(pack.id);
    }

    const byKind = new Map<ContentKind, Pack[]>();
    for (const pack of allContent) {
      const list = byKind.get(pack.kind) ?? [];
      list.push(pack);
      byKind.set(pack.kind, list);
    }

    const generatedKinds = join(staging, "generated", "kinds");
    await mkdir(generatedKinds, { recursive: true });
    for (const [kind, fileName] of Object.entries(KIND_FILE_NAMES) as Array<
      [ContentKind, string]
    >) {
      await writeJson(join(generatedKinds, fileName), byKind.get(kind) ?? []);
    }

    // Reference bodies are also written as readable Markdown so a human can review
    // them and a future resource handler can stream them without JSON parsing.
    for (const reference of parsedReferences) {
      const bodyPath = reference.bodyPath.replace(/^content\//, "");
      await writeText(join(staging, bodyPath), reference.body);
    }

    const catalog = allContent.map(catalogEntryFor).sort((a, b) => {
      const order = [
        "domain",
        "direction",
        "brand",
        "site",
        "palette",
        "type",
        "hero",
        "section",
        "motion",
        "app-style",
        "app-shell",
        "app-pattern",
        "guideline",
        "reference",
      ];
      const byKindOrder = order.indexOf(a.kind) - order.indexOf(b.kind);
      if (byKindOrder !== 0) return byKindOrder;
      return a.name.localeCompare(b.name);
    });
    await writeJson(join(staging, "generated", "catalog.json"), catalog);

    const sourceInfos: SourceInfo[] = [
      taste.sourceInfo,
      brands.sourceInfo,
      guidelines.sourceInfo,
      playwright.sourceInfo,
    ];
    const counts = countBy(allContent, (pack) => pack.kind);
    const quality = countBy(allContent, (pack) => pack.quality);
    await writeJson(join(staging, "generated", "sources.json"), sourceInfos);
    await writeJson(join(staging, "sources.lock.json"), lock);

    const contentHash = await computeContentHash(staging, lock.sources);
    const stats: Stats = {
      version: 1,
      generatedAt: new Date().toISOString(),
      contentHash,
      catalogEntries: catalog.length,
      counts,
      quality,
      sources: sourceInfos,
      warnings,
    };
    await writeJson(join(staging, "generated", "stats.json"), stats);

    await commitSnapshot(options.contentDir, staging, validateContent);

    console.error(
      `Wrote ${catalog.length} catalog entries across ${Object.keys(counts).length} kinds.`,
    );
    if (warnings.length > 0) {
      console.error(`Warnings (${warnings.length}):`);
      for (const warning of warnings.slice(0, 30)) console.error(`  - ${warning}`);
      if (warnings.length > 30) console.error(`  …and ${warnings.length - 30} more`);
    }
    console.error(`Content hash: ${contentHash.slice(0, 16)}…`);
    console.error(
      `Generated: ${relative(ROOT, join(options.contentDir, "generated")) || "content/generated"}`,
    );
  } catch (error) {
    await discardStaging(staging);
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});
