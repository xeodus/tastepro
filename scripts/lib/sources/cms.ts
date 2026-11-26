import yaml from "js-yaml";
import type { AppPatternPack, Provenance } from "../../../src/core/schema.js";
import { firstSentence, normalizeWhitespace } from "../../../src/core/text.js";
import type { SourceAdapter, SourceContext, SourceResult } from "./types.js";

interface CmsPattern {
  slug: string;
  path: string;
  kinds: string[];
  domains: string[];
  sectors: string[];
}

const PATTERNS: CmsPattern[] = [
  {
    slug: "alert",
    path: "packages/docs/content/components/alert.mdx",
    kinds: ["feedback", "status"],
    domains: ["product-surfaces", "government-public", "healthcare-wellness"],
    sectors: ["government", "healthcare"],
  },
  {
    slug: "table",
    path: "packages/docs/content/components/table.mdx",
    kinds: ["data", "table"],
    domains: ["b2b-saas", "data-analytics", "government-public"],
    sectors: ["government", "healthcare"],
  },
  {
    slug: "accordion",
    path: "packages/docs/content/components/accordion.mdx",
    kinds: ["navigation", "disclosure"],
    domains: ["product-surfaces", "government-public"],
    sectors: ["government", "healthcare"],
  },
  {
    slug: "pagination",
    path: "packages/docs/content/components/pagination.mdx",
    kinds: ["navigation"],
    domains: ["product-surfaces", "ecommerce-dtc", "marketplaces"],
    sectors: ["government", "commerce"],
  },
  {
    slug: "tabs",
    path: "packages/docs/content/components/tabs.mdx",
    kinds: ["navigation", "disclosure"],
    domains: ["product-surfaces", "b2b-saas"],
    sectors: ["government", "healthcare"],
  },
  {
    slug: "multi-input-date-field",
    path: "packages/docs/content/components/date-field/multi-input-date-field.mdx",
    kinds: ["form", "date"],
    domains: ["government-public", "healthcare-wellness", "product-surfaces"],
    sectors: ["government", "healthcare"],
  },
  {
    slug: "zip-codes",
    path: "packages/docs/content/patterns/zip-codes.mdx",
    kinds: ["form", "address"],
    domains: ["government-public", "healthcare-wellness", "ecommerce-dtc"],
    sectors: ["government", "healthcare"],
  },
  {
    slug: "phone-numbers",
    path: "packages/docs/content/patterns/phone-numbers.mdx",
    kinds: ["form", "contact"],
    domains: ["government-public", "healthcare-wellness", "fintech-payments"],
    sectors: ["government", "healthcare"],
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

function stripMdx(body: string): string {
  return body
    .replace(/<StorybookExample[\s\S]*?\/>/g, "")
    .replace(/<SeeStorybookForGuidance[\s\S]*?\/>/g, "")
    .replace(/<EmbeddedExample>[\s\S]*?<\/EmbeddedExample>/g, "")
    .replace(/<ThemeContent[\s\S]*?>/g, "")
    .replace(/<\/ThemeContent>/g, "")
    .replace(/<Badge[\s\S]*?>/g, "")
    .replace(/<\/Badge>/g, "")
    .replace(/<a\s[^>]*>/g, "")
    .replace(/<\/a>/g, "")
    .replace(/<code>/g, "`")
    .replace(/<\/code>/g, "`")
    .replace(/<[^>]+>/g, "")
    .replace(/\{[^}]*\}/g, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function cmsUrl(path: string): string {
  const slug = path
    .replace(/^packages\/docs\/content\//, "")
    .replace(/\.mdx$/, "")
    .replace(/\/$/, "");
  return `https://design.cms.gov/${slug}/`;
}

export function parseCmsPattern(
  markdown: string,
  provenance: Provenance,
  sourceUrl: string,
  meta: CmsPattern,
): AppPatternPack {
  const { data, body } = splitFrontmatter(markdown);
  const title = typeof data.title === "string" ? normalizeWhitespace(data.title) : meta.slug;
  const intro = typeof data.intro === "string" ? normalizeWhitespace(data.intro) : "";
  const guidanceStart = body.search(/^## Guidance\b/m);
  const content = guidanceStart >= 0 ? body.slice(guidanceStart) : body;
  const blueprint = stripMdx(content);
  if (blueprint.length < 300) {
    throw new Error(`CMS pattern ${meta.slug} has too little guidance (${blueprint.length} chars)`);
  }
  return {
    id: `app-pattern/cms-${meta.slug}`,
    kind: "app-pattern",
    name: title,
    summary: intro || firstSentence(blueprint, 240),
    domains: meta.domains,
    sectors: meta.sectors,
    tags: ["cms", ...meta.kinds, meta.slug],
    moods: [],
    quality: "verified",
    provenance,
    sourceUrl,
    screen: meta.slug,
    kinds: meta.kinds,
    basis: `a ${title.toLowerCase()} pattern from the CMS Design System`,
    blueprint,
    phone: "",
  };
}

export const cmsAdapter: SourceAdapter = {
  id: "cms-design-system",
  async fetch(context: SourceContext): Promise<SourceResult> {
    const packs: AppPatternPack[] = [];
    for (const meta of PATTERNS) {
      const markdown = await context.fetchText(meta.path);
      packs.push(
        parseCmsPattern(
          markdown,
          context.provenance(meta.path, [
            "removed MDX imports, examples, and JSX wrappers",
            "kept the guidance section only",
          ]),
          cmsUrl(meta.path),
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
        id: "cms-design-system",
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
