import type {
  AppPatternPack,
  AppShellPack,
  AppStylePack,
  DirectionPack,
  HeroPack,
  MotionPack,
  PalettePack,
  Provenance,
  ReferencePack,
  SectionPack,
  SitePack,
  SourceId,
  TypePack,
} from "../../src/core/schema.js";
import {
  asArray,
  asRecord,
  extractHeadings,
  firstParagraph,
  firstSentence,
  normalizeWhitespace,
  summarize,
  uniqueStrings,
} from "../../src/core/text.js";
import { computeContrast, inferMoods } from "./brand.js";
import { mapAppKinds, mapSectors } from "./domains.js";

export interface TasteLibraryInput {
  directions: unknown[];
  palettes: unknown[];
  types: unknown[];
  heroes: unknown[];
  sections: unknown[];
  motions: unknown[];
  sites: unknown[];
  app: Record<string, unknown>;
  photos?: Record<string, unknown>;
}

export interface TasteParseResult {
  directions: DirectionPack[];
  palettes: PalettePack[];
  types: TypePack[];
  heroes: HeroPack[];
  sections: SectionPack[];
  motions: MotionPack[];
  sites: SitePack[];
  appStyles: AppStylePack[];
  appShells: AppShellPack[];
  appPatterns: AppPatternPack[];
  references: ReferencePack[];
  warnings: string[];
}

export type TasteProvenanceFactory = (path: string, transformations?: string[]) => Provenance;

function stringArray(value: unknown): string[] {
  return asArray(value)
    .map((item) => normalizeWhitespace(item))
    .filter(Boolean);
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? normalizeWhitespace(value) : fallback;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function makeDirectionDomains(directions: Array<Record<string, unknown>>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const direction of directions) {
    const id = str(direction.id);
    if (!id) continue;
    map.set(id, mapSectors(stringArray(direction.sectors)));
  }
  return map;
}

function relatedDomains(ids: string[], domainMap: Map<string, string[]>): string[] {
  return uniqueStrings(ids.flatMap((id) => domainMap.get(id) ?? []));
}

function paletteContrast(palette: Record<string, unknown>): PalettePack["contrast"] {
  const pairs: Array<[string, string, string]> = [
    ["bg-ink", str(palette.bg), str(palette.ink)],
    ["bg-muted", str(palette.bg), str(palette.muted)],
    ["accent-accentInk", str(palette.accent), str(palette.accentInk)],
    ["surface-ink", str(palette.surface), str(palette.ink)],
  ];
  const fields = Array.isArray(palette.fields) ? palette.fields : [];
  fields.forEach((field, index) => {
    const record = asRecord(field);
    pairs.push([`field-${index + 1}`, str(record.bg), str(record.ink)]);
  });
  const contrast: NonNullable<PalettePack["contrast"]> = {};
  for (const [name, fg, bg] of pairs) {
    if (!fg || !bg) continue;
    contrast[name] = computeContrast(fg, bg) as NonNullable<PalettePack["contrast"]>[string];
  }
  return contrast;
}

