import {
  clampMaxTokens,
  DEFAULT_GET_MAX_TOKENS,
  estimateTokens,
  fitJson,
  fitText,
  MAX_TOKENS_LIMIT,
} from "./budget.js";
import type { ContentLoader } from "./content/loader.js";
import type {
  AppPatternPack,
  AppShellPack,
  AppStylePack,
  BrandPack,
  DirectionPack,
  DomainPack,
  GuidelinePack,
  HeroPack,
  MotionPack,
  Pack,
  PalettePack,
  ReferencePack,
  SectionPack,
  SitePack,
  TypePack,
} from "./schema.js";
import type { SearchService } from "./search.js";
import { escapeMarkdown, summarize, truncateAtWord } from "./text.js";

export type GetFormat = "brief" | "full" | "markdown" | "json";

export interface GetRequest {
  ids: string | string[];
  format?: GetFormat;
  maxTokens?: number;
  includeBody?: boolean;
}

export interface GetResponse {
  format: GetFormat;
  count: number;
  packs: unknown[];
  missing: string[];
  suggestions?: unknown[];
  truncated: boolean;
}

/**
 * A taxonomy-only domain has no authored playbook. Rather than pretending it
 * does, point the caller at complete playbooks from the same family.
 */
export interface FamilyFallbackCard {
  id: string;
  name: string;
  summary: string;
  depth: "taxonomy" | "seed" | "playbook";
  launchTier: boolean;
}

function compactProvenance(pack: Pack) {
  return {
    source: pack.provenance.source,
    repo: pack.provenance.repo,
    commit: pack.provenance.commit,
    license: pack.provenance.license,
    authors: pack.provenance.authors,
    url: pack.provenance.url,
  };
}

function common(pack: Pack) {
  return {
    id: pack.id,
    kind: pack.kind,
    name: pack.name,
    summary: pack.summary,
    domains: pack.domains,
    tags: pack.tags.slice(0, 16),
    moods: pack.moods,
    quality: pack.quality,
    sourceUrl: pack.sourceUrl,
    provenance: compactProvenance(pack),
  };
}

function directionBrief(pack: DirectionPack) {
  return {
    ...common(pack),
    tones: pack.tones,
    needs: pack.needs,
    idea: pack.idea,
    composition: pack.composition,
    typography: pack.typography,
    typeClasses: pack.typeClasses,
    colour: pack.colour,
    paletteTags: pack.paletteTags,
    imagery: pack.imagery,
    sectionTags: pack.sectionTags,
    motion: pack.motion,
    richness: pack.richness,
    pitfalls: pack.pitfalls,
    seenIn: pack.seenIn,
  };
}

function paletteBrief(pack: PalettePack) {
  return {
    ...common(pack),
    bg: pack.bg,
    surface: pack.surface,
    ink: pack.ink,
    muted: pack.muted,
    accent: pack.accent,
    accentInk: pack.accentInk,
    fields: pack.fields,
    note: pack.note,
    contrast: pack.contrast,
    seenIn: pack.seenIn,
  };
}

function typeBrief(pack: TypePack) {
  return {
    ...common(pack),
    typeClass: pack.typeClass,
    display: pack.display,
    text: pack.text,
    standsInFor: pack.standsInFor,
    note: pack.note,
    scale: pack.scale,
    links: pack.links,
    seenIn: pack.seenIn,
  };
}

function heroBrief(pack: HeroPack) {
  return {
    ...common(pack),
    archetype: pack.archetype,
    directions: pack.directions,
    needs: pack.needs,
    blueprint: pack.blueprint,
    mobile: pack.mobile,
    headline: pack.headline,
    motion: pack.motion,
    seenIn: pack.seenIn,
  };
}

function sectionBrief(pack: SectionPack) {
  return {
    ...common(pack),
    role: pack.role,
    shape: pack.shape,
    directions: pack.directions,
    needs: pack.needs,
    blueprint: pack.blueprint,
    mobile: pack.mobile,
    seenIn: pack.seenIn,
  };
}

function motionBrief(pack: MotionPack) {
  return { ...common(pack), description: pack.description };
}

function siteBrief(pack: SitePack) {
  return {
    ...common(pack),
    url: pack.url,
    sourceLabel: pack.sourceLabel,
    score: pack.score,
    idea: pack.idea,
    archetype: pack.archetype,
    hero: pack.hero,
    type: pack.type,
    colour: pack.colour,
    imagery: pack.imagery,
    layout: pack.layout,
    steal: pack.steal,
    sections: pack.sections,
    media: pack.media,
    motion: pack.motion,
  };
}

