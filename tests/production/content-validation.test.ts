import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ContentLoader, resolveContentDir } from "../../src/core/content/loader.js";
import {
  type BrandPack,
  CONTENT_KINDS,
  type DomainPack,
  type GuidelinePack,
  KIND_FILE_NAMES,
  type ReferencePack,
} from "../../src/core/schema.js";

const contentDir = resolveContentDir();
const loader = new ContentLoader({ contentDir });

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe("committed content", () => {
  it("matches the catalog snapshot", async () => {
    const [catalog, stats] = await Promise.all([loader.catalog(), loader.stats()]);
    expect(catalog).toHaveLength(873);
    expect(stats.catalogEntries).toBe(873);
    expect(stats.counts).toEqual({
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
    });
    expect(stats.quality).toEqual({
      verified: 550,
      reference: 313,
      incomplete: 10,
    });
    expect(stats.contentHash).toHaveLength(64);
    expect(stats.warnings).toHaveLength(29);
    expect(stats.warnings.every((warning) => warning.includes("contrast"))).toBe(true);
  });

  it("recomputes the content hash from the committed catalog", async () => {
    const [catalog, stats, lockRaw] = await Promise.all([
      loader.catalog(),
      loader.stats(),
      readFile(join(contentDir, "sources.lock.json"), "utf8"),
    ]);
    const lock = JSON.parse(lockRaw) as {
      sources: Array<{ id: string; commit: string }>;
    };
    const packs = [];
    for (const kind of CONTENT_KINDS) {
      if (kind === "reference") continue;
      packs.push(...(await loader.packs(kind)));
    }
    packs.sort((a, b) => {
      const byKind = a.kind.localeCompare(b.kind);
      return byKind !== 0 ? byKind : a.name.localeCompare(b.name);
    });
    const references = [...(await loader.packs("reference"))].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const counts: Record<string, number> = {};
    for (const pack of [...packs, ...references]) {
      counts[pack.kind] = (counts[pack.kind] ?? 0) + 1;
    }
    const hash = createHash("sha256")
      .update(
        JSON.stringify({
          catalog,
          counts,
          commits: lock.sources.map((source) => [source.id, source.commit]),
        }),
      )
      .digest("hex");
    expect(hash).toBe(stats.contentHash);
  });

  it("has unique ids and a matching pack for every catalog entry", async () => {
    const catalog = await loader.catalog();
    expect(new Set(catalog.map((entry) => entry.id)).size).toBe(catalog.length);
    for (const entry of catalog) {
      const pack = await loader.pack(entry.id);
      expect(pack, entry.id).not.toBeNull();
      expect(pack?.kind).toBe(entry.kind);
      expect(pack?.name).toBe(entry.name);
      expect(pack?.summary).toBe(entry.summary);
    }
  });

  it("ships every generated kind file and license", async () => {
    for (const kind of CONTENT_KINDS) {
      const path = join(contentDir, "generated", "kinds", KIND_FILE_NAMES[kind]);
      expect(await fileExists(path), path).toBe(true);
      expect((await stat(path)).size).toBeGreaterThan(0);
    }
    const sources = await loader.sources();
    expect(sources).toHaveLength(4);
    for (const source of sources) {
      const path = join(contentDir, source.licenseFile);
      expect(await fileExists(path), path).toBe(true);
      const license = await readFile(path, "utf8");
      expect(license.length).toBeGreaterThan(100);
      expect(source.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(source.license.length).toBeGreaterThan(0);
    }
  });

  it("ships all reference bodies inside the content directory", async () => {
    const references = (await loader.packs("reference")) as ReferencePack[];
    expect(references).toHaveLength(25);
    for (const reference of references) {
      const path = join(contentDir, reference.bodyPath);
      expect(await fileExists(path), reference.bodyPath).toBe(true);
      const body = await readFile(path, "utf8");
      expect(body.length, reference.id).toBeGreaterThan(200);
      expect(reference.headings.length, reference.id).toBeGreaterThan(0);
    }
  });

  it("has 40 domains, 15 launch-tier seed playbooks, and valid recommendations", async () => {
    const domains = (await loader.domains()) as DomainPack[];
    expect(domains).toHaveLength(40);
    expect(domains.filter((domain) => domain.launchTier)).toHaveLength(15);
    expect(domains.filter((domain) => domain.playbook)).toHaveLength(15);

    const directions = new Set((await loader.packs("direction")).map((pack) => pack.id));
    const palettes = new Set((await loader.packs("palette")).map((pack) => pack.id));
    const roles = new Set((await loader.packs("section")).map((pack) => pack.role));

    for (const domain of domains) {
      if (!domain.playbook) {
        expect(domain.status, domain.id).toBe("planned");
        expect(domain.depth, domain.id).toBe("taxonomy");
        continue;
      }
      expect(domain.status, domain.id).toBe("available");
      expect(domain.depth, domain.id).toBe("seed");
      expect(domain.playbook.audience.length, domain.id).toBeGreaterThan(2);
      expect(domain.playbook.questions.length, domain.id).toBeGreaterThan(2);
      for (const direction of domain.playbook.recommendedDirections) {
        expect(directions.has(`direction/${direction}`), `${domain.id} ${direction}`).toBe(true);
      }
      for (const palette of domain.playbook.recommendedPalettes) {
        expect(palettes.has(`palette/${palette}`), `${domain.id} ${palette}`).toBe(true);
      }
      for (const section of domain.playbook.recommendedSections) {
        expect(roles.has(section), `${domain.id} ${section}`).toBe(true);
      }
    }
  });

  it("keeps the brand completeness promise", async () => {
    const brands = (await loader.packs("brand")) as BrandPack[];
    expect(brands).toHaveLength(84);
    const incomplete = brands.filter((brand) => brand.quality === "incomplete");
    expect(incomplete).toHaveLength(10);
    for (const brand of incomplete) {
      expect(brand.incompleteReasons.length, brand.id).toBeGreaterThan(0);
    }
    for (const brand of brands.filter((candidate) => candidate.quality !== "incomplete")) {
      expect(Object.keys(brand.colors).length, brand.id).toBeGreaterThanOrEqual(3);
      expect(Object.keys(brand.typography).length, brand.id).toBeGreaterThanOrEqual(2);
      expect(Object.keys(brand.rounded).length, brand.id).toBeGreaterThan(0);
      expect(Object.keys(brand.spacing).length, brand.id).toBeGreaterThan(0);
      expect(Object.keys(brand.components).length, brand.id).toBeGreaterThan(0);
      expect(brand.unresolvedTokens, brand.id).toEqual([]);
    }
  });

  it("keeps the guideline rubric complete and cited", async () => {
    const guidelines = (await loader.packs("guideline")) as GuidelinePack[];
    expect(guidelines).toHaveLength(104);
    expect(guidelines.filter((rule) => rule.severity === "error")).toHaveLength(22);
    expect(guidelines.filter((rule) => rule.severity === "warn")).toHaveLength(82);
    expect(new Set(guidelines.map((rule) => rule.category)).size).toBe(17);
    for (const rule of guidelines) {
      expect(rule.text.length, rule.id).toBeGreaterThan(0);
      expect(rule.category.length, rule.id).toBeGreaterThan(0);
      expect(rule.sourcePath.length, rule.id).toBeGreaterThan(0);
      expect(rule.line, rule.id).toBeGreaterThan(0);
      expect(rule.provenance.commit, rule.id).toHaveLength(40);
    }
  });

  it("does not ship third-party screenshots, logos, or binary assets", async () => {
    const offenders: string[] = [];
    async function walk(dir: string): Promise<void> {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(path);
        } else if (/\.(png|jpe?g|gif|webp|avif|ico|svg|pdf|woff2?|ttf|otf)$/i.test(entry.name)) {
          offenders.push(path);
        }
      }
    }
    await walk(join(contentDir, "generated"));
    await walk(join(contentDir, "references"));
    expect(offenders).toEqual([]);
  });

  it("has a readable sources lock and attribution inputs", async () => {
    const lock = JSON.parse(await readFile(join(contentDir, "sources.lock.json"), "utf8")) as {
      sources: Array<{ id: string; commit: string; license: string }>;
    };
    expect(lock.sources.map((source) => source.id)).toEqual([
      "taste-skill",
      "awesome-design-md",
      "web-interface-guidelines",
      "playwright-cli",
    ]);
    for (const source of lock.sources) {
      expect(source.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(source.license.length).toBeGreaterThan(0);
    }
  });
});
