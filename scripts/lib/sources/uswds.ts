import yaml from "js-yaml";
import { type HTMLElement, type Node, parse } from "node-html-parser";
import type { AppPatternPack, Provenance } from "../../../src/core/schema.js";
import { firstSentence, normalizeWhitespace } from "../../../src/core/text.js";
import type { SourceAdapter, SourceContext, SourceResult } from "./types.js";

interface UswdsPattern {
  slug: string;
  path: string;
  kinds: string[];
  domains: string[];
  sectors: string[];
}

/**
 * USWDS keeps its richest guidance in the pattern pages, not the component
 * pages. This slice takes the identity and complex-form patterns, which map
 * directly to onboarding, KYC, benefits, and public-sector forms.
 */
const PATTERNS: UswdsPattern[] = [
  {
    slug: "name",
    path: "pages/patterns/create-a-profile/name.md",
    kinds: ["form", "identity"],
    domains: ["government-public", "product-surfaces", "healthcare-wellness"],
    sectors: ["government", "identity"],
  },
  {
    slug: "address",
    path: "pages/patterns/create-a-profile/address.md",
    kinds: ["form", "identity"],
    domains: ["government-public", "product-surfaces", "ecommerce-dtc"],
    sectors: ["government", "identity"],
  },
  {
    slug: "date-of-birth",
    path: "pages/patterns/create-a-profile/date-of-birth.md",
    kinds: ["form", "identity"],
    domains: ["government-public", "product-surfaces", "healthcare-wellness"],
    sectors: ["government", "identity"],
  },
  {
    slug: "email-address",
    path: "pages/patterns/create-a-profile/email-address.md",
    kinds: ["form", "identity"],
    domains: ["government-public", "product-surfaces"],
    sectors: ["government", "identity"],
  },
  {
    slug: "phone-number",
    path: "pages/patterns/create-a-profile/phone-number.md",
    kinds: ["form", "identity"],
    domains: ["government-public", "product-surfaces"],
    sectors: ["government", "identity"],
  },
  {
    slug: "social-security-number",
    path: "pages/patterns/create-a-profile/social-security-number.md",
    kinds: ["form", "identity"],
    domains: ["government-public", "fintech-payments", "healthcare-wellness"],
    sectors: ["government", "identity"],
  },
  {
    slug: "keep-a-record",
    path: "pages/patterns/complex-form/keep-a-record.md",
    kinds: ["form", "trust"],
    domains: ["government-public", "nonprofit-civic", "product-surfaces"],
    sectors: ["government"],
  },
  {
    slug: "establish-trust",
    path: "pages/patterns/complex-form/establish-trust.md",
    kinds: ["form", "trust"],
    domains: ["government-public", "nonprofit-civic", "product-surfaces"],
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

function stripJekyll(body: string): string {
  return body
    .replace(/{%[\s\S]*?%}/g, "")
    .replace(/{{[\s\S]*?}}/g, "")
    .replace(/^\{:.*\}\s*$/gm, "")
    .replace(/<div class="usa-accordion[\s\S]*$/i, "")
    .replace(/<div id="pattern-preview"[\s\S]*$/i, "")
    .replace(/<div id="pattern-code"[\s\S]*$/i, "")
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

export function parseUswdsPattern(
  markdown: string,
  provenance: Provenance,
  sourceUrl: string,
  meta: UswdsPattern,
): AppPatternPack {
  const { data, body } = splitFrontmatter(markdown);
  const title = typeof data.title === "string" ? normalizeWhitespace(data.title) : meta.slug;
  const lead = typeof data.lead === "string" ? normalizeWhitespace(data.lead) : "";
  const blueprint = htmlToText(stripJekyll(body));
  if (blueprint.length < 400) {
    throw new Error(
      `USWDS pattern ${meta.slug} has too little guidance (${blueprint.length} chars)`,
    );
  }
  return {
    id: `app-pattern/uswds-${meta.slug}`,
    kind: "app-pattern",
    name: title,
    summary: lead || firstSentence(blueprint, 240),
    domains: meta.domains,
    sectors: meta.sectors,
    tags: ["uswds", ...meta.kinds, meta.slug],
    moods: [],
    quality: "verified",
    provenance,
    sourceUrl,
    screen: meta.slug,
    kinds: meta.kinds,
    basis: `a ${title.toLowerCase()} pattern from USWDS`,
    blueprint,
    phone: "",
  };
}

export function uswdsUrl(permalink: unknown): string {
  return typeof permalink === "string" && permalink.startsWith("/")
    ? `https://designsystem.digital.gov${permalink}`
    : "https://designsystem.digital.gov/patterns/";
}

export const uswdsAdapter: SourceAdapter = {
  id: "uswds",
  async fetch(context: SourceContext): Promise<SourceResult> {
    const packs: AppPatternPack[] = [];
    for (const meta of PATTERNS) {
      const markdown = await context.fetchText(meta.path);
      const { data } = splitFrontmatter(markdown);
      packs.push(
        parseUswdsPattern(
          markdown,
          context.provenance(meta.path, [
            "converted HTML guidance to text",
            "removed Jekyll includes, previews, and examples",
          ]),
          uswdsUrl(data.permalink),
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
        id: "uswds",
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
