import yaml from "js-yaml";
import type { AppPatternPack, Provenance } from "../../../src/core/schema.js";
import { firstSentence, normalizeWhitespace } from "../../../src/core/text.js";
import type { SourceAdapter, SourceContext, SourceResult } from "./types.js";

interface GovukPattern {
  slug: string;
  path: string;
  kinds: string[];
  domains: string[];
  sectors: string[];
}

/**
 * The first GOV.UK slice: the form patterns with the most direct value for
 * fintech, public-sector, and product surfaces. Images, Nunjucks examples, and
 * the Crown marks are excluded; only the guidance prose is ingested.
 */
const PATTERNS: GovukPattern[] = [
  {
    slug: "bank-details",
    path: "src/patterns/bank-details/index.md",
    kinds: ["form", "payments"],
    domains: ["fintech-payments", "government-public", "product-surfaces"],
    sectors: ["government", "finance"],
  },
  {
    slug: "payment-card-details",
    path: "src/patterns/payment-card-details/index.md",
    kinds: ["form", "payments"],
    domains: ["fintech-payments", "ecommerce-dtc", "government-public"],
    sectors: ["government", "finance"],
  },
  {
    slug: "validation",
    path: "src/patterns/validation/index.md",
    kinds: ["form", "errors"],
    domains: ["product-surfaces", "government-public"],
    sectors: ["government"],
  },
  {
    slug: "error-summary",
    path: "src/components/error-summary/index.md",
    kinds: ["form", "errors"],
    domains: ["product-surfaces", "government-public"],
    sectors: ["government"],
  },
  {
    slug: "addresses",
    path: "src/patterns/addresses/index.md",
    kinds: ["form"],
    domains: ["government-public", "product-surfaces"],
    sectors: ["government"],
  },
  {
    slug: "names",
    path: "src/patterns/names/index.md",
    kinds: ["form"],
    domains: ["government-public", "product-surfaces"],
    sectors: ["government"],
  },
  {
    slug: "dates",
    path: "src/patterns/dates/index.md",
    kinds: ["form"],
    domains: ["government-public", "product-surfaces"],
    sectors: ["government"],
  },
  {
    slug: "check-answers",
    path: "src/patterns/check-answers/index.md",
    kinds: ["form", "review"],
    domains: ["government-public", "product-surfaces"],
    sectors: ["government"],
  },
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

function str(value: unknown): string {
  return typeof value === "string" ? normalizeWhitespace(value) : "";
}

/** Strip Nunjucks, images, and links; keep headings, prose, and lists. */
function stripGovuk(body: string): string {
  return body
    .replace(/{%[\s\S]*?%}/g, "")
    .replace(/{{[\s\S]*?}}/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*This guidance is for government teams[\s\S]*?go to GOV\.UK\.\s*/i, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseGovukPattern(
  markdown: string,
  provenance: Provenance,
  sourceUrl: string,
  meta: GovukPattern,
): AppPatternPack {
  const { data, body } = splitFrontmatter(markdown);
  const title = str(data.title) || meta.slug;
  const blueprint = stripGovuk(body);
  if (blueprint.length < 200) {
    throw new Error(
      `GOV.UK pattern ${meta.slug} has too little guidance (${blueprint.length} chars)`,
    );
  }
  const description = str(data.description);
  return {
    id: `app-pattern/govuk-${meta.slug}`,
    kind: "app-pattern",
    name: title,
    summary: description || firstSentence(blueprint, 240),
    domains: meta.domains,
    sectors: meta.sectors,
    tags: ["govuk", ...meta.kinds, meta.slug],
    moods: [],
    quality: "verified",
    provenance,
    sourceUrl,
    screen: meta.slug,
    kinds: meta.kinds,
    basis: `a ${title.toLowerCase()} pattern from the GOV.UK Design System`,
    blueprint,
    phone: "",
  };
}

export function govukUrl(path: string): string {
  return `https://design-system.service.gov.uk/${path.replace(/^src\//, "").replace(/\/index\.md$/, "/")}`;
}

export const govukAdapter: SourceAdapter = {
  id: "govuk-design-system",
  async fetch(context: SourceContext): Promise<SourceResult> {
    const packs: AppPatternPack[] = [];
    for (const meta of PATTERNS) {
      const markdown = await context.fetchText(meta.path);
      packs.push(
        parseGovukPattern(
          markdown,
          context.provenance(meta.path, ["stripped Nunjucks, images, and links"]),
          govukUrl(meta.path),
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
        id: "govuk-design-system",
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
