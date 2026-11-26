import { type HTMLElement, type Node, parse } from "node-html-parser";
import type { AppPatternPack, Provenance } from "../../../src/core/schema.js";
import { firstSentence, normalizeWhitespace } from "../../../src/core/text.js";
import type { SourceAdapter, SourceContext, SourceResult } from "./types.js";

interface NhsPattern {
  slug: string;
  path: string;
  kinds: string[];
  domains: string[];
  sectors: string[];
}

const PATTERNS: NhsPattern[] = [
  {
    slug: "ask-for-nhs-numbers",
    path: "app/views/design-system/patterns/ask-for-nhs-numbers/index.njk",
    kinds: ["form", "identity"],
    domains: ["healthcare-wellness", "government-public", "product-surfaces"],
    sectors: ["healthcare", "government"],
  },
  {
    slug: "check-answers",
    path: "app/views/design-system/patterns/check-answers/index.njk",
    kinds: ["form", "review"],
    domains: ["healthcare-wellness", "government-public", "product-surfaces"],
    sectors: ["healthcare", "government"],
  },
  {
    slug: "confirmation-page",
    path: "app/views/design-system/patterns/confirmation-page/index.njk",
    kinds: ["form", "confirmation"],
    domains: ["healthcare-wellness", "government-public", "product-surfaces"],
    sectors: ["healthcare", "government"],
  },
  {
    slug: "question-pages",
    path: "app/views/design-system/patterns/question-pages/index.njk",
    kinds: ["form"],
    domains: ["healthcare-wellness", "government-public", "product-surfaces"],
    sectors: ["healthcare", "government"],
  },
  {
    slug: "start-page",
    path: "app/views/design-system/patterns/start-page/index.njk",
    kinds: ["navigation", "entry"],
    domains: ["healthcare-wellness", "government-public", "nonprofit-civic"],
    sectors: ["healthcare", "government"],
  },
  {
    slug: "complete-multiple-tasks",
    path: "app/views/design-system/patterns/complete-multiple-tasks/index.njk",
    kinds: ["navigation", "task-list"],
    domains: ["healthcare-wellness", "government-public", "nonprofit-civic"],
    sectors: ["healthcare", "government"],
  },
  {
    slug: "help-users-decide-when-and-where-to-get-care",
    path: "app/views/design-system/patterns/help-users-decide-when-and-where-to-get-care/index.njk",
    kinds: ["triage", "content"],
    domains: ["healthcare-wellness"],
    sectors: ["healthcare"],
  },
  {
    slug: "interruption-page",
    path: "app/views/design-system/patterns/interruption-page/index.njk",
    kinds: ["navigation", "interruption"],
    domains: ["healthcare-wellness", "government-public", "product-surfaces"],
    sectors: ["healthcare", "government"],
  },
];

function setValue(source: string, key: string): string {
  const match = new RegExp(`\\{%\\s*set\\s+${key}\\s*=\\s*"([^"]*)"\\s*%\\}`).exec(source);
  return match?.[1] ? normalizeWhitespace(match[1]) : "";
}

function stripNunjucks(source: string): string {
  return source
    .replace(/{%[\s\S]*?%}/g, "")
    .replace(/{{[\s\S]*?}}/g, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function renderNode(node: Node): string {
  if (node.nodeType === 3) return node.textContent ?? "";
  const element = node as HTMLElement;
  const tag = element.tagName?.toLowerCase() ?? "";
  if (tag === "script" || tag === "style") return "";
  const inner = (element.childNodes ?? []).map(renderNode).join("");
  if (tag === "h2") return `\n\n## ${inner.trim()}\n\n`;
  if (tag === "h3") return `\n\n### ${inner.trim()}\n\n`;
  if (tag === "h4") return `\n\n#### ${inner.trim()}\n\n`;
  if (tag === "li") return `\n- ${inner.trim()}`;
  if (tag === "p") return `\n\n${inner.trim()}\n\n`;
  if (tag === "br") return "\n";
  return inner;
}

function htmlToText(html: string): string {
  const root = parse(html);
  const text = (root.childNodes ?? []).map(renderNode).join("");
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function nhsUrl(slug: string): string {
  return `https://service-manual.nhs.uk/design-system/patterns/${slug}`;
}

export function parseNhsPattern(
  source: string,
  provenance: Provenance,
  sourceUrl: string,
  meta: NhsPattern,
): AppPatternPack {
  const title = setValue(source, "pageTitle") || meta.slug;
  const description = setValue(source, "pageDescription");
  const blueprint = htmlToText(stripNunjucks(source));
  if (blueprint.length < 500) {
    throw new Error(`NHS pattern ${meta.slug} has too little guidance (${blueprint.length} chars)`);
  }
  return {
    id: `app-pattern/nhs-${meta.slug}`,
    kind: "app-pattern",
    name: title,
    summary: description || firstSentence(blueprint, 240),
    domains: meta.domains,
    sectors: meta.sectors,
    tags: ["nhs", ...meta.kinds, meta.slug],
    moods: [],
    quality: "verified",
    provenance,
    sourceUrl,
    screen: meta.slug,
    kinds: meta.kinds,
    basis: `a ${title.toLowerCase()} pattern from the NHS.UK service manual`,
    blueprint,
    phone: "",
  };
}

export const nhsAdapter: SourceAdapter = {
  id: "nhs-uk",
  async fetch(context: SourceContext): Promise<SourceResult> {
    const packs: AppPatternPack[] = [];
    for (const meta of PATTERNS) {
      const source = await context.fetchText(meta.path);
      packs.push(
        parseNhsPattern(
          source,
          context.provenance(meta.path, [
            "removed Nunjucks template tags and design examples",
            "converted the guidance HTML to text",
          ]),
          nhsUrl(meta.slug),
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
        id: "nhs-uk",
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
