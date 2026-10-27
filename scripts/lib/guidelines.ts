import type { GuidelinePack, Provenance } from "../../src/core/schema.js";
import {
  normalizeWhitespace,
  searchTerms,
  slugify,
  summarize,
  uniqueStrings,
} from "../../src/core/text.js";

const CATEGORY_SLUGS: Record<string, string> = {
  Accessibility: "accessibility",
  "Focus States": "focus",
  Forms: "forms",
  Animation: "animation",
  Typography: "typography",
  "Content Handling": "content",
  Images: "images",
  Performance: "performance",
  "Navigation & State": "navigation",
  "Touch & Interaction": "touch",
  "Safe Areas & Layout": "layout",
  "Dark Mode & Theming": "dark-mode",
  "Locale & i18n": "i18n",
  "Hydration Safety": "hydration",
  "Hover & Interactive States": "hover",
  "Content & Copy": "copy",
  "Anti-patterns (flag these)": "anti-patterns",
};

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  accessibility: ["a11y", "aria", "keyboard", "screen-reader", "semantics"],
  focus: ["focus-visible", "focus", "keyboard"],
  forms: ["form", "input", "label", "validation"],
  animation: ["motion", "reduced-motion", "transition"],
  typography: ["type", "copy", "punctuation"],
  content: ["overflow", "empty-state", "truncation"],
  images: ["image", "alt", "layout-shift"],
  performance: ["performance", "virtualization", "preload"],
  navigation: ["url", "state", "routing"],
  touch: ["touch", "gesture", "mobile"],
  layout: ["layout", "safe-area", "overflow"],
  "dark-mode": ["theme", "dark-mode", "color-scheme"],
  i18n: ["locale", "internationalization", "intl"],
  hydration: ["hydration", "ssr", "client"],
  hover: ["hover", "interactive-state"],
  copy: ["microcopy", "voice", "labels"],
  "anti-patterns": ["anti-pattern", "avoid"],
};

function isErrorRule(category: string, text: string): boolean {
  if (category.toLowerCase().includes("anti-pattern")) return true;
  return /\b(never|must|do not|don't)\b/i.test(text);
}

function extractInstead(text: string): string {
  const match = text.match(/\s(?:→|->)\s*(.+)$/u);
  return match?.[1] ? normalizeWhitespace(match[1]) : "";
}

function extractTags(category: string, text: string): string[] {
  const categorySlug = CATEGORY_SLUGS[category] ?? slugify(category);
  const backtickTokens = [...text.matchAll(/`([^`]+)`/g)]
    .map((match) => match[1] ?? "")
    .flatMap((token) => token.split(/[^a-zA-Z0-9-]+/))
    .filter((token) => token.length > 1);
  const terms = searchTerms(text).slice(0, 6);
  return uniqueStrings([
    categorySlug,
    ...(CATEGORY_KEYWORDS[categorySlug] ?? []),
    ...backtickTokens,
    ...terms,
  ]).slice(0, 12);
}

/**
 * Parse the Vercel Web Interface Guidelines command.md into structured rules.
 * The parser is intentionally line-based: the upstream file is a flat list and
 * preserving the source line is useful for review and citations.
 */
export function parseGuidelines(markdown: string, provenance: Provenance): GuidelinePack[] {
  const lines = markdown.split(/\r?\n/);
  const rules: GuidelinePack[] = [];
  const usedIds = new Set<string>();
  let category = "";
  let current: { text: string; line: number } | null = null;

  const flush = () => {
    if (!current || !category) {
      current = null;
      return;
    }
    const text = normalizeWhitespace(current.text);
    if (!text) {
      current = null;
      return;
    }
    const categorySlug = CATEGORY_SLUGS[category] ?? slugify(category);
    const textSlug = slugify(text).slice(0, 80) || "rule";
    let id = `guideline/${categorySlug}-${textSlug}`;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `guideline/${categorySlug}-${textSlug}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    const instead = extractInstead(text);
    const summary = summarize(text, 240);
    rules.push({
      id,
      kind: "guideline",
      name: summarize(text, 80),
      summary,
      domains: [],
      sectors: [],
      tags: extractTags(category, text),
      moods: [],
      quality: "verified",
      provenance: {
        ...provenance,
        transformations: [
          ...(provenance.transformations ?? []),
          "parsed markdown heading and bullet",
        ],
      },
      sourceUrl: provenance.url,
      text,
      category,
      severity: isErrorRule(category, text) ? "error" : "warn",
      instead,
      scope: "web-ui",
      sourcePath: provenance.path,
      line: current.line,
    });
    current = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const heading = line.match(/^###\s+(.+?)\s*$/);
    if (heading?.[1]) {
      flush();
      category = normalizeWhitespace(heading[1]);
      continue;
    }
    if (/^##\s+/.test(line)) {
      flush();
      category = "";
      continue;
    }
    const bullet = line.match(/^\s*[-*+]\s+(.+?)\s*$/);
    if (bullet?.[1] && category) {
      flush();
      current = { text: bullet[1], line: index + 1 };
      continue;
    }
    if (current && /^\s{2,}\S/.test(line) && !line.includes("|")) {
      current.text = `${current.text} ${line.trim()}`;
      continue;
    }
    if (!line.trim()) {
      flush();
    }
  }
  flush();
  return rules;
}
