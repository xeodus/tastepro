import yaml from "js-yaml";
import type { AppPatternPack, Provenance } from "../../../src/core/schema.js";
import { firstSentence, normalizeWhitespace } from "../../../src/core/text.js";
import { htmlToText } from "./html.js";
import type { SourceAdapter, SourceContext, SourceResult } from "./types.js";

interface PrimerPage {
  slug: string;
  path: string;
  url: string;
  kinds: string[];
  domains: string[];
  basis: string;
}

const PAGES: PrimerPage[] = [
  {
    slug: "empty-states",
    path: "content/ui-patterns/empty-states.mdx",
    url: "https://primer.style/ui-patterns/empty-states/",
    kinds: ["empty-state", "states"],
    domains: ["developer-tools", "b2b-saas", "product-surfaces"],
    basis: "empty states guidance from GitHub Primer",
  },
  {
    slug: "loading",
    path: "content/ui-patterns/loading.mdx",
    url: "https://primer.style/ui-patterns/loading/",
    kinds: ["loading", "states"],
    domains: ["developer-tools", "b2b-saas", "product-surfaces"],
    basis: "loading states guidance from GitHub Primer",
  },
  {
    slug: "navigation",
    path: "content/ui-patterns/navigation.mdx",
    url: "https://primer.style/ui-patterns/navigation/",
    kinds: ["navigation", "layout"],
    domains: ["developer-tools", "b2b-saas"],
    basis: "navigation guidance from GitHub Primer",
  },
  {
    slug: "saving",
    path: "content/ui-patterns/saving.mdx",
    url: "https://primer.style/ui-patterns/saving/",
    kinds: ["saving", "states"],
    domains: ["developer-tools", "b2b-saas", "product-surfaces"],
    basis: "saving states guidance from GitHub Primer",
  },
  {
    slug: "feature-onboarding",
    path: "content/ui-patterns/feature-onboarding.mdx",
    url: "https://primer.style/ui-patterns/feature-onboarding/",
    kinds: ["onboarding", "guidance"],
    domains: ["developer-tools", "b2b-saas", "product-surfaces"],
    basis: "feature onboarding guidance from GitHub Primer",
  },
  {
    slug: "degraded-experiences",
    path: "content/ui-patterns/degraded-experiences.mdx",
    url: "https://primer.style/ui-patterns/degraded-experiences/",
    kinds: ["resilience", "states"],
    domains: ["developer-tools", "b2b-saas", "security"],
    basis: "degraded experience guidance from GitHub Primer",
  },
  {
    slug: "data-visualization",
    path: "content/ui-patterns/data-visualization.mdx",
    url: "https://primer.style/ui-patterns/data-visualization/",
    kinds: ["data-viz", "guidance"],
    domains: ["developer-tools", "data-analytics", "b2b-saas"],
    basis: "data-visualization guidance from GitHub Primer",
  },
  {
    slug: "notification-messaging",
    path: "content/ui-patterns/notification-messaging.mdx",
    url: "https://primer.style/ui-patterns/notification-messaging/",
    kinds: ["notifications", "messaging"],
    domains: ["developer-tools", "b2b-saas", "community-social"],
    basis: "notification and messaging guidance from GitHub Primer",
  },
  {
    slug: "progressive-disclosure",
    path: "content/ui-patterns/progressive-disclosure.mdx",
    url: "https://primer.style/ui-patterns/progressive-disclosure/",
    kinds: ["disclosure", "layout"],
    domains: ["developer-tools", "b2b-saas", "product-surfaces"],
    basis: "progressive disclosure guidance from GitHub Primer",
  },
  {
    slug: "forms",
    path: "content/ui-patterns/forms/overview.mdx",
    url: "https://primer.style/ui-patterns/forms/overview/",
    kinds: ["forms", "guidance"],
    domains: ["developer-tools", "b2b-saas", "product-surfaces"],
    basis: "form guidance from GitHub Primer",
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
  return htmlToText(
    body
      .replace(/^import\s+.*$/gm, "")
      .replace(/<Box[\s\S]*?>/g, "")
      .replace(/<\/Box>/g, "")
      .replace(/<img[^>]*>/g, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/\{[^}]*\}/g, ""),
  );
}

export function parsePrimerPage(
  markdown: string,
  provenance: Provenance,
  sourceUrl: string,
  meta: PrimerPage,
): AppPatternPack {
  const { data, body } = splitFrontmatter(markdown);
  const title = typeof data.title === "string" ? normalizeWhitespace(data.title) : meta.slug;
  const description =
    typeof data.description === "string" ? normalizeWhitespace(data.description) : "";
  const blueprint = stripMdx(body);
  if (blueprint.length < 400) {
    throw new Error(`Primer page ${meta.slug} has too little guidance (${blueprint.length} chars)`);
  }
  return {
    id: `app-pattern/primer-${meta.slug}`,
    kind: "app-pattern",
    name: title,
    summary: description || firstSentence(blueprint, 240),
    domains: meta.domains,
    sectors: ["developer-tools"],
    tags: ["primer", ...meta.kinds, meta.slug],
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

export const primerAdapter: SourceAdapter = {
  id: "primer",
  async fetch(context: SourceContext): Promise<SourceResult> {
    const packs: AppPatternPack[] = [];
    for (const meta of PAGES) {
      const markdown = await context.fetchText(meta.path);
      packs.push(
        parsePrimerPage(
          markdown,
          context.provenance(meta.path, [
            "removed MDX imports, layout wrappers, images, and link markup",
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
        id: "primer",
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
