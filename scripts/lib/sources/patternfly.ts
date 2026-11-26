import yaml from "js-yaml";
import type { AppPatternPack, Provenance } from "../../../src/core/schema.js";
import { firstSentence, normalizeWhitespace } from "../../../src/core/text.js";
import { htmlToText } from "./html.js";
import type { SourceAdapter, SourceContext, SourceResult } from "./types.js";

interface PfPage {
  slug: string;
  path: string;
  url: string;
  kinds: string[];
  domains: string[];
  basis: string;
}

const BASE = "packages/documentation-site/patternfly-docs/content";

const PAGES: PfPage[] = [
  {
    slug: "actions",
    path: `${BASE}/patterns/actions/actions.md`,
    url: "https://www.patternfly.org/patterns/actions/",
    kinds: ["pattern", "actions"],
    domains: ["b2b-saas", "productivity", "security"],
    basis: "actions pattern from PatternFly",
  },
  {
    slug: "bulk-selection",
    path: `${BASE}/patterns/bulk-selection/bulk-selection.md`,
    url: "https://www.patternfly.org/patterns/bulk-selection/",
    kinds: ["pattern", "selection"],
    domains: ["b2b-saas", "data-analytics", "security"],
    basis: "bulk selection pattern from PatternFly",
  },
  {
    slug: "card-view",
    path: `${BASE}/patterns/card-view/card-view.md`,
    url: "https://www.patternfly.org/patterns/card-view/",
    kinds: ["pattern", "cards"],
    domains: ["b2b-saas", "data-analytics"],
    basis: "card view pattern from PatternFly",
  },
  {
    slug: "dashboard",
    path: `${BASE}/patterns/dashboard/dashboard.md`,
    url: "https://www.patternfly.org/patterns/dashboard/",
    kinds: ["pattern", "dashboard"],
    domains: ["b2b-saas", "data-analytics", "telecom", "security"],
    basis: "dashboard pattern from PatternFly",
  },
  {
    slug: "filters",
    path: `${BASE}/patterns/filters/filters.md`,
    url: "https://www.patternfly.org/patterns/filters/",
    kinds: ["pattern", "filters"],
    domains: ["b2b-saas", "data-analytics", "ecommerce-dtc"],
    basis: "filter pattern from PatternFly",
  },
  {
    slug: "primary-detail",
    path: `${BASE}/patterns/primary-detail/primary-detail.md`,
    url: "https://www.patternfly.org/patterns/primary-detail/",
    kinds: ["pattern", "navigation"],
    domains: ["b2b-saas", "data-analytics"],
    basis: "primary-detail pattern from PatternFly",
  },
  {
    slug: "status-and-severity",
    path: `${BASE}/patterns/status-and-severity/status-and-severity.md`,
    url: "https://www.patternfly.org/patterns/status-and-severity/",
    kinds: ["pattern", "status"],
    domains: ["b2b-saas", "security", "data-analytics"],
    basis: "status and severity pattern from PatternFly",
  },
  {
    slug: "error-messages",
    path: `${BASE}/content-design/writing-guides/error-messages.md`,
    url: "https://www.patternfly.org/content-design/writing-guides/error-messages/",
    kinds: ["content-design", "errors"],
    domains: ["b2b-saas", "product-surfaces"],
    basis: "error message writing guidance from PatternFly",
  },
  {
    slug: "tooltips",
    path: `${BASE}/content-design/writing-guides/tooltips.md`,
    url: "https://www.patternfly.org/content-design/writing-guides/tooltips/",
    kinds: ["content-design", "tooltips"],
    domains: ["b2b-saas", "product-surfaces"],
    basis: "tooltip writing guidance from PatternFly",
  },
  {
    slug: "brand-voice-and-tone",
    path: `${BASE}/content-design/brand-voice-and-tone.md`,
    url: "https://www.patternfly.org/content-design/brand-voice-and-tone/",
    kinds: ["content-design", "voice"],
    domains: ["b2b-saas", "product-surfaces"],
    basis: "voice and tone guidance from PatternFly",
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

function stripMarkdown(body: string): string {
  return htmlToText(
    body
      .replace(/<img[^>]*>/g, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"),
  );
}

export function parsePatternFlyPage(
  markdown: string,
  provenance: Provenance,
  sourceUrl: string,
  meta: PfPage,
): AppPatternPack {
  const { data, body } = splitFrontmatter(markdown);
  const title = typeof data.id === "string" ? normalizeWhitespace(data.id) : meta.slug;
  const blueprint = stripMarkdown(body);
  if (blueprint.length < 400) {
    throw new Error(
      `PatternFly page ${meta.slug} has too little guidance (${blueprint.length} chars)`,
    );
  }
  return {
    id: `app-pattern/patternfly-${meta.slug}`,
    kind: "app-pattern",
    name: title,
    summary: firstSentence(blueprint, 240),
    domains: meta.domains,
    sectors: ["enterprise"],
    tags: ["patternfly", ...meta.kinds, meta.slug],
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

export const patternFlyAdapter: SourceAdapter = {
  id: "patternfly",
  async fetch(context: SourceContext): Promise<SourceResult> {
    const packs: AppPatternPack[] = [];
    for (const meta of PAGES) {
      const markdown = await context.fetchText(meta.path);
      packs.push(
        parsePatternFlyPage(
          markdown,
          context.provenance(meta.path, [
            "removed images and link markup",
            "converted the remaining Markdown to text",
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
        id: "patternfly",
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
