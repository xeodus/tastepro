import yaml from "js-yaml";
import type { BrandPack, ContrastCheck, Provenance } from "../../src/core/schema.js";
import {
  asRecord,
  normalizeWhitespace,
  slugify,
  summarize,
  uniqueStrings,
} from "../../src/core/text.js";

export interface ContrastResult {
  foreground: string;
  background: string;
  ratio: number;
  aaNormal: boolean;
  aaLarge: boolean;
  aaaNormal: boolean;
}

export interface BrandParseOptions {
  id: string;
  slug: string;
  displayName: string;
  category: string;
  provenance: Provenance;
  domains?: string[];
  sectors?: string[];
  sourceUrl?: string;
  readmePath?: string;
}

function parseHex(value: string): { r: number; g: number; b: number } | null {
  const match = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!match?.[1]) return null;
  let hex = match[1];
  if (hex.length === 3 || hex.length === 4) {
    hex = hex
      .slice(0, 3)
      .split("")
      .map((char) => `${char}${char}`)
      .join("");
  }
  if (hex.length === 8) hex = hex.slice(0, 6);
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function isHexColor(value: string): boolean {
  return parseHex(value) !== null;
}

export function relativeLuminance(value: string): number | null {
  const rgb = parseHex(value);
  if (!rgb) return null;
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

export function computeContrast(foreground: string, background: string): ContrastResult {
  const fg = relativeLuminance(foreground);
  const bg = relativeLuminance(background);
  if (fg === null || bg === null) {
    return {
      foreground,
      background,
      ratio: 0,
      aaNormal: false,
      aaLarge: false,
      aaaNormal: false,
    };
  }
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  const ratio = (lighter + 0.05) / (darker + 0.05);
  return {
    foreground,
    background,
    ratio: Math.round(ratio * 100) / 100,
    aaNormal: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaaNormal: ratio >= 7,
  };
}

function getAtPath(root: unknown, path: string): unknown {
  let cursor: unknown = root;
  for (const segment of path.split(".")) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function resolveValue(value: unknown, root: unknown, unresolved: Set<string>, depth = 0): unknown {
  if (depth > 12) return value;
  if (typeof value === "string") {
    const exact = value.match(/^\{([^{}]+)\}$/);
    if (exact?.[1]) {
      const resolved = getAtPath(root, exact[1]);
      if (resolved === undefined) {
        unresolved.add(exact[1]);
        return value;
      }
      return resolveValue(resolved, root, unresolved, depth + 1);
    }
    if (!value.includes("{")) return value;
    return value.replace(/\{([^{}]+)\}/g, (match, path: string) => {
      const resolved = getAtPath(root, path);
      if (resolved === undefined || typeof resolved === "object") {
        unresolved.add(path);
        return match;
      }
      return String(resolved);
    });
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(item, root, unresolved, depth + 1));
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      result[key] = resolveValue(child, root, unresolved, depth + 1);
    }
    return result;
  }
  return value;
}

export function resolveTokenReferences(root: unknown): {
  value: Record<string, unknown>;
  unresolved: string[];
} {
  const unresolved = new Set<string>();
  const value = resolveValue(asRecord(root), root, unresolved);
  return {
    value: asRecord(value),
    unresolved: [...unresolved].sort(),
  };
}

