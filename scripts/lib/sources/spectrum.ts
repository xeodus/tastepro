import type { AppPatternPack, Provenance } from "../../../src/core/schema.js";
import { firstSentence, normalizeWhitespace } from "../../../src/core/text.js";
import type { SourceAdapter, SourceContext, SourceResult } from "./types.js";

interface SpectrumEntry {
  slug: string;
  path: string;
  kinds: string[];
  basis: string;
}

const COMPONENTS = [
  "button",
  "card",
  "table",
  "tabs",
  "toast",
  "text-field",
  "checkbox",
  "menu",
  "tooltip",
];

const GUIDELINES = [
  "attention-hierarchy",
  "colors",
  "applying-the-type-system",
  "component-spacing",
  "cognitive",
];

const ENTRIES: SpectrumEntry[] = [
  ...COMPONENTS.map((slug) => ({
    slug,
    path: `packages/design-data/components/${slug}.json`,
    kinds: ["component", "usage"],
    basis: "component guidance from Adobe Spectrum",
  })),
  ...GUIDELINES.map((slug) => ({
    slug,
    path: `packages/design-data/guidelines/${slug}.json`,
    kinds: ["guideline", "foundation"],
    basis: "foundation guidance from Adobe Spectrum",
  })),
];

interface SpectrumData {
  name?: unknown;
  title?: unknown;
  displayName?: unknown;
  description?: unknown;
  category?: unknown;
  sourceUrl?: unknown;
  meta?: { documentationUrl?: unknown; category?: unknown };
  documentBlocks?: Array<{ type?: unknown; content?: unknown }>;
}

function str(value: unknown): string {
  return typeof value === "string" ? normalizeWhitespace(value) : "";
}

export function parseSpectrumEntry(
  data: SpectrumData,
  provenance: Provenance,
  fallbackUrl: string,
  meta: SpectrumEntry,
): AppPatternPack {
  const name = str(data.displayName) || str(data.title) || str(data.name) || meta.slug;
  const description = str(data.description);
  const blocks = (data.documentBlocks ?? [])
    .filter((block) => block.type === "purpose" || block.type === "guideline")
    .map((block) => str(block.content))
    .filter(Boolean);
  const blueprint = [description, ...blocks].filter(Boolean).join("\n\n");
  if (blueprint.length < 300) {
    throw new Error(
      `Spectrum entry ${meta.slug} has too little guidance (${blueprint.length} chars)`,
    );
  }
  const sourceUrl = str(data.meta?.documentationUrl) || str(data.sourceUrl) || fallbackUrl;
  const category = str(data.category) || str(data.meta?.category);
  return {
    id: `app-pattern/spectrum-${meta.slug}`,
    kind: "app-pattern",
    name,
    summary: description || firstSentence(blueprint, 240),
    domains: ["b2b-saas", "product-surfaces", "data-analytics", "developer-tools"],
    sectors: ["enterprise"],
    tags: ["spectrum", ...meta.kinds, category, meta.slug].filter(Boolean),
    moods: [],
    quality: "verified",
    provenance,
    sourceUrl,
    screen: meta.slug,
    kinds: meta.kinds,
    basis: meta.basis,
    blueprint,
    phone: "",
  };
}

export const spectrumAdapter: SourceAdapter = {
  id: "spectrum",
  async fetch(context: SourceContext): Promise<SourceResult> {
    const packs: AppPatternPack[] = [];
    for (const meta of ENTRIES) {
      const data = await context.fetchJson<SpectrumData>(meta.path);
      packs.push(
        parseSpectrumEntry(
          data,
          context.provenance(meta.path, [
            "flattened Spectrum documentBlocks into guidance text",
            "dropped images, tables, and token references",
          ]),
          `https://spectrum.adobe.com/page/${meta.slug}/`,
          meta,
        ),
      );
    }
    const licenseFile = await context.writeLicense();
    return {
      packs,
      references: [],
      warnings: [],
      sourceInfo: {
        id: "spectrum",
        name: context.source.name,
        repo: context.source.repo,
        commit: context.source.commit,
        license: context.source.license,
        licenseFile,
        authors: context.source.authors,
        url: context.source.url,
        retrievedAt: new Date().toISOString(),
        notes: context.source.notes,
        paths: context.source.paths,
        counts: { "app-pattern": packs.length },
      },
    };
  },
};
