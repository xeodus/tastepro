import yaml from "js-yaml";
import type { AppPatternPack, Provenance } from "../../../src/core/schema.js";
import { firstSentence, normalizeWhitespace } from "../../../src/core/text.js";
import { htmlToText } from "./html.js";
import type { SourceAdapter, SourceContext, SourceResult } from "./types.js";

interface AntPage {
  slug: string;
  kinds: string[];
  domains: string[];
}

const PAGES: AntPage[] = [
  {
    slug: "data-display",
    kinds: ["data-display", "tables"],
    domains: ["b2b-saas", "data-analytics", "product-surfaces"],
  },
  {
    slug: "data-entry",
    kinds: ["data-entry", "forms"],
    domains: ["b2b-saas", "product-surfaces"],
  },
  {
    slug: "data-format",
    kinds: ["data-format", "content"],
    domains: ["b2b-saas", "data-analytics"],
  },
  {
    slug: "detail-page",
    kinds: ["detail-page", "layout"],
    domains: ["b2b-saas", "data-analytics", "ecommerce-dtc"],
  },
  {
    slug: "buttons",
    kinds: ["buttons", "actions"],
    domains: ["b2b-saas", "product-surfaces"],
  },
  {
    slug: "colors",
    kinds: ["color", "foundation"],
    domains: ["b2b-saas", "product-surfaces"],
  },
  {
    slug: "contrast",
    kinds: ["contrast", "accessibility"],
    domains: ["b2b-saas", "product-surfaces"],
  },
  {
    slug: "dark",
    kinds: ["dark-mode", "foundation"],
    domains: ["b2b-saas", "product-surfaces"],
  },
  {
    slug: "copywriting",
    kinds: ["copywriting", "content"],
    domains: ["b2b-saas", "product-surfaces", "ecommerce-dtc"],
  },
  {
    slug: "layout",
    kinds: ["layout", "foundation"],
    domains: ["b2b-saas", "data-analytics"],
  },
  {
    slug: "feedback",
    kinds: ["feedback", "states"],
    domains: ["b2b-saas", "product-surfaces"],
  },
  {
    slug: "navigation",
    kinds: ["navigation", "layout"],
    domains: ["b2b-saas", "data-analytics"],
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

function stripAnt(body: string): string {
  return htmlToText(
    body
      .replace(/<ImagePreview>[\s\S]*?<\/ImagePreview>/g, "")
      .replace(/<img[^>]*>/g, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"),
  );
}

export function parseAntPage(
  markdown: string,
  provenance: Provenance,
  sourceUrl: string,
  meta: AntPage,
): AppPatternPack {
  const { data, body } = splitFrontmatter(markdown);
  const title = typeof data.title === "string" ? normalizeWhitespace(data.title) : meta.slug;
  const blueprint = stripAnt(body);
  if (blueprint.length < 400) {
    throw new Error(
      `Ant Design page ${meta.slug} has too little guidance (${blueprint.length} chars)`,
    );
  }
  return {
    id: `app-pattern/ant-${meta.slug}`,
    kind: "app-pattern",
    name: title,
    summary: firstSentence(blueprint, 240),
    domains: meta.domains,
    sectors: ["enterprise"],
    tags: ["ant-design", ...meta.kinds, meta.slug],
    moods: [],
    quality: "verified",
    provenance,
    sourceUrl,
    screen: meta.slug,
    kinds: meta.kinds,
    basis: `a ${title.toLowerCase()} design guideline from Ant Design`,
    blueprint,
    phone: "",
  };
}

export const antAdapter: SourceAdapter = {
  id: "ant-design",
  async fetch(context: SourceContext): Promise<SourceResult> {
    const packs: AppPatternPack[] = [];
    for (const meta of PAGES) {
      const path = `docs/spec/${meta.slug}.en-US.md`;
      const markdown = await context.fetchText(path);
      packs.push(
        parseAntPage(
          markdown,
          context.provenance(path, [
            "removed ImagePreview blocks, images, and link markup",
            "converted the remaining Markdown to text",
          ]),
          `https://ant.design/docs/spec/${meta.slug}`,
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
        id: "ant-design",
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
