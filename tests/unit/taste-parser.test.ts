import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseReference, parseTasteLibrary } from "../../scripts/lib/taste.js";
import type { Provenance } from "../../src/core/schema.js";

function readJson<T>(path: string): T {
  return JSON.parse(
    readFileSync(new URL(`../../.cache/research/taste-skill/${path}`, import.meta.url), "utf8"),
  ) as T;
}

const provenance = (path: string, transformations: string[] = []): Provenance => ({
  source: "taste-skill",
  repo: "https://github.com/Leonxlnx/taste-skill",
  commit: "12af471f627f866411b4bd785b19646d3672784c",
  path,
  license: "MIT",
  authors: ["Leonxlnx"],
  url: "https://github.com/Leonxlnx/taste-skill",
  transformations,
});

const input = {
  directions: readJson<unknown[]>("directions.json"),
  palettes: readJson<unknown[]>("palettes.json"),
  types: readJson<unknown[]>("type.json"),
  heroes: readJson<unknown[]>("heroes.json"),
  sections: readJson<unknown[]>("sections.json"),
  motions: readJson<unknown[]>("motions.json"),
  sites: readJson<unknown[]>("sites.json"),
  app: readJson<Record<string, unknown>>("app.json"),
  photos: readJson<Record<string, unknown>>("photos.json"),
};

describe("taste-skill parser", () => {
  const result = parseTasteLibrary(input, provenance);

  it("parses every upstream library", () => {
    expect(result.directions).toHaveLength(20);
    expect(result.palettes).toHaveLength(56);
    expect(result.types).toHaveLength(44);
    expect(result.heroes).toHaveLength(58);
    expect(result.sections).toHaveLength(185);
    expect(result.motions).toHaveLength(18);
    expect(result.sites).toHaveLength(202);
    expect(result.appStyles).toHaveLength(7);
    expect(result.appShells).toHaveLength(5);
    expect(result.appPatterns).toHaveLength(25);
    expect(result.warnings).toEqual([]);
  });

  it("uses stable public ids", () => {
    expect(result.directions[0]?.id).toBe("direction/name-as-monument");
    expect(result.palettes[0]?.id).toBe("palette/white-link-blue");
    expect(result.types[0]?.id).toBe("type/switzer-semibold");
    expect(result.heroes[0]?.id).toBe("hero/name-under-photograph");
    expect(result.sections[0]?.id).toBe("section/features-capabilities-at-poster-scale");
    expect(result.motions[0]?.id).toBe("motion/masked-headline");
    expect(result.sites[0]?.id).toBe("site/aww-pp-neue-montreal");
  });

  it("maps upstream sectors to canonical domains", () => {
    const direction = result.directions.find((item) => item.id === "direction/name-as-monument");
    expect(direction?.domains).toEqual(
      expect.arrayContaining([
        "creative-agencies",
        "portfolios",
        "travel-hospitality",
        "restaurants-food",
        "music",
        "culture-arts",
        "fashion-beauty",
        "events",
        "architecture",
        "real-estate",
        "ecommerce-dtc",
        "productivity",
        "product-surfaces",
      ]),
    );
    const portfolioSite = result.sites.find((site) => site.id === "site/aww-house-of-honey-1");
    expect(portfolioSite?.domains).toContain("creative-agencies");
  });

  it("derives readable summaries and keeps full prose", () => {
    const direction = result.directions[0]!;
    expect(direction.summary.length).toBeGreaterThan(40);
    expect(direction.summary.length).toBeLessThanOrEqual(300);
    expect(direction.idea.length).toBeGreaterThan(direction.summary.length);
    expect(direction.tags.length).toBeGreaterThan(3);
  });

  it("computes palette contrast for core pairs and fields", () => {
    const palette = result.palettes[0]!;
    expect(palette.contrast?.["bg-ink"]?.ratio).toBeGreaterThan(15);
    expect(palette.contrast?.["bg-ink"]?.aaNormal).toBe(true);
    expect(palette.contrast?.["accent-accentInk"]?.ratio).toBeGreaterThan(4);
    expect(palette.contrast?.["field-1"]?.ratio).toBeGreaterThan(15);
  });

  it("marks upstream site studies as references, not verified templates", () => {
    expect(result.sites.every((site) => site.quality === "reference")).toBe(true);
    expect(result.sites[0]?.sourceUrl).toMatch(/^https:\/\//);
    expect(result.sites[0]?.score).toBeGreaterThan(6);
  });

  it("creates a photo reference without bundling images", () => {
    const photoReference = result.references[0]!;
    expect(photoReference.id).toBe("reference/taste-skill-photo-sets");
    expect(photoReference.body).toContain("fog-and-quiet");
    expect(photoReference.body).not.toContain("i.picsum.photos");
    expect(photoReference.domains.length).toBeGreaterThan(10);
  });

  it("parses a markdown reference with headings and use-for tags", () => {
    const body = readFileSync(
      new URL("../../.cache/research/taste-skill/tells.md", import.meta.url),
      "utf8",
    );
    const reference = parseReference({
      slug: "tells",
      body,
      bodyPath: "content/references/taste-skill/tells.md",
      useFor: ["audit", "anti-patterns"],
      source: "taste-skill",
      quality: "verified",
      sourceUrl: "https://github.com/Leonxlnx/taste-skill",
      provenance: provenance("skills/taste-skill/references/tells.md"),
    });
    expect(reference.id).toBe("reference/taste-skill-tells");
    expect(reference.headings.length).toBeGreaterThan(3);
    expect(reference.summary.length).toBeGreaterThan(20);
    expect(reference.tags).toEqual(
      expect.arrayContaining(["reference", "taste-skill", "audit", "anti-patterns"]),
    );
  });
});
