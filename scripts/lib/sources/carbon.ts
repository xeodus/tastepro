import yaml from "js-yaml";
import type { AppPatternPack, Provenance } from "../../../src/core/schema.js";
import { firstSentence, normalizeWhitespace } from "../../../src/core/text.js";
import { htmlToText } from "./html.js";
import type { SourceAdapter, SourceContext, SourceResult } from "./types.js";

interface CarbonPage {
  slug: string;
  path: string;
  url: string;
  kinds: string[];
  domains: string[];
  basis: string;
}

const COMPONENTS = [
  "tabs",
  "dropdown",
  "data-table",
  "modal",
  "form",
  "notification",
  "search",
  "button",
  "checkbox",
  "text-input",
];

const PATTERNS = [
  "empty-states-pattern",
  "loading-pattern",
  "forms-pattern",
  "notification-pattern",
  "filtering",
  "status-indicator-pattern",
  "search-pattern",
  "dialog-pattern",
];

const DATA_VIZ = ["chart-anatomy", "color-palettes", "dashboards", "axes-and-labels", "legends"];

const PAGES: CarbonPage[] = [
  ...COMPONENTS.map((slug) => ({
    slug,
    path: `src/pages/components/${slug}/usage.mdx`,
    url: `https://carbondesignsystem.com/components/${slug}/usage/`,
    kinds: ["component", "usage"],
    domains: ["b2b-saas", "product-surfaces", "data-analytics"],
    basis: "component usage pattern from IBM Carbon",
  })),
  ...PATTERNS.map((slug) => ({
    slug,
    path: `src/pages/patterns/${slug}/index.mdx`,
    url: `https://carbondesignsystem.com/patterns/${slug}/`,
    kinds: ["pattern", "state"],
    domains: ["b2b-saas", "product-surfaces", "data-analytics"],
    basis: "interface pattern from IBM Carbon",
  })),
  ...DATA_VIZ.map((slug) => ({
    slug,
    path: `src/pages/data-visualization/${slug}/index.mdx`,
    url: `https://carbondesignsystem.com/data-visualization/${slug}/`,
    kinds: ["data-viz"],
    domains: ["data-analytics", "b2b-saas"],
    basis: "data-visualization guidance from IBM Carbon",
  })),
];

function splitFrontmatter(markdown: string): { data: Record<string, unknown>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(markdown);
  if (!match) return { data: {}, body: markdown };
  const parsed = yaml.load(match[1] ?? "");
  const data =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  return { data, body: markdown.slice(match[0].length) };
}

function stripMdx(body: string): string {
  const withoutEmbeds = body
    .replace(/^import\s+.*$/gm, "")
    .replace(/<StorybookDemo[\s\S]*?\/>/g, "")
    .replace(/<A11yStatus[\s\S]*?\/>/g, "")
    .replace(/<AnchorLinks>[\s\S]*?<\/AnchorLinks>/g, "")
    .replace(/<Row>/g, "")
    .replace(/<\/Row>/g, "")
    .replace(/<Column[^>]*>/g, "")
    .replace(/<\/Column>/g, "")
    .replace(/<Caption[^>]*>/g, "")
    .replace(/<\/Caption>/g, "")
    .replace(/<PageDescription>/g, "")
    .replace(/<\/PageDescription>/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\{[^}]*\}/g, "");
  return htmlToText(withoutEmbeds);
}

export function parseCarbonPage(
  markdown: string,
  provenance: Provenance,
  sourceUrl: string,
  meta: CarbonPage,
): AppPatternPack {
  const { data, body } = splitFrontmatter(markdown);
  const title = typeof data.title === "string" ? normalizeWhitespace(data.title) : meta.slug;
  const description =
    typeof data.description === "string" ? normalizeWhitespace(data.description) : "";
  const blueprint = stripMdx(body);
  if (blueprint.length < 500) {
    throw new Error(`Carbon page ${meta.slug} has too little guidance (${blueprint.length} chars)`);
  }
  return {
    id: `app-pattern/carbon-${meta.slug}`,
    kind: "app-pattern",
    name: title,
    summary: description || firstSentence(blueprint, 240),
    domains: meta.domains,
    sectors: ["enterprise"],
    tags: ["carbon", ...meta.kinds, meta.slug],
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

export const carbonAdapter: SourceAdapter = {
  id: "carbon",
  async fetch(context: SourceContext): Promise<SourceResult> {
    const packs: AppPatternPack[] = [];
    for (const meta of PAGES) {
      const markdown = await context.fetchText(meta.path);
      packs.push(
        parseCarbonPage(
          markdown,
          context.provenance(meta.path, [
            "removed MDX imports, examples, images, and layout wrappers",
            "converted the remaining guidance to text",
          ]),
          meta.url,
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
        id: "carbon",
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