export function parseTasteLibrary(
  input: TasteLibraryInput,
  provenance: TasteProvenanceFactory,
): TasteParseResult {
  const warnings: string[] = [];
  const directionRecords = input.directions.map(asRecord);
  const directionDomains = makeDirectionDomains(directionRecords);

  // Palettes and type pairings are cross-domain, but the site studies that use
  // them carry sectors. Derive domains from `seenIn` so a domain-filtered
  // search can find the visual ingredients used in that domain.
  const siteDomains = new Map<string, string[]>();
  for (const site of input.sites.map(asRecord)) {
    const id = str(site.id);
    const kind = str(site.kind);
    const domains = mapSectors(kind ? [kind] : []);
    siteDomains.set(id, domains);
    siteDomains.set(`site/${id}`, domains);
  }
  const domainsFromSites = (seenIn: readonly string[]): string[] => {
    const domains = new Set<string>();
    for (const id of seenIn) {
      for (const domain of siteDomains.get(id) ?? siteDomains.get(`site/${id}`) ?? []) {
        domains.add(domain);
      }
    }
    return [...domains].sort();
  };

  const directions: DirectionPack[] = directionRecords.map((direction) => {
    const id = str(direction.id);
    const name = str(direction.name, id);
    const idea = str(direction.idea);
    const tones = stringArray(direction.tones);
    const tags = uniqueStrings([
      ...tones,
      ...stringArray(direction.paletteTags),
      ...stringArray(direction.sectionTags),
      ...stringArray(direction.typeClasses),
      str(direction.motion),
    ]).filter(Boolean);
    return {
      id: `direction/${id}`,
      kind: "direction",
      name,
      summary: summarize(idea, 300),
      domains: mapSectors(stringArray(direction.sectors)),
      sectors: stringArray(direction.sectors),
      tags,
      moods: tones,
      quality: "verified",
      provenance: provenance("skills/taste-skill/library/directions.json", [
        "normalized sector vocabulary",
        "derived compact summary from idea",
      ]),
      sourceUrl: "https://github.com/Leonxlnx/taste-skill",
      tones,
      needs: stringArray(direction.needs),
      idea,
      composition: str(direction.composition),
      typography: str(direction.typography),
      typeClasses: stringArray(direction.typeClasses),
      colour: str(direction.colour),
      paletteTags: stringArray(direction.paletteTags),
      imagery: str(direction.imagery),
      sectionTags: stringArray(direction.sectionTags),
      motion: str(direction.motion),
      richness: str(direction.richness),
      pitfalls: str(direction.pitfalls),
      seenIn: stringArray(direction.seenIn),
      allow: stringArray(direction.allow),
    };
  });

  const palettes: PalettePack[] = input.palettes.map(asRecord).map((palette) => {
    const id = str(palette.id);
    const note = str(palette.note);
    const tags = stringArray(palette.tags);
    const seenIn = stringArray(palette.seenIn);
    return {
      id: `palette/${id}`,
      kind: "palette",
      name: str(palette.name, id),
      summary: summarize(note, 300),
      domains: domainsFromSites(seenIn),
      sectors: [],
      tags,
      moods: inferMoods(`${note} ${tags.join(" ")}`),
      quality: "verified",
      provenance: provenance("skills/taste-skill/library/palettes.json", [
        "computed WCAG contrast for core pairs",
      ]),
      sourceUrl: "https://github.com/Leonxlnx/taste-skill",
      bg: str(palette.bg),
      surface: str(palette.surface),
      ink: str(palette.ink),
      muted: str(palette.muted),
      accent: str(palette.accent),
      accentInk: str(palette.accentInk),
      fields: Array.isArray(palette.fields)
        ? palette.fields.map((field) => {
            const record = asRecord(field);
            return { bg: str(record.bg), ink: str(record.ink) };
          })
        : [],
      note,
      seenIn,
      contrast: paletteContrast(palette),
    };
  });

  const types: TypePack[] = input.types.map(asRecord).map((type) => {
    const id = str(type.id);
    const note = str(type.note);
    const display = asRecord(type.display);
    const text = asRecord(type.text);
    const seenIn = stringArray(type.seenIn);
    return {
      id: `type/${id}`,
      kind: "type",
      name: str(type.name, id),
      summary: summarize(note, 300),
      domains: domainsFromSites(seenIn),
      sectors: [],
      tags: uniqueStrings([
        str(type.class),
        ...stringArray(type.standsInFor),
        str(display.source),
        "type-pairing",
      ]),
      moods: inferMoods(note),
      quality: "verified",
      provenance: provenance("skills/taste-skill/library/type.json", [
        "flattened reserved `class` field to `typeClass`",
      ]),
      sourceUrl: "https://github.com/Leonxlnx/taste-skill",
      typeClass: str(type.class),
      display: Object.keys(display).length > 0 ? (display as TypePack["display"]) : undefined,
      text: Object.keys(text).length > 0 ? (text as TypePack["text"]) : undefined,
      standsInFor: stringArray(type.standsInFor),
      note,
      seenIn,
      links: stringArray(type.links),
      scale: Object.fromEntries(
        Object.entries(asRecord(type.scale)).map(([key, value]) => [key, str(value)]),
      ),
    };
  });

  const heroes: HeroPack[] = input.heroes.map(asRecord).map((hero) => {
    const id = str(hero.id);
    const directionIds = stringArray(hero.directions);
    const blueprint = str(hero.blueprint);
    return {
      id: `hero/${id}`,
      kind: "hero",
      name: str(hero.name, id),
      summary: summarize(firstSentence(blueprint), 300),
      domains: relatedDomains(directionIds, directionDomains),
      sectors: [],
      tags: uniqueStrings([
        str(hero.archetype),
        ...directionIds,
        ...stringArray(hero.needs),
        str(hero.motion),
      ]),
      moods: inferMoods(`${str(hero.name)} ${blueprint}`),
      quality: "verified",
      provenance: provenance("skills/taste-skill/library/heroes.json", [
        "derived domains from related directions",
        "derived compact summary from blueprint",
      ]),
      sourceUrl: "https://github.com/Leonxlnx/taste-skill",
      archetype: str(hero.archetype),
      directions: directionIds,
      needs: stringArray(hero.needs),
      blueprint,
      mobile: str(hero.mobile),
      headline: str(hero.headline),
      motion: str(hero.motion),
      seenIn: stringArray(hero.seenIn),
    };
  });

  const sections: SectionPack[] = input.sections.map(asRecord).map((section) => {
    const id = str(section.id);
    const directionIds = stringArray(section.directions);
    const blueprint = str(section.blueprint);
    return {
      id: `section/${id}`,
      kind: "section",
      name: str(section.name, id),
      summary: summarize(firstSentence(blueprint), 300),
      domains: relatedDomains(directionIds, directionDomains),
      sectors: [],
      tags: uniqueStrings([
        str(section.role),
        str(section.shape),
        ...stringArray(section.tags),
        ...directionIds,
      ]),
      moods: inferMoods(`${str(section.name)} ${stringArray(section.tags).join(" ")}`),
      quality: "verified",
      provenance: provenance("skills/taste-skill/library/sections.json", [
        "derived domains from related directions",
        "derived compact summary from blueprint",
      ]),
      sourceUrl: "https://github.com/Leonxlnx/taste-skill",
      role: str(section.role),
      shape: str(section.shape),
      directions: directionIds,
      needs: stringArray(section.needs),
      blueprint,
      mobile: str(section.mobile),
      seenIn: stringArray(section.seenIn),
    };
  });

  const motions: MotionPack[] = input.motions.map(asRecord).map((motion) => {
    const id = str(motion.id);
    const description = str(motion.description);
    return {
      id: `motion/${id}`,
      kind: "motion",
      name: str(motion.name, id),
      summary: summarize(firstSentence(description), 300),
      domains: [],
      sectors: [],
      tags: ["motion", "animation"],
      moods: inferMoods(description),
      quality: "verified",
      provenance: provenance("skills/taste-skill/library/motions.json", [
        "derived compact summary from description",
      ]),
      sourceUrl: "https://github.com/Leonxlnx/taste-skill",
      description,
    };
  });

  const sites: SitePack[] = input.sites.map(asRecord).map((site) => {
    const id = str(site.id);
    const kind = str(site.kind);
    const moods = stringArray(site.mood);
    const idea = str(site.idea);
    return {
      id: `site/${id}`,
      kind: "site",
      name: str(site.name, id),
      summary: summarize(idea, 320),
      domains: mapSectors(kind ? [kind] : []),
      sectors: kind ? [kind] : [],
      tags: uniqueStrings([kind, str(site.archetype), ...moods, "studied-site"]),
      moods,
      quality: "reference",
      provenance: provenance("skills/taste-skill/library/sites.json", [
        "normalized upstream site study",
        "kept reference URL; no third-party screenshots redistributed",
      ]),
      sourceUrl: str(site.url),
      url: str(site.url),
      sourceLabel: str(site.source),
      score: num(site.score),
      idea,
      archetype: str(site.archetype),
      hero: str(site.hero),
      type: str(site.type),
      colour: str(site.colour),
      imagery: str(site.imagery),
      layout: str(site.layout),
      sections: Array.isArray(site.sections)
        ? site.sections.map((entry) => {
            const record = asRecord(entry);
            return { role: str(record.role), description: str(record.description) };
          })
        : [],
      steal: stringArray(site.steal),
      media: str(site.media),
      motion: str(site.motion),
    };
  });

  const app = input.app;
  const appStyles: AppStylePack[] = (Array.isArray(app.styles) ? app.styles : [])
    .map(asRecord)
    .map((style) => {
      const id = str(style.id);
      const suits = stringArray(style.suits);
      const idea = str(style.idea);
      return {
        id: `app-style/${id}`,
        kind: "app-style",
        name: str(style.name, id),
        summary: summarize(idea, 320),
        domains: mapAppKinds(suits),
        sectors: suits,
        tags: uniqueStrings([
          str(style.theme),
          str(style.shell),
          ...suits,
          ...stringArray(style.shellAlternatives),
          "app-style",
        ]),
        moods: inferMoods(`${str(style.name)} ${idea}`),
        quality: "verified",
        provenance: provenance("skills/taste-skill/library/app.json", [
          "normalized app style library",
        ]),
        sourceUrl: "https://github.com/Leonxlnx/taste-skill",
        theme: ["light", "dark", "mixed"].includes(str(style.theme))
          ? (str(style.theme) as AppStylePack["theme"])
          : "light",
        basis: str(style.basis),
        suits,
        idea,
        colourBudget: str(style.colourBudget),
        tokens: asRecord(style.tokens),
        shell: str(style.shell),
        shellAlternatives: stringArray(style.shellAlternatives),
        signature: str(style.signature),
        identity: stringArray(style.identity),
        avoid: stringArray(style.avoid),
        notes: str(style.notes),
      };
    });

  const appShells: AppShellPack[] = (Array.isArray(app.shells) ? app.shells : [])
    .map(asRecord)
    .map((shell) => {
      const id = str(shell.id);
      const suits = stringArray(shell.suits);
      const blueprint = str(shell.blueprint);
      return {
        id: `app-shell/${id}`,
        kind: "app-shell",
        name: str(shell.name, id),
        summary: summarize(firstSentence(blueprint), 300),
        domains: mapAppKinds(suits),
        sectors: suits,
        tags: uniqueStrings([...suits, "app-shell"]),
        moods: inferMoods(`${str(shell.name)} ${blueprint}`),
        quality: "verified",
        provenance: provenance("skills/taste-skill/library/app.json", [
          "normalized app shell library",
        ]),
        sourceUrl: "https://github.com/Leonxlnx/taste-skill",
        basis: str(shell.basis),
        suits,
        numbers: asRecord(shell.numbers),
        blueprint,
        phone: str(shell.phone),
      };
    });

  const appPatterns: AppPatternPack[] = (Array.isArray(app.patterns) ? app.patterns : [])
    .map(asRecord)
    .map((pattern) => {
      const id = str(pattern.id);
      const kinds = stringArray(pattern.kinds);
      const blueprint = str(pattern.blueprint);
      return {
        id: `app-pattern/${id}`,
        kind: "app-pattern",
        name: str(pattern.name, id),
        summary: summarize(firstSentence(blueprint), 300),
        domains: mapAppKinds(kinds),
        sectors: kinds,
        tags: uniqueStrings([str(pattern.screen), ...kinds, "app-pattern"]),
        moods: inferMoods(`${str(pattern.name)} ${blueprint}`),
        quality: "verified",
        provenance: provenance("skills/taste-skill/library/app.json", [
          "normalized app pattern library",
        ]),
        sourceUrl: "https://github.com/Leonxlnx/taste-skill",
        screen: str(pattern.screen),
        kinds,
        basis: str(pattern.basis),
        blueprint,
        phone: str(pattern.phone),
      };
    });

  const references: ReferencePack[] = [];
  if (input.photos) {
    const photos = input.photos;
    const sets = asRecord(photos.sets);
    const bodyLines: string[] = [
      "# Taste Skill photo sets",
      "",
      `Source: ${str(photos.source, "Lorem Picsum")}`,
      "",
      "These are atmosphere references, not bundled images. Use the source URL pattern and credit the photographer when you use an image.",
      "",
      `URL pattern: \`${str(photos.url, "https://picsum.photos/id/{id}/{width}/{height}")}\``,
      "",
    ];
    for (const [setId, value] of Object.entries(sets)) {
      const set = asRecord(value);
      bodyLines.push(`## ${str(set.title, setId)}`, "");
      bodyLines.push(`Set: \`${setId}\``, "");
      bodyLines.push(str(set.note), "");
      bodyLines.push(`- Sectors: ${stringArray(set.sectors).join(", ") || "—"}`);
      bodyLines.push(`- Keywords: ${stringArray(set.keywords).join(", ") || "—"}`);
      bodyLines.push(`- Photos: ${Array.isArray(set.photos) ? set.photos.length : 0}`);
      bodyLines.push("");
    }
    const body = bodyLines.join("\n");
    const allSectors = Object.values(sets).flatMap((value) => stringArray(asRecord(value).sectors));
    const allKeywords = Object.values(sets).flatMap((value) =>
      stringArray(asRecord(value).keywords),
    );
    references.push({
      id: "reference/taste-skill-photo-sets",
      kind: "reference",
      name: "Taste Skill photo sets",
      summary:
        "Nineteen curated photo directions for atmosphere, with source links and credit guidance; no images are bundled.",
      domains: mapSectors(allSectors),
      sectors: uniqueStrings(allSectors),
      tags: uniqueStrings(["photos", "imagery", ...allKeywords]),
      moods: inferMoods(allKeywords.join(" ")),
      quality: "verified",
      provenance: provenance("skills/taste-skill/library/photos.json", [
        "converted photo library metadata to a reference document",
        "did not bundle third-party images",
      ]),
      sourceUrl: "https://picsum.photos",
      title: "Taste Skill photo sets",
      headings: extractHeadings(body),
      bodyPath: "references/taste-skill/photo-sets.md",
      body,
      useFor: ["imagery", "art-direction"],
    });
  }

  if (directions.length === 0) warnings.push("taste-skill directions library was empty");
  if (palettes.length === 0) warnings.push("taste-skill palettes library was empty");
  if (sections.length === 0) warnings.push("taste-skill sections library was empty");

  return {
    directions,
    palettes,
    types,
    heroes,
    sections,
    motions,
    sites,
    appStyles,
    appShells,
    appPatterns,
    references,
    warnings,
  };
}

