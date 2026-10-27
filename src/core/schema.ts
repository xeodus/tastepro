import { z } from "zod";

/**
 * Content kinds are intentionally stable strings. They are used as the first
 * segment of every public content id (for example `direction/name-as-monument`)
 * and as the resource path in `tastepro://pack/{id}`.
 */
export const CONTENT_KINDS = [
  "direction",
  "palette",
  "type",
  "hero",
  "section",
  "motion",
  "site",
  "brand",
  "guideline",
  "reference",
  "domain",
  "app-style",
  "app-shell",
  "app-pattern",
] as const;

export type ContentKind = (typeof CONTENT_KINDS)[number];

export const KindSchema = z.enum(CONTENT_KINDS);

/**
 * Quality is a promise, not a vibe:
 *
 * - verified: pinned upstream content plus automated validation, or an original
 *   TastePro asset that passed its audit.
 * - reviewed: a human reviewed the pack against its source.
 * - reference: useful upstream reference data, not independently audited.
 * - draft: not ready to serve by default.
 * - incomplete: missing required material; served only for inspection.
 */
export const QUALITY_LEVELS = ["verified", "reviewed", "reference", "draft", "incomplete"] as const;

export type Quality = (typeof QUALITY_LEVELS)[number];
export const QualitySchema = z.enum(QUALITY_LEVELS);

export const SERVED_QUALITIES: readonly Quality[] = ["verified", "reviewed", "reference"];

export const SOURCE_IDS = [
  "taste-skill",
  "awesome-design-md",
  "web-interface-guidelines",
  "playwright-cli",
  "tastepro",
] as const;

export type SourceId = (typeof SOURCE_IDS)[number];
export const SourceIdSchema = z.enum(SOURCE_IDS);

export const ProvenanceSchema = z
  .object({
    source: SourceIdSchema,
    repo: z.string(),
    commit: z.string(),
    path: z.string(),
    license: z.string(),
    authors: z.array(z.string()).default([]),
    url: z.string().default(""),
    transformations: z.array(z.string()).default([]),
  })
  .passthrough();

export type Provenance = z.infer<typeof ProvenanceSchema>;

const BasePackSchema = z
  .object({
    id: z.string().min(1),
    kind: KindSchema,
    name: z.string().min(1),
    summary: z.string().min(1),
    domains: z.array(z.string()).default([]),
    sectors: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    moods: z.array(z.string()).default([]),
    quality: QualitySchema,
    provenance: ProvenanceSchema,
    sourceUrl: z.string().optional(),
  })
  .passthrough();

export const CatalogEntrySchema = z
  .object({
    id: z.string().min(3),
    kind: KindSchema,
    name: z.string().min(1),
    summary: z.string().min(1),
    domains: z.array(z.string()).default([]),
    sectors: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    moods: z.array(z.string()).default([]),
    quality: QualitySchema,
    status: z.enum(["available", "planned"]).optional(),
    depth: z.enum(["taxonomy", "seed", "playbook"]).optional(),
    source: SourceIdSchema,
    sourceUrl: z.string().optional(),
    metrics: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  })
  .passthrough();

export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;

export const DirectionPackSchema = BasePackSchema.extend({
  kind: z.literal("direction"),
  tones: z.array(z.string()).default([]),
  needs: z.array(z.string()).default([]),
  idea: z.string().default(""),
  composition: z.string().default(""),
  typography: z.string().default(""),
  typeClasses: z.array(z.string()).default([]),
  colour: z.string().default(""),
  paletteTags: z.array(z.string()).default([]),
  imagery: z.string().default(""),
  sectionTags: z.array(z.string()).default([]),
  motion: z.string().default(""),
  richness: z.string().default(""),
  pitfalls: z.string().default(""),
  seenIn: z.array(z.string()).default([]),
  allow: z.array(z.string()).default([]),
});

export const PalettePackSchema = BasePackSchema.extend({
  kind: z.literal("palette"),
  bg: z.string().default(""),
  surface: z.string().default(""),
  ink: z.string().default(""),
  muted: z.string().default(""),
  accent: z.string().default(""),
  accentInk: z.string().default(""),
  fields: z.array(z.object({ bg: z.string(), ink: z.string() }).passthrough()).default([]),
  note: z.string().default(""),
  seenIn: z.array(z.string()).default([]),
  contrast: z
    .record(
      z.string(),
      z
        .object({
          foreground: z.string(),
          background: z.string(),
          ratio: z.number(),
          aaNormal: z.boolean(),
          aaLarge: z.boolean(),
          aaaNormal: z.boolean(),
        })
        .passthrough(),
    )
    .optional(),
});

export const TypeFaceSchema = z
  .object({
    family: z.string().default(""),
    source: z.string().default(""),
    slug: z.string().default(""),
    weights: z.array(z.number()).default([]),
    italic: z.boolean().default(false),
    settings: z.string().default(""),
    css: z.string().default(""),
  })
  .passthrough();

