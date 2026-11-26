import type { AppPatternPack, Provenance } from "../../../src/core/schema.js";
import { firstSentence } from "../../../src/core/text.js";
import { htmlToText } from "./html.js";
import type { SourceAdapter, SourceContext, SourceResult } from "./types.js";

interface PiePattern {
  slug: string;
  title: string;
  paths: string[];
  kinds: string[];
  domains: string[];
  sectors: string[];
}

const PATTERNS: PiePattern[] = [
  {
    slug: "onboarding-and-guided-tour",
    title: "Onboarding and guided tour",
    paths: [
      "apps/pie-docs/src/patterns/onboarding-and-guided-tour/web-guidance/web-guidance.md",
      "apps/pie-docs/src/patterns/onboarding-and-guided-tour/apps-guidance/apps-guidance.md",
    ],
    kinds: ["onboarding", "guidance"],
    domains: ["restaurants-food", "marketplaces", "ecommerce-dtc", "product-surfaces"],
    sectors: ["food-delivery", "commerce"],
  },
  {
    slug: "overlay-patterns",
    title: "Overlay patterns",
    paths: [
      "apps/pie-docs/src/patterns/overlay-patterns/overview/overview.md",
      "apps/pie-docs/src/patterns/overlay-patterns/web-guidance/web-guidance.md",
    ],
    kinds: ["overlay", "guidance"],
    domains: ["restaurants-food", "product-surfaces", "ecommerce-dtc"],
    sectors: ["food-delivery", "commerce"],
  },
  {
    slug: "forms",
    title: "Forms",
    paths: [
      "apps/pie-docs/src/patterns/forms/overview/overview.md",
      "apps/pie-docs/src/patterns/forms/guidance/guidance.md",
    ],
    kinds: ["form", "guidance"],
    domains: ["restaurants-food", "ecommerce-dtc", "product-surfaces"],
    sectors: ["food-delivery", "commerce"],
  },
  {
    slug: "messaging-and-chatbots",
    title: "Messaging and chatbots",
    paths: [
      "apps/pie-docs/src/patterns/messaging-and-chatbots/overview/overview.md",
      "apps/pie-docs/src/patterns/messaging-and-chatbots/guidance/guidance.md",
    ],
    kinds: ["messaging", "guidance"],
    domains: ["restaurants-food", "product-surfaces", "marketplaces"],
    sectors: ["food-delivery", "commerce"],
  },
  {
    slug: "jet-ai",
    title: "JET AI",
    paths: ["apps/pie-docs/src/patterns/jet-ai/overview/overview.md"],
    kinds: ["ai", "guidance"],
    domains: ["restaurants-food", "ai-products", "product-surfaces"],
    sectors: ["food-delivery", "commerce"],
  },
  {
    slug: "just-eat-plus",
    title: "Just Eat Plus",
    paths: ["apps/pie-docs/src/patterns/just-eat-plus/overview/overview.md"],
    kinds: ["subscription", "loyalty"],
    domains: ["restaurants-food", "ecommerce-dtc", "marketplaces"],
    sectors: ["food-delivery", "commerce"],
  },
  {
    slug: "cookie-banner",
    title: "Cookie banner",
    paths: ["apps/pie-docs/src/patterns/cookie-banner/overview/overview.md"],
    kinds: ["consent", "guidance"],
    domains: ["restaurants-food", "government-public", "product-surfaces"],
    sectors: ["food-delivery", "commerce"],
  },
  {
    slug: "haptic-feedback",
    title: "Haptic feedback",
    paths: [
      "apps/pie-docs/src/patterns/haptic-feedback/overview/overview.md",
      "apps/pie-docs/src/patterns/haptic-feedback/guidance/guidance.md",
    ],
    kinds: ["feedback", "mobile"],
    domains: ["restaurants-food", "product-surfaces", "fitness"],
    sectors: ["food-delivery", "commerce"],
  },
];

function splitFrontmatter(markdown: string): { data: Record<string, unknown>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(markdown);
  if (!match) return { data: {}, body: markdown };
  const data = match[1] ?? "";
  return { data: { raw: data }, body: markdown.slice(match[0].length) };
}

function stripPie(body: string): string {
  return htmlToText(
    body
      .replace(/{%[\s\S]*?%}/g, "")
      .replace(/{{[\s\S]*?}}/g, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"),
  );
}

export function parsePiePattern(
  markdown: string,
  provenance: Provenance,
  sourceUrl: string,
  meta: PiePattern,
): AppPatternPack {
  const { body } = splitFrontmatter(markdown);
  const blueprint = stripPie(body);
  if (blueprint.length < 350) {
    throw new Error(`PIE pattern ${meta.slug} has too little guidance (${blueprint.length} chars)`);
  }
  return {
    id: `app-pattern/pie-${meta.slug}`,
    kind: "app-pattern",
    name: meta.title,
    summary: firstSentence(blueprint, 240),
    domains: meta.domains,
    sectors: meta.sectors,
    tags: ["pie", ...meta.kinds, meta.slug],
    moods: [],
    quality: "verified",
    provenance,
    sourceUrl,
    screen: meta.slug,
    kinds: meta.kinds,
    basis: `a ${meta.title.toLowerCase()} pattern from PIE`,
    blueprint,
    phone: "",
  };
}

export const pieAdapter: SourceAdapter = {
  id: "pie",
  async fetch(context: SourceContext): Promise<SourceResult> {
    const packs: AppPatternPack[] = [];
    for (const meta of PATTERNS) {
      const parts: string[] = [];
      for (const path of meta.paths) {
        const markdown = await context.fetchText(path);
        const { body } = splitFrontmatter(markdown);
        parts.push(stripPie(body));
      }
      const blueprint = parts.filter(Boolean).join("\n\n");
      packs.push(
        parsePiePattern(
          blueprint,
          context.provenance(meta.paths[0]!, [
            "removed Nunjucks includes, images, and link markup",
            "joined the overview and guidance pages",
          ]),
          `https://pie.design/patterns/${meta.slug}/`,
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
        id: "pie",
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
