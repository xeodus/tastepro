import type { AppPatternPack, Provenance } from "../../../src/core/schema.js";
import { firstSentence, normalizeWhitespace } from "../../../src/core/text.js";
import type { SourceAdapter, SourceContext, SourceResult } from "./types.js";

const COMPONENTS = [
  "button",
  "table",
  "form-group",
  "input",
  "select",
  "popover",
  "message-box",
  "card",
  "icon-tab-bar",
  "breadcrumb",
  "pagination",
  "list",
  "menu",
  "toolbar",
  "wizard",
  "date-picker",
  "checkbox",
  "radio",
  "switch",
  "notification",
];

interface SapGuidance {
  components: Record<
    string,
    {
      name?: unknown;
      category?: unknown;
      description?: unknown;
      whenToUse?: unknown;
      whenToAvoid?: unknown;
      bestPractices?: unknown;
    }
  >;
}

function str(value: unknown): string {
  return typeof value === "string" ? normalizeWhitespace(value) : "";
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => str(item)).filter(Boolean) : [];
}

export function parseSapComponent(
  key: string,
  value: SapGuidance["components"][string],
  provenance: Provenance,
): AppPatternPack {
  const name = str(value.name) || key;
  const description = str(value.description);
  const whenToUse = list(value.whenToUse);
  const whenToAvoid = list(value.whenToAvoid);
  const bestPractices = list(value.bestPractices);
  const sections = [
    description,
    whenToUse.length > 0
      ? `### When to use\n\n${whenToUse.map((item) => `- ${item}`).join("\n")}`
      : "",
    whenToAvoid.length > 0
      ? `### When to avoid\n\n${whenToAvoid.map((item) => `- ${item}`).join("\n")}`
      : "",
    bestPractices.length > 0
      ? `### Best practices\n\n${bestPractices.map((item) => `- ${item}`).join("\n")}`
      : "",
  ].filter(Boolean);
  const blueprint = sections.join("\n\n");
  if (blueprint.length < 200) {
    throw new Error(`SAP component ${key} has too little guidance (${blueprint.length} chars)`);
  }
  return {
    id: `app-pattern/sap-${key}`,
    kind: "app-pattern",
    name,
    summary: description || firstSentence(blueprint, 240),
    domains: ["b2b-saas", "data-analytics", "manufacturing", "logistics", "fintech-payments"],
    sectors: ["enterprise"],
    tags: ["sap", "component", str(value.category), key].filter(Boolean),
    moods: [],
    quality: "verified",
    provenance,
    sourceUrl: "https://sap.github.io/fundamental-styles/",
    screen: key,
    kinds: ["component", "guidance"],
    basis: `a ${name.toLowerCase()} component from SAP Fiori`,
    blueprint,
    phone: "",
  };
}

export const sapAdapter: SourceAdapter = {
  id: "sap",
  async fetch(context: SourceContext): Promise<SourceResult> {
    const data = await context.fetchJson<SapGuidance>("docs/component-guidance.json");
    const provenance = context.provenance("docs/component-guidance.json", [
      "selected description, whenToUse, whenToAvoid, and bestPractices",
      "dropped implementation and token fields",
    ]);
    const packs: AppPatternPack[] = [];
    for (const key of COMPONENTS) {
      const value = data.components[key];
      if (!value) {
        throw new Error(`SAP component guidance is missing ${key}`);
      }
      packs.push(parseSapComponent(key, value, provenance));
    }
    const licenseFile = await context.writeLicense();
    return {
      packs,
      references: [],
      warnings: [],
      sourceInfo: {
        id: "sap",
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