export const TypePackSchema = BasePackSchema.extend({
  kind: z.literal("type"),
  typeClass: z.string().default(""),
  display: TypeFaceSchema.optional(),
  text: TypeFaceSchema.optional(),
  standsInFor: z.array(z.string()).default([]),
  note: z.string().default(""),
  seenIn: z.array(z.string()).default([]),
  links: z.array(z.string()).default([]),
  scale: z.record(z.string(), z.string()).default({}),
});

export const HeroPackSchema = BasePackSchema.extend({
  kind: z.literal("hero"),
  archetype: z.string().default(""),
  directions: z.array(z.string()).default([]),
  needs: z.array(z.string()).default([]),
  blueprint: z.string().default(""),
  mobile: z.string().default(""),
  headline: z.string().default(""),
  motion: z.string().default(""),
  seenIn: z.array(z.string()).default([]),
});

export const SectionPackSchema = BasePackSchema.extend({
  kind: z.literal("section"),
  role: z.string().default(""),
  shape: z.string().default(""),
  directions: z.array(z.string()).default([]),
  needs: z.array(z.string()).default([]),
  blueprint: z.string().default(""),
  mobile: z.string().default(""),
  seenIn: z.array(z.string()).default([]),
});

export const MotionPackSchema = BasePackSchema.extend({
  kind: z.literal("motion"),
  description: z.string().default(""),
});

export const SiteSectionSchema = z
  .object({
    role: z.string().default(""),
    description: z.string().default(""),
  })
  .passthrough();

export const SitePackSchema = BasePackSchema.extend({
  kind: z.literal("site"),
  url: z.string().default(""),
  sourceLabel: z.string().default(""),
  score: z.number().optional(),
  idea: z.string().default(""),
  archetype: z.string().default(""),
  hero: z.string().default(""),
  type: z.string().default(""),
  colour: z.string().default(""),
  imagery: z.string().default(""),
  layout: z.string().default(""),
  sections: z.array(SiteSectionSchema).default([]),
  steal: z.array(z.string()).default([]),
  media: z.string().default(""),
  motion: z.string().default(""),
});

export const ContrastCheckSchema = z
  .object({
    foreground: z.string(),
    background: z.string(),
    ratio: z.number(),
    aaNormal: z.boolean(),
    aaLarge: z.boolean(),
    aaaNormal: z.boolean(),
  })
  .passthrough();

export type ContrastCheck = z.infer<typeof ContrastCheckSchema>;

export const BrandPackSchema = BasePackSchema.extend({
  kind: z.literal("brand"),
  category: z.string().default(""),
  description: z.string().default(""),
  colors: z.record(z.string(), z.unknown()).default({}),
  typography: z.record(z.string(), z.unknown()).default({}),
  rounded: z.record(z.string(), z.unknown()).default({}),
  spacing: z.record(z.string(), z.unknown()).default({}),
  components: z.record(z.string(), z.unknown()).default({}),
  design: z.record(z.string(), z.unknown()).default({}),
  contrast: z.record(z.string(), ContrastCheckSchema).default({}),
  contrastIssues: z.array(z.string()).default([]),
  incompleteReasons: z.array(z.string()).default([]),
  unresolvedTokens: z.array(z.string()).default([]),
  readmePath: z.string().optional(),
});

export const GuidelinePackSchema = BasePackSchema.extend({
  kind: z.literal("guideline"),
  text: z.string().default(""),
  category: z.string().default(""),
  severity: z.enum(["error", "warn", "info"]).default("warn"),
  instead: z.string().default(""),
  scope: z.string().default("web-ui"),
  sourcePath: z.string().default(""),
  line: z.number().int().nonnegative().default(0),
});

export const ReferencePackSchema = BasePackSchema.extend({
  kind: z.literal("reference"),
  title: z.string().default(""),
  headings: z.array(z.string()).default([]),
  bodyPath: z.string().default(""),
  body: z.string().default(""),
  useFor: z.array(z.string()).default([]),
});

export const AppStylePackSchema = BasePackSchema.extend({
  kind: z.literal("app-style"),
  theme: z.enum(["light", "dark", "mixed"]).default("light"),
  basis: z.string().default(""),
  suits: z.array(z.string()).default([]),
  idea: z.string().default(""),
  colourBudget: z.string().default(""),
  tokens: z.record(z.string(), z.unknown()).default({}),
  shell: z.string().default(""),
  shellAlternatives: z.array(z.string()).default([]),
  signature: z.string().default(""),
  identity: z.array(z.string()).default([]),
  avoid: z.array(z.string()).default([]),
  notes: z.string().default(""),
});

export const AppShellPackSchema = BasePackSchema.extend({
  kind: z.literal("app-shell"),
  basis: z.string().default(""),
  suits: z.array(z.string()).default([]),
  numbers: z.record(z.string(), z.unknown()).default({}),
  blueprint: z.string().default(""),
  phone: z.string().default(""),
});

