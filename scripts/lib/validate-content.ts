import { access, readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { ContentLoader } from "../../src/core/content/loader.js";
import {
  type BrandPack,
  CONTENT_KINDS,
  type ContentKind,
  type DomainPack,
  type GuidelinePack,
  KIND_FILE_NAMES,
  type Pack,
  type ReferencePack,
} from "../../src/core/schema.js";
import { computeContentHash } from "./content-hash.js";
import type { SourceLock } from "./source-lock.js";

const EXPECTED_COUNTS: Record<ContentKind, number> = {
  "app-pattern": 25,
  "app-shell": 5,
  "app-style": 7,
  brand: 84,
  direction: 20,
  domain: 40,
  guideline: 104,
  hero: 58,
  motion: 18,
  palette: 56,
  reference: 25,
  section: 185,
  site: 202,
  type: 44,
};

const EXPECTED_SOURCES = [
  "taste-skill",
  "awesome-design-md",
  "web-interface-guidelines",
  "playwright-cli",
] as const;

const errors: string[] = [];
const warnings: string[] = [];

function error(message: string): void {
  errors.push(message);
}

function warn(message: string): void {
  warnings.push(message);
}

function check(condition: unknown, message: string): void {
  if (!condition) error(message);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function assertSafeRelativePath(contentDir: string, path: string, label: string): void {
  if (!path) {
    error(`${label}: empty path`);
    return;
  }
  if (isAbsolute(path)) {
    error(`${label}: absolute path is not allowed (${path})`);
    return;
  }
  const absolute = resolve(contentDir, path);
  const relativePath = relative(contentDir, absolute);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    error(`${label}: path escapes the content directory (${path})`);
  }
}

function validatePackIdentity(pack: Pack): void {
  const prefix = pack.id.split("/")[0];
  check(
    pack.id.startsWith(`${pack.kind}/`),
    `${pack.id}: id prefix does not match kind ${pack.kind}`,
  );
  check(
    (CONTENT_KINDS as readonly string[]).includes(prefix ?? ""),
    `${pack.id}: unknown id prefix ${prefix}`,
  );
  check(pack.name.trim().length > 0, `${pack.id}: empty name`);
  check(pack.summary.trim().length > 0, `${pack.id}: empty summary`);
  check(pack.provenance.license.trim().length > 0, `${pack.id}: empty provenance license`);
  if (pack.provenance.source === "tastepro") {
    check(
      pack.provenance.repo === "" || pack.provenance.repo.startsWith("https://github.com/"),
      `${pack.id}: invalid original-content repo`,
    );
    check(
      pack.provenance.commit === "workspace",
      `${pack.id}: original content must use the workspace commit marker`,
    );
  } else {
    check(pack.provenance.repo.startsWith("https://github.com/"), `${pack.id}: invalid repo`);
    check(/^[0-9a-f]{40}$/.test(pack.provenance.commit), `${pack.id}: invalid commit`);
  }
  check(pack.provenance.path.trim().length > 0, `${pack.id}: empty provenance path`);
  check(
    pack.domains.every((domain) => domain.trim().length > 0),
    `${pack.id}: empty domain id`,
  );
}

function validateBrand(pack: BrandPack): void {
  if (pack.quality === "incomplete") {
    check(pack.incompleteReasons.length > 0, `${pack.id}: incomplete brand must explain why`);
    return;
  }
  check(pack.description.trim().length >= 20, `${pack.id}: thin brand description`);
  check(
    Object.keys(pack.colors).length >= 3,
    `${pack.id}: complete brand has fewer than three colors`,
  );
  check(
    Object.keys(pack.typography).length >= 2,
    `${pack.id}: complete brand has fewer than two typography tokens`,
  );
  check(Object.keys(pack.rounded).length > 0, `${pack.id}: complete brand has no rounded tokens`);
  check(Object.keys(pack.spacing).length > 0, `${pack.id}: complete brand has no spacing tokens`);
  check(
    Object.keys(pack.components).length > 0,
    `${pack.id}: complete brand has no component tokens`,
  );
  check(pack.unresolvedTokens.length === 0, `${pack.id}: unresolved tokens remain`);
}

function validateDomain(
  domain: DomainPack,
  directionIds: Set<string>,
  paletteIds: Set<string>,
  sectionRoles: Set<string>,
): void {
  check(domain.aliases.length > 0, `${domain.id}: no aliases`);
  check(domain.family.trim().length > 0, `${domain.id}: no family`);
  check(domain.questions.length > 0, `${domain.id}: no questions`);
  if (domain.launchTier) {
    check(domain.status === "available", `${domain.id}: launch-tier domain is not available`);
    check(domain.depth !== "taxonomy", `${domain.id}: launch-tier domain has no playbook`);
  }
  if (domain.depth === "taxonomy") {
    check(domain.status === "planned", `${domain.id}: taxonomy domain should be planned`);
  }
  if (!domain.playbook) {
    if (domain.launchTier) error(`${domain.id}: launch-tier domain is missing a playbook`);
    return;
  }
  const playbook = domain.playbook;
  for (const key of [
    "audience",
    "jobs",
    "trust",
    "informationArchitecture",
    "contentChecklist",
    "antiPatterns",
    "signatureMoves",
    "recommendedDirections",
    "recommendedSections",
    "recommendedPalettes",
    "questions",
  ] as const) {
    check(playbook[key].length > 0, `${domain.id}: playbook.${key} is empty`);
  }
  check(playbook.conversion.trim().length > 20, `${domain.id}: conversion is thin`);
  check(playbook.liveThing.trim().length > 0, `${domain.id}: liveThing is empty`);
  for (const direction of playbook.recommendedDirections) {
    check(
      directionIds.has(`direction/${direction}`),
      `${domain.id}: unknown recommended direction ${direction}`,
    );
  }
  for (const palette of playbook.recommendedPalettes) {
    check(
      paletteIds.has(`palette/${palette}`),
      `${domain.id}: unknown recommended palette ${palette}`,
    );
  }
  for (const section of playbook.recommendedSections) {
    check(sectionRoles.has(section), `${domain.id}: unknown recommended section role ${section}`);
  }
}

export interface ValidationReport {
  errors: string[];
  warnings: string[];
}

/**
 * Validate a complete content directory. Intended for release-time use; the
 * module-level report makes this sequential rather than re-entrant.
 */
export async function validateContent(contentDir: string): Promise<ValidationReport> {
  errors.length = 0;
  warnings.length = 0;
  const loader = new ContentLoader({ contentDir });
  const stats = await loader.stats();
  const catalog = await loader.catalog();
  const sources = await loader.sources();
  const allPacks: Pack[] = [];
  for (const kind of CONTENT_KINDS) {
    allPacks.push(...(await loader.packs(kind)));
  }

  check(
    stats.catalogEntries === catalog.length,
    `stats.catalogEntries is ${stats.catalogEntries}, catalog has ${catalog.length}`,
  );
  check(
    new Set(catalog.map((entry) => entry.id)).size === catalog.length,
    "catalog contains duplicate ids",
  );
  check(
    new Set(allPacks.map((pack) => pack.id)).size === allPacks.length,
    "content contains duplicate ids",
  );

  const catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
  const packById = new Map(allPacks.map((pack) => [pack.id, pack]));
  for (const entry of catalog) {
    const pack = packById.get(entry.id);
    check(Boolean(pack), `catalog entry ${entry.id} has no pack`);
    if (!pack) continue;
    check(entry.kind === pack.kind, `${entry.id}: catalog/pack kind mismatch`);
    check(entry.name === pack.name, `${entry.id}: catalog/pack name mismatch`);
    check(entry.quality === pack.quality, `${entry.id}: catalog/pack quality mismatch`);
    check(entry.summary === pack.summary, `${entry.id}: catalog/pack summary mismatch`);
  }
  for (const pack of allPacks) {
    check(Boolean(catalogById.get(pack.id)), `pack ${pack.id} is missing from the catalog`);
    validatePackIdentity(pack);
  }

  const computedCounts: Record<string, number> = {};
  for (const kind of CONTENT_KINDS) {
    computedCounts[kind] = allPacks.filter((pack) => pack.kind === kind).length;
  }
  for (const kind of CONTENT_KINDS) {
    check(
      stats.counts[kind] === computedCounts[kind],
      `stats count for ${kind} is ${stats.counts[kind]}, expected ${computedCounts[kind]}`,
    );
    check(
      EXPECTED_COUNTS[kind] === computedCounts[kind],
      `snapshot count for ${kind} is ${computedCounts[kind]}, expected ${EXPECTED_COUNTS[kind]}`,
    );
  }
  check(
    stats.counts.reference === EXPECTED_COUNTS.reference,
    `stats reference count is ${stats.counts.reference}`,
  );

  const computedQuality: Record<string, number> = {};
  for (const pack of allPacks) {
    computedQuality[pack.quality] = (computedQuality[pack.quality] ?? 0) + 1;
  }
  for (const [quality, count] of Object.entries(computedQuality)) {
    check(
      stats.quality[quality] === count,
      `stats quality ${quality} is ${stats.quality[quality]}, expected ${count}`,
    );
  }

  // Recompute the content hash exactly as ingest does, from the served files.
  const lockPath = join(contentDir, "sources.lock.json");
  check(await exists(lockPath), "content/sources.lock.json is missing");
  const lock = await readJson<SourceLock>(lockPath);
  const contentHash = await computeContentHash(contentDir, lock.sources);
  check(
    contentHash === stats.contentHash,
    `content hash mismatch: stats ${stats.contentHash.slice(0, 16)}…, computed ${contentHash.slice(0, 16)}…`,
  );

  // Sources, commits, and licenses.
  check(sources.length === EXPECTED_SOURCES.length, `expected four sources, got ${sources.length}`);
  for (const id of EXPECTED_SOURCES) {
    const source = sources.find((candidate) => candidate.id === id);
    check(Boolean(source), `missing source ${id}`);
    if (!source) continue;
    const locked = lock.sources.find((candidate) => candidate.id === id);
    check(Boolean(locked), `source ${id} is missing from sources.lock.json`);
    if (!locked) continue;
    check(
      source.commit === locked.commit,
      `source ${id} commit ${source.commit} does not match lock ${locked.commit}`,
    );
    check(source.license === locked.license, `source ${id} license mismatch`);
    check(source.repo === locked.repo, `source ${id} repo mismatch`);
    assertSafeRelativePath(contentDir, source.licenseFile, `source ${id} licenseFile`);
    const licensePath = join(contentDir, source.licenseFile);
    check(await exists(licensePath), `source ${id} license file is missing: ${source.licenseFile}`);
    if (await exists(licensePath)) {
      const text = await readFile(licensePath, "utf8");
      check(text.trim().length > 100, `source ${id} license file is suspiciously short`);
    }
  }

  // Reference bodies must exist and stay inside the content directory.
  for (const pack of allPacks) {
    if (pack.kind !== "reference") continue;
    const reference = pack as ReferencePack;
    assertSafeRelativePath(contentDir, reference.bodyPath, `${reference.id} bodyPath`);
    const path = join(contentDir, reference.bodyPath);
    check(await exists(path), `${reference.id}: missing reference body ${reference.bodyPath}`);
    if (!(await exists(path))) continue;
    const body = await readFile(path, "utf8");
    check(body.trim().length > 200, `${reference.id}: reference body is too short`);
    check(reference.headings.length > 0, `${reference.id}: no headings extracted`);
  }

  const domainPacks = (await loader.domains()) as DomainPack[];
  const directionIds = new Set(
    allPacks.filter((pack) => pack.kind === "direction").map((pack) => pack.id),
  );
  const paletteIds = new Set(
    allPacks.filter((pack) => pack.kind === "palette").map((pack) => pack.id),
  );
  const sectionRoles = new Set(
    allPacks.filter((pack) => pack.kind === "section").map((pack) => pack.role),
  );
  check(domainPacks.length === 40, `expected 40 domains, got ${domainPacks.length}`);
  check(
    domainPacks.filter((domain) => domain.playbook).length === 15,
    `expected 15 seed playbooks, got ${domainPacks.filter((domain) => domain.playbook).length}`,
  );
  check(
    domainPacks.filter((domain) => domain.launchTier).length === 15,
    "expected 15 launch-tier domains",
  );
  for (const domain of domainPacks) {
    validateDomain(domain, directionIds, paletteIds, sectionRoles);
  }

  const brands = allPacks.filter((pack) => pack.kind === "brand") as BrandPack[];
  for (const brand of brands) validateBrand(brand);
  check(
    brands.filter((brand) => brand.quality === "incomplete").length === 10,
    "expected exactly 10 incomplete brands",
  );

  const guidelines = allPacks.filter((pack) => pack.kind === "guideline") as GuidelinePack[];
  check(guidelines.length === 104, `expected 104 guidelines, got ${guidelines.length}`);
  for (const rule of guidelines) {
    check(rule.text.trim().length > 0, `${rule.id}: empty guideline text`);
    check(rule.category.trim().length > 0, `${rule.id}: empty guideline category`);
    check(rule.sourcePath.trim().length > 0, `${rule.id}: empty guideline source path`);
    check(rule.line > 0, `${rule.id}: guideline line must be positive`);
  }
  const categories = new Set(guidelines.map((rule) => rule.category));
  check(categories.size >= 15, `expected at least 15 guideline categories, got ${categories.size}`);

  for (const pack of allPacks) {
    if (pack.kind === "site") {
      check(/^https?:\/\//.test(pack.url), `${pack.id}: invalid site url`);
    }
    if (pack.kind === "palette") {
      check(Object.keys(pack.contrast ?? {}).length > 0, `${pack.id}: no contrast checks computed`);
    }
    if (pack.kind === "type") {
      check(Boolean(pack.display?.family), `${pack.id}: missing display face`);
      check(Boolean(pack.text?.family), `${pack.id}: missing text face`);
    }
  }

  const generatedDir = join(contentDir, "generated");
  for (const kind of CONTENT_KINDS) {
    const path = join(generatedDir, "kinds", KIND_FILE_NAMES[kind]);
    check(await exists(path), `missing generated kind file ${path}`);
    const info = await stat(path);
    check(info.size > 0, `empty generated kind file ${path}`);
  }

  // Root and packaged locks must stay in sync.
  const rootLockPath = resolve(dirname(contentDir), "sources.lock.json");
  if (await exists(rootLockPath)) {
    const rootLock = await readJson<SourceLock>(rootLockPath);
    check(
      JSON.stringify(rootLock.sources) === JSON.stringify(lock.sources),
      "root sources.lock.json and content/sources.lock.json differ",
    );
  } else {
    warn("root sources.lock.json is missing; only the packaged lock is present");
  }

  for (const warning of stats.warnings) {
    if (!warning.includes("contrast")) warn(`content warning: ${warning}`);
  }

  return { errors: [...errors], warnings: [...warnings] };
}