function brandBrief(pack: BrandPack) {
  return {
    ...common(pack),
    category: pack.category,
    description: pack.description,
    colors: pack.colors,
    typography: pack.typography,
    rounded: pack.rounded,
    spacing: pack.spacing,
    components: pack.components,
    design: pack.design,
    contrast: pack.contrast,
    contrastIssues: pack.contrastIssues,
    incompleteReasons: pack.incompleteReasons,
    unresolvedTokens: pack.unresolvedTokens,
  };
}

function guidelineBrief(pack: GuidelinePack) {
  return {
    ...common(pack),
    text: pack.text,
    category: pack.category,
    severity: pack.severity,
    instead: pack.instead,
    scope: pack.scope,
    sourcePath: pack.sourcePath,
    line: pack.line,
  };
}

function referenceBrief(pack: ReferencePack, includeBody: boolean) {
  return {
    ...common(pack),
    title: pack.title,
    headings: pack.headings,
    bodyPath: pack.bodyPath,
    useFor: pack.useFor,
    body: includeBody ? pack.body : truncateAtWord(pack.body, 1_200),
    bodyTruncated: !includeBody && pack.body.length > 1_200,
  };
}

function domainBrief(pack: DomainPack, familyFallback: FamilyFallbackCard[] = []) {
  return {
    ...common(pack),
    family: pack.family,
    description: pack.description,
    aliases: pack.aliases,
    status: pack.status,
    depth: pack.depth,
    launchTier: pack.launchTier,
    upstreamSectors: pack.upstreamSectors,
    questions: pack.questions,
    playbook: pack.playbook,
    ...(pack.playbook
      ? {}
      : {
          familyFallback: {
            family: pack.family,
            note:
              familyFallback.length > 0
                ? "No deep playbook exists for this domain yet. Use these same-family playbooks as the starting point, and use the domain questions to adapt them."
                : "No deep playbook or same-family playbook exists yet. Use the domain questions and taxonomy mappings, and say that the playbook is not authored.",
            playbooks: familyFallback,
          },
        }),
  };
}

function appStyleBrief(pack: AppStylePack) {
  return {
    ...common(pack),
    theme: pack.theme,
    basis: pack.basis,
    suits: pack.suits,
    idea: pack.idea,
    colourBudget: pack.colourBudget,
    tokens: pack.tokens,
    shell: pack.shell,
    shellAlternatives: pack.shellAlternatives,
    signature: pack.signature,
    identity: pack.identity,
    avoid: pack.avoid,
    notes: pack.notes,
  };
}

function appShellBrief(pack: AppShellPack) {
  return {
    ...common(pack),
    basis: pack.basis,
    suits: pack.suits,
    numbers: pack.numbers,
    blueprint: pack.blueprint,
    phone: pack.phone,
  };
}

function appPatternBrief(pack: AppPatternPack) {
  return {
    ...common(pack),
    screen: pack.screen,
    kinds: pack.kinds,
    basis: pack.basis,
    blueprint: pack.blueprint,
    phone: pack.phone,
  };
}

export function briefProjection(
  pack: Pack,
  includeBody = false,
  familyFallback: FamilyFallbackCard[] = [],
): unknown {
  switch (pack.kind) {
    case "direction":
      return directionBrief(pack);
    case "palette":
      return paletteBrief(pack);
    case "type":
      return typeBrief(pack);
    case "hero":
      return heroBrief(pack);
    case "section":
      return sectionBrief(pack);
    case "motion":
      return motionBrief(pack);
    case "site":
      return siteBrief(pack);
    case "brand":
      return brandBrief(pack);
    case "guideline":
      return guidelineBrief(pack);
    case "reference":
      return referenceBrief(pack, includeBody);
    case "domain":
      return domainBrief(pack, familyFallback);
    case "app-style":
      return appStyleBrief(pack);
    case "app-shell":
      return appShellBrief(pack);
    case "app-pattern":
      return appPatternBrief(pack);
  }
}

function list(items: readonly string[], prefix = "- "): string {
  return items.length > 0 ? items.map((item) => `${prefix}${item}`).join("\n") : "_None._";
}