function splitFrontmatter(raw: string): {
  data: Record<string, unknown>;
  body: string;
  repaired: boolean;
} {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match?.[1]) return { data: {}, body: raw, repaired: false };
  const body = raw.slice(match[0].length);
  const parse = (text: string): Record<string, unknown> | null => {
    try {
      return asRecord(yaml.load(text));
    } catch {
      return null;
    }
  };
  const direct = parse(match[1]);
  if (direct) return { data: direct, body, repaired: false };

  // A handful of upstream DESIGN.md files contain unquoted prose with a colon
  // (for example `description: ... CTAs are subtle: a near-black pill ...`).
  // Repair only top-level scalar values, then retry. This keeps the source
  // content instead of silently turning a complete brand into a stub.
  const repairedYaml = match[1]
    .split(/\r?\n/)
    .map((line) => {
      const scalar = line.match(/^([^\s:]+):\s+(.+)$/);
      if (!scalar?.[1] || !scalar[2]) return line;
      const value = scalar[2];
      if (/^[[{"'|>]/.test(value) || !value.includes(": ")) return line;
      return `${scalar[1]}: ${JSON.stringify(value)}`;
    })
    .join("\n");
  const repaired = parse(repairedYaml);
  if (repaired) return { data: repaired, body, repaired: true };
  return { data: {}, body, repaired: false };
}

function findColor(
  colors: Record<string, unknown>,
  aliases: string[],
): { key: string; value: string } | null {
  const entries = Object.entries(colors);
  for (const alias of aliases) {
    const match = entries.find(([key]) => key.toLowerCase() === alias);
    if (match && typeof match[1] === "string" && isHexColor(match[1])) {
      return { key: match[0], value: match[1] };
    }
  }
  return null;
}

function buildContrast(colors: Record<string, unknown>): {
  contrast: Record<string, ContrastCheck>;
  issues: string[];
} {
  const contrast: Record<string, ContrastCheck> = {};
  const issues: string[] = [];
  const pairs: Array<{
    name: string;
    fg: string[];
    bg: string[];
    minimum: number;
  }> = [
    {
      name: "ink-on-canvas",
      fg: ["ink", "text", "body-strong", "on-light", "foreground"],
      bg: ["canvas", "background", "bg"],
      minimum: 4.5,
    },
    {
      name: "muted-on-canvas",
      fg: ["muted", "mute"],
      bg: ["canvas", "background", "bg"],
      minimum: 4.5,
    },
    {
      name: "on-primary-on-primary",
      fg: ["on-primary", "primary-foreground"],
      bg: ["primary", "accent", "brand"],
      minimum: 4.5,
    },
    {
      name: "on-dark-on-surface-dark",
      fg: ["on-dark"],
      bg: [
        "surface-dark",
        "canvas-dark",
        "canvas-deep",
        "surface-black",
        "carbon",
        "background-dark",
      ],
      minimum: 4.5,
    },
  ];

  for (const pair of pairs) {
    const fg = findColor(colors, pair.fg);
    const bg = findColor(colors, pair.bg);
    if (!fg || !bg) continue;
    const result = computeContrast(fg.value, bg.value);
    contrast[pair.name] = result as ContrastCheck;
    if (result.ratio < pair.minimum) {
      issues.push(
        `${pair.name} is ${result.ratio}:1 (${fg.key} ${fg.value} on ${bg.key} ${bg.value}); needs ${pair.minimum}:1`,
      );
    }
  }
  return { contrast, issues };
}

const MOOD_PATTERNS: Array<{ mood: string; pattern: RegExp }> = [
  { mood: "dark", pattern: /\b(dark|near-black|black canvas|void|midnight)\b/i },
  { mood: "warm", pattern: /\b(warm|cream|terracotta|amber|coral|sand|paper)\b/i },
  { mood: "editorial", pattern: /\b(editorial|serif|magazine|broadsheet|masthead)\b/i },
  { mood: "quiet", pattern: /\b(minimal|quiet|monochrome|stark|restrained|precise)\b/i },
  { mood: "bold", pattern: /\b(bold|monumental|huge|oversized|brutalist)\b/i },
  { mood: "playful", pattern: /\b(playful|colorful|vibrant|friendly|whimsical)\b/i },
  { mood: "technical", pattern: /\b(technical|developer|code|terminal|engineering|data)\b/i },
  { mood: "luxury", pattern: /\b(luxury|premium|cinematic|elegant|high-end)\b/i },
];

export function inferMoods(text: string): string[] {
  return MOOD_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ mood }) => mood);
}

function requiredRecord(
  data: Record<string, unknown>,
  key: string,
  reasons: string[],
  minEntries = 1,
): Record<string, unknown> {
  const value = asRecord(data[key]);
  if (Object.keys(value).length < minEntries) {
    reasons.push(`missing or thin ${key}`);
  }
  return value;
}

export function parseDesignMarkdown(raw: string, options: BrandParseOptions): BrandPack {
  const { data, body, repaired } = splitFrontmatter(raw);
  const resolved = resolveTokenReferences(data);
  const design = resolved.value;
  const colors = asRecord(design.colors);
  const typography = asRecord(design.typography);
  const rounded = asRecord(design.rounded);
  const spacing = asRecord(design.spacing);
  const components = asRecord(design.components);
  const description =
    typeof design.description === "string" ? normalizeWhitespace(design.description) : "";
  const fallbackDescription = summarize(body.replace(/^#.*$/gm, ""), 320);
  const incompleteReasons: string[] = [];

  if (!description || description.length < 40)
    incompleteReasons.push("missing or thin description");
  if (Object.keys(colors).length < 3) incompleteReasons.push("fewer than three color tokens");
  if (Object.keys(typography).length < 2)
    incompleteReasons.push("fewer than two typography tokens");
  requiredRecord(design, "rounded", incompleteReasons);
  requiredRecord(design, "spacing", incompleteReasons);
  requiredRecord(design, "components", incompleteReasons);

  const { contrast, issues } = buildContrast(colors);
  const categorySlug = slugify(options.category) || "reference";
  const colorNames = Object.keys(colors).slice(0, 12);
  const summary = summarize(description || fallbackDescription || options.displayName, 320);
  const moods = inferMoods(`${description} ${options.category}`);

  return {
    id: options.id,
    kind: "brand",
    name: options.displayName,
    summary,
    domains: options.domains ?? [],
    sectors: options.sectors ?? [],
    tags: uniqueStrings([
      categorySlug,
      "brand-reference",
      ...colorNames,
      ...Object.keys(typography).slice(0, 8),
    ]).slice(0, 24),
    moods,
    quality: incompleteReasons.length > 0 ? "incomplete" : "reference",
    provenance: {
      ...options.provenance,
      transformations: [
        ...(options.provenance.transformations ?? []),
        "parsed YAML frontmatter",
        ...(repaired ? ["repaired unquoted YAML prose values"] : []),
        "resolved token references",
        "computed WCAG contrast for core pairs",
      ],
    },
    sourceUrl: options.sourceUrl,
    category: options.category,
    description: description || fallbackDescription,
    colors,
    typography,
    rounded,
    spacing,
    components,
    design,
    contrast,
    contrastIssues: issues,
    incompleteReasons,
    unresolvedTokens: resolved.unresolved,
    readmePath: options.readmePath,
  };
}
