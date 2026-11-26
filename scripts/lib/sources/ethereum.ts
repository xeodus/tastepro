import yaml from "js-yaml";
import type { AppPatternPack, Provenance } from "../../../src/core/schema.js";
import { firstSentence, normalizeWhitespace } from "../../../src/core/text.js";
import { htmlToText } from "./html.js";
import type { SourceAdapter, SourceContext, SourceResult } from "./types.js";

interface EthereumPage {
  slug: string;
  path: string;
  url: string;
  kinds: string[];
  basis: string;
}

const PAGES: EthereumPage[] = [
  {
    slug: "design-and-ux",
    path: "public/content/developers/docs/design-and-ux/index.md",
    url: "https://ethereum.org/en/developers/docs/design-and-ux/",
    kinds: ["web3", "overview"],
    basis: "Web3 design overview from ethereum.org",
  },
  {
    slug: "heuristics-for-web3",
    path: "public/content/developers/docs/design-and-ux/heuristics-for-web3/index.md",
    url: "https://ethereum.org/en/developers/docs/design-and-ux/heuristics-for-web3/",
    kinds: ["web3", "heuristics"],
    basis: "seven Web3 usability heuristics from ethereum.org",
  },
  {
    slug: "dex-design-best-practice",
    path: "public/content/developers/docs/design-and-ux/dex-design-best-practice/index.md",
    url: "https://ethereum.org/en/developers/docs/design-and-ux/dex-design-best-practice/",
    kinds: ["web3", "dex"],
    basis: "DEX design guidance from ethereum.org",
  },
  {
    slug: "transactions",
    path: "public/content/developers/docs/transactions/index.md",
    url: "https://ethereum.org/en/developers/docs/transactions/",
    kinds: ["web3", "transaction"],
    basis: "transaction lifecycle guidance from ethereum.org",
  },
  {
    slug: "gas",
    path: "public/content/developers/docs/gas/index.md",
    url: "https://ethereum.org/en/developers/docs/gas/",
    kinds: ["web3", "fees"],
    basis: "gas and fee guidance from ethereum.org",
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
    body.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"),
  );
}

export function parseEthereumPage(
  markdown: string,
  provenance: Provenance,
  sourceUrl: string,
  meta: EthereumPage,
): AppPatternPack {
  const { data, body } = splitFrontmatter(markdown);
  const title = typeof data.title === "string" ? normalizeWhitespace(data.title) : meta.slug;
  const description =
    typeof data.description === "string" ? normalizeWhitespace(data.description) : "";
  const blueprint = stripMarkdown(body);
  if (blueprint.length < 400) {
    throw new Error(
      `Ethereum page ${meta.slug} has too little guidance (${blueprint.length} chars)`,
    );
  }
  return {
    id: `app-pattern/ethereum-${meta.slug}`,
    kind: "app-pattern",
    name: title,
    summary: description || firstSentence(blueprint, 240),
    domains: ["crypto-web3", "fintech-payments", "product-surfaces"],
    sectors: ["web3", "finance"],
    tags: ["ethereum", ...meta.kinds, meta.slug],
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

export const ethereumAdapter: SourceAdapter = {
  id: "ethereum-org",
  async fetch(context: SourceContext): Promise<SourceResult> {
    const packs: AppPatternPack[] = [];
    for (const meta of PAGES) {
      const markdown = await context.fetchText(meta.path);
      packs.push(
        parseEthereumPage(
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
        id: "ethereum-org",
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