export interface ReferenceInput {
  slug: string;
  title?: string;
  body: string;
  bodyPath: string;
  useFor: string[];
  source: SourceId;
  quality: "verified" | "reference";
  sourceUrl: string;
  provenance: Provenance;
  domains?: string[];
}

export function parseReference(input: ReferenceInput): ReferencePack {
  const firstHeading = input.body.match(/^#\s+(.+?)\s*$/m)?.[1];
  const title = normalizeWhitespace(input.title ?? firstHeading ?? input.slug);
  const summary =
    summarize(firstParagraph(input.body), 320) ||
    summarize(firstSentence(input.body.replace(/^#.*$/gm, "")), 320) ||
    title;
  return {
    id: `reference/${input.source}-${input.slug}`,
    kind: "reference",
    name: title,
    summary,
    domains: input.domains ?? [],
    sectors: [],
    tags: uniqueStrings(["reference", input.source, input.slug, ...input.useFor]),
    moods: inferMoods(summary),
    quality: input.quality,
    provenance: {
      ...input.provenance,
      transformations: [
        ...(input.provenance.transformations ?? []),
        "kept as a readable reference document",
      ],
    },
    sourceUrl: input.sourceUrl,
    title,
    headings: extractHeadings(input.body),
    bodyPath: input.bodyPath,
    body: input.body,
    useFor: input.useFor,
  };
}