export const AppPatternPackSchema = BasePackSchema.extend({
  kind: z.literal("app-pattern"),
  screen: z.string().default(""),
  kinds: z.array(z.string()).default([]),
  basis: z.string().default(""),
  blueprint: z.string().default(""),
  phone: z.string().default(""),
});

export const DomainPlaybookSchema = z
  .object({
    audience: z.array(z.string()).default([]),
    jobs: z.array(z.string()).default([]),
    trust: z.array(z.string()).default([]),
    informationArchitecture: z.array(z.string()).default([]),
    conversion: z.string().default(""),
    contentChecklist: z.array(z.string()).default([]),
    antiPatterns: z.array(z.string()).default([]),
    signatureMoves: z.array(z.string()).default([]),
    recommendedDirections: z.array(z.string()).default([]),
    recommendedSections: z.array(z.string()).default([]),
    recommendedPalettes: z.array(z.string()).default([]),
    questions: z.array(z.string()).default([]),
    liveThing: z.string().default(""),
    notes: z.string().default(""),
  })
  .passthrough();

export const DomainPackSchema = BasePackSchema.extend({
  kind: z.literal("domain"),
  family: z.string().default(""),
  description: z.string().default(""),
  aliases: z.array(z.string()).default([]),
  status: z.enum(["available", "planned"]).default("planned"),
  depth: z.enum(["taxonomy", "seed", "playbook"]).default("taxonomy"),
  launchTier: z.boolean().default(false),
  upstreamSectors: z.array(z.string()).default([]),
  questions: z.array(z.string()).default([]),
  playbook: DomainPlaybookSchema.optional(),
});

export const SourceInfoSchema = z
  .object({
    id: SourceIdSchema,
    name: z.string(),
    repo: z.string(),
    commit: z.string(),
    license: z.string(),
    licenseFile: z.string().default(""),
    authors: z.array(z.string()).default([]),
    url: z.string().default(""),
    retrievedAt: z.string().default(""),
    notes: z.string().default(""),
    paths: z.record(z.string(), z.string()).default({}),
  })
  .passthrough();

export type SourceInfo = z.infer<typeof SourceInfoSchema>;

export const StatsSchema = z
  .object({
    version: z.number().int().positive(),
    generatedAt: z.string(),
    contentHash: z.string(),
    catalogEntries: z.number().int().nonnegative(),
    counts: z.record(z.string(), z.number().int().nonnegative()),
    quality: z.record(z.string(), z.number().int().nonnegative()),
    sources: z.array(SourceInfoSchema),
    warnings: z.array(z.string()).default([]),
  })
  .passthrough();

export type Stats = z.infer<typeof StatsSchema>;

export const PackSchema = z.union([
  DirectionPackSchema,
  PalettePackSchema,
  TypePackSchema,
  HeroPackSchema,
  SectionPackSchema,
  MotionPackSchema,
  SitePackSchema,
  BrandPackSchema,
  GuidelinePackSchema,
  ReferencePackSchema,
  AppStylePackSchema,
  AppShellPackSchema,
  AppPatternPackSchema,
  DomainPackSchema,
]);

export type DirectionPack = z.infer<typeof DirectionPackSchema>;
export type PalettePack = z.infer<typeof PalettePackSchema>;
export type TypePack = z.infer<typeof TypePackSchema>;
export type HeroPack = z.infer<typeof HeroPackSchema>;
export type SectionPack = z.infer<typeof SectionPackSchema>;
export type MotionPack = z.infer<typeof MotionPackSchema>;
export type SitePack = z.infer<typeof SitePackSchema>;
export type BrandPack = z.infer<typeof BrandPackSchema>;
export type GuidelinePack = z.infer<typeof GuidelinePackSchema>;
export type ReferencePack = z.infer<typeof ReferencePackSchema>;
export type AppStylePack = z.infer<typeof AppStylePackSchema>;
export type AppShellPack = z.infer<typeof AppShellPackSchema>;
export type AppPatternPack = z.infer<typeof AppPatternPackSchema>;
export type DomainPack = z.infer<typeof DomainPackSchema>;
export type Pack = z.infer<typeof PackSchema>;

export const KIND_FILE_NAMES: Record<ContentKind, string> = {
  direction: "directions.json",
  palette: "palettes.json",
  type: "types.json",
  hero: "heroes.json",
  section: "sections.json",
  motion: "motions.json",
  site: "sites.json",
  brand: "brands.json",
  guideline: "guidelines.json",
  reference: "references.json",
  domain: "domains.json",
  "app-style": "app-styles.json",
  "app-shell": "app-shells.json",
  "app-pattern": "app-patterns.json",
};

export const KIND_PRIORITY: Record<ContentKind, number> = {
  domain: 0,
  direction: 1,
  brand: 2,
  site: 3,
  palette: 4,
  type: 5,
  hero: 6,
  section: 7,
  motion: 8,
  "app-style": 9,
  "app-shell": 10,
  "app-pattern": 11,
  guideline: 12,
  reference: 13,
};