function paletteMarkdown(pack: PalettePack): string {
  const rows = [
    ["bg", pack.bg],
    ["surface", pack.surface],
    ["ink", pack.ink],
    ["muted", pack.muted],
    ["accent", pack.accent],
    ["accentInk", pack.accentInk],
  ].map(([name, value]) => `| ${name} | \`${value}\` |`);
  const contrastRows = Object.entries(pack.contrast ?? {}).map(
    ([name, check]) =>
      `| ${name} | ${check.foreground} on ${check.background} | ${check.ratio}:1 | ${check.aaNormal ? "AA" : "—"} |`,
  );
  return [
    `# ${pack.name}`,
    "",
    pack.summary,
    "",
    "## Colours",
    "",
    "| Token | Value |",
    "| --- | --- |",
    ...rows,
    "",
    pack.fields.length > 0
      ? `Fields: ${pack.fields.map((field) => `${field.bg} / ${field.ink}`).join(", ")}`
      : "",
    "",
    "## Contrast",
    "",
    "| Pair | Colours | Ratio | Normal text |",
    "| --- | --- | --- | --- |",
    ...contrastRows,
    "",
    "## Note",
    "",
    pack.note,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function brandMarkdown(pack: BrandPack): string {
  const colors = Object.entries(pack.colors).slice(0, 48);
  const typography = Object.entries(pack.typography).slice(0, 24);
  return [
    `# ${pack.name}`,
    "",
    pack.description || pack.summary,
    "",
    `Source: ${pack.sourceUrl ?? pack.provenance.repo} (${pack.provenance.license})`,
    "",
    `_Reference analysis of ${pack.name}'s published design language. No logo or screenshot is bundled; do not impersonate the brand._`,
    "",
    // Contrast comes early so the accessibility warning survives tight budgets.
    "## Contrast",
    "",
    ...(Object.keys(pack.contrast).length > 0
      ? [
          "| Pair | Ratio | Normal text |",
          "| --- | --- | --- |",
          ...Object.entries(pack.contrast).map(
            ([name, check]) =>
              `| ${name} | ${check.ratio}:1 | ${check.aaNormal ? "AA" : "below AA"} |`,
          ),
        ]
      : ["_No core contrast pairs could be computed._"]),
    "",
    ...(pack.contrastIssues.length > 0
      ? ["### Contrast warnings", "", list(pack.contrastIssues), ""]
      : []),
    ...(pack.incompleteReasons.length > 0
      ? ["### Incomplete", "", list(pack.incompleteReasons), ""]
      : []),
    ...(pack.unresolvedTokens.length > 0
      ? ["### Unresolved tokens", "", list(pack.unresolvedTokens), ""]
      : []),
    "## Colors",
    "",
    "| Token | Value |",
    "| --- | --- |",
    ...colors.map(
      ([name, value]) =>
        `| ${name} | \`${typeof value === "string" ? value : JSON.stringify(value)}\` |`,
    ),
    "",
    "## Typography",
    "",
    "```json",
    JSON.stringify(Object.fromEntries(typography), null, 2),
    "```",
    "",
    "## Rounded",
    "",
    "```json",
    JSON.stringify(pack.rounded, null, 2),
    "```",
    "",
    "## Spacing",
    "",
    "```json",
    JSON.stringify(pack.spacing, null, 2),
    "```",
    "",
    "## Components",
    "",
    "```json",
    JSON.stringify(pack.components, null, 2),
    "```",
  ].join("\n");
}

function domainMarkdown(pack: DomainPack, familyFallback: FamilyFallbackCard[] = []): string {
  const playbook = pack.playbook;
  const questions = pack.questions.length > 0 ? pack.questions : (playbook?.questions ?? []);
  const fallbackLines =
    familyFallback.length > 0
      ? [
          `No deep playbook exists for **${pack.name}** yet. The closest complete playbooks in the **${pack.family}** family are:`,
          "",
          ...familyFallback.map((item) => `- \`${item.id}\` — ${item.name}: ${item.summary}`),
        ]
      : [
          `No deep playbook or same-family playbook exists for **${pack.name}** yet. Use the questions below and say that the playbook is not authored.`,
        ];
  return [
    `# ${pack.name}`,
    "",
    pack.description,
    "",
    `Status: **${pack.status}** · Depth: **${pack.depth}** · Launch tier: **${pack.launchTier ? "yes" : "no"}**`,
    "",
    `Aliases: ${pack.aliases.join(", ") || "—"}`,
    "",
    ...(playbook
      ? [
          "## Audience",
          "",
          list(playbook.audience),
          "",
          "## Jobs",
          "",
          list(playbook.jobs),
          "",
          "## Trust",
          "",
          list(playbook.trust),
          "",
          "## Information architecture",
          "",
          list(playbook.informationArchitecture),
          "",
          "## Conversion",
          "",
          playbook.conversion,
          "",
          "## Content checklist",
          "",
          list(playbook.contentChecklist),
          "",
          "## Anti-patterns",
          "",
          list(playbook.antiPatterns),
          "",
          "## Signature moves",
          "",
          list(playbook.signatureMoves),
          "",
          "## Recommended directions",
          "",
          list(playbook.recommendedDirections.map((id) => `\`direction/${id}\``)),
          "",
          "## Recommended palettes",
          "",
          list(playbook.recommendedPalettes.map((id) => `\`palette/${id}\``)),
          "",
          "## Questions",
          "",
          list(questions),
          "",
          "## Live thing",
          "",
          playbook.liveThing,
          "",
          "## Notes",
          "",
          playbook.notes,
        ]
      : [
          "## Family fallback",
          "",
          ...fallbackLines,
          "",
          "## Questions",
          "",
          list(questions),
          "",
          "_Taxonomy-only domain. No deep playbook has been authored yet._",
        ]),
    "",
    playbook
      ? "_Next: use `taste_get` on a recommended direction, palette, or type id for implementation detail._"
      : "_Next: use `taste_get` on one of the family-fallback playbooks, then choose a direction, palette, and type pairing._",
  ].join("\n");
}

function directionMarkdown(pack: DirectionPack): string {
  return [
    `# ${pack.name}`,
    "",
    pack.summary,
    "",
    `Quality: **${pack.quality}** · Source: ${pack.sourceUrl ?? pack.provenance.repo}`,
    "",
    "## Idea",
    "",
    pack.idea,
    "",
    "## Composition",
    "",
    pack.composition,
    "",
    "## Typography",
    "",
    pack.typography,
    "",
    `Type classes: ${pack.typeClasses.join(", ") || "—"}`,
    "",
    "## Colour",
    "",
    pack.colour,
    "",
    `Palette tags: ${pack.paletteTags.join(", ") || "—"}`,
    "",
    "## Imagery",
    "",
    pack.imagery,
    "",
    "## Motion",
    "",
    pack.motion,
    "",
    "## Richness",
    "",
    pack.richness,
    "",
    "## Pitfalls",
    "",
    pack.pitfalls,
    "",
    "## Needs",
    "",
    list(pack.needs),
    "",
    "## Seen in",
    "",
    list(pack.seenIn.map((id) => `\`site/${id}\``)),
  ].join("\n");
}

function guidelineMarkdown(pack: GuidelinePack): string {
  return [
    `## ${pack.text}`,
    "",
    `- **Category:** ${pack.category}`,
    `- **Severity:** ${pack.severity}`,
    `- **ID:** \`${pack.id}\``,
    ...(pack.instead ? [`- **Instead:** ${pack.instead}`] : []),
    `- **Source:** ${pack.provenance.repo}/blob/${pack.provenance.commit}/${pack.sourcePath}#L${pack.line}`,
    "",
    pack.summary,
  ].join("\n");
}

function referenceMarkdown(pack: ReferencePack): string {
  return pack.body;
}

function siteMarkdown(pack: SitePack): string {
  return [
    `# ${pack.name}`,
    "",
    pack.summary,
    "",
    `Reference: ${pack.url}`,
    `Source: ${pack.sourceLabel}${pack.score !== undefined ? ` · score ${pack.score}` : ""}`,
    "",
    "## Idea",
    "",
    pack.idea,
    "",
    "## Archetype",
    "",
    pack.archetype,
    "",
    "## Hero",
    "",
    pack.hero,
    "",
    "## Type",
    "",
    pack.type,
    "",
    "## Colour",
    "",
    pack.colour,
    "",
    "## Imagery",
    "",
    pack.imagery,
    "",
    "## Layout",
    "",
    pack.layout,
    "",
    "## Sections",
    "",
    ...pack.sections.map((section) => `### ${section.role}\n\n${section.description}`),
    "",
    "## Steal",
    "",
    list(pack.steal),
    "",
    "## Media",
    "",
    pack.media,
    "",
    "## Motion",
    "",
    pack.motion,
    "",
    "_Study of a third-party site. No screenshot is bundled; do not copy the brand or its assets._",
  ].join("\n");
}

function genericMarkdown(pack: Pack): string {
  return [
    `# ${pack.name}`,
    "",
    pack.summary,
    "",
    "```json",
    JSON.stringify(pack, null, 2),
    "```",
  ].join("\n");
}

export function packMarkdown(pack: Pack, familyFallback: FamilyFallbackCard[] = []): string {
  switch (pack.kind) {
    case "direction":
      return directionMarkdown(pack);
    case "palette":
      return paletteMarkdown(pack);
    case "brand":
      return brandMarkdown(pack);
    case "domain":
      return domainMarkdown(pack, familyFallback);
    case "guideline":
      return guidelineMarkdown(pack);
    case "reference":
      return referenceMarkdown(pack);
    case "site":
      return siteMarkdown(pack);
    default:
      return genericMarkdown(pack);
  }
}

export class GetService {
  private readonly loader: ContentLoader;
  private readonly search: SearchService;

  constructor(loader: ContentLoader, search: SearchService) {
    this.loader = loader;
    this.search = search;
  }

  private async familyFallbackFor(pack: Pack): Promise<FamilyFallbackCard[]> {
    if (pack.kind !== "domain" || pack.playbook) return [];
    const domains = await this.loader.domains();
    return domains
      .filter(
        (candidate) =>
          candidate.id !== pack.id &&
          candidate.family === pack.family &&
          Boolean(candidate.playbook) &&
          candidate.status === "available",
      )
      .sort((a, b) => Number(b.launchTier) - Number(a.launchTier) || a.name.localeCompare(b.name))
      .map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        summary: summarize(candidate.summary, 180),
        depth: candidate.depth,
        launchTier: candidate.launchTier,
      }));
  }

  async get(request: GetRequest): Promise<GetResponse> {
    const format = request.format ?? "brief";
    // A full reference body is the point of includeBody. Use the maximum
    // budget unless the caller explicitly asked for a smaller response.
    const defaultMaxTokens = request.includeBody ? MAX_TOKENS_LIMIT : DEFAULT_GET_MAX_TOKENS;
    const maxTokens = clampMaxTokens(request.maxTokens, defaultMaxTokens);
    const ids = (Array.isArray(request.ids) ? request.ids : [request.ids])
      .map((id) => id.trim())
      .filter(Boolean);
    const packs: Pack[] = [];
    const missing: string[] = [];
    for (const id of ids) {
      const pack = await this.loader.pack(id);
      if (pack) packs.push(pack);
      else missing.push(id);
    }

    const suggestions =
      missing.length > 0
        ? (await Promise.all(missing.slice(0, 3).map((id) => this.search.suggest(id, 3))))
            .flat()
            .slice(0, 6)
        : [];

    const fallbackById = new Map(
      await Promise.all(
        packs
          .filter((pack) => pack.kind === "domain" && !pack.playbook)
          .map(async (pack) => [pack.id, await this.familyFallbackFor(pack)] as const),
      ),
    );

    if (format === "markdown") {
      const markdown = packs
        .map((pack) => packMarkdown(pack, fallbackById.get(pack.id) ?? []))
        .join("\n\n---\n\n");
      const fitted = fitText(markdown || missingMarkdown(missing), maxTokens);
      return {
        format,
        count: packs.length,
        packs: [fitted.value],
        missing,
        suggestions,
        truncated: fitted.truncated,
      };
    }

    const projected = packs.map((pack) =>
      format === "brief"
        ? briefProjection(pack, request.includeBody, fallbackById.get(pack.id) ?? [])
        : pack,
    );
    const response: GetResponse = {
      format,
      count: projected.length,
      packs: projected,
      missing,
      suggestions,
      truncated: false,
    };
    if (response.count === 0 && missing.length === 0) {
      response.missing.push("(no ids supplied)");
    }
    const fitted = fitJson(response, maxTokens, { optionalKeys: ["suggestions"] });
    return { ...fitted.value, truncated: fitted.truncated };
  }
}

function missingMarkdown(missing: string[]): string {
  if (missing.length === 0) return "_No content requested._";
  return [
    "# Content not found",
    "",
    ...missing.map((id) => `- \`${escapeMarkdown(id)}\``),
    "",
    "Use `taste_search` to find a valid id.",
  ].join("\n");
}

export { estimateTokens };
