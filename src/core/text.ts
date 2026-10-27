const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "with",
]);

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function stripMarkdown(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^>\s?/gm, "")
      .replace(/^[-*+]\s+/gm, "")
      .replace(/^\d+\.\s+/gm, "")
      .replace(/[*_~]/g, "")
      .replace(/\|/g, " "),
  );
}

/**
 * Return the first sentence-ish unit. Design prose uses em dashes and
 * abbreviations heavily, so this deliberately stops only on sentence-ending
 * punctuation followed by whitespace and a capital/quote, or at a hard cap.
 */
export function firstSentence(value: string, maxLength = 320): string {
  const text = normalizeWhitespace(value);
  if (!text) return "";
  const match = text.match(/^(.{20,}?[.!?])(?:\s+["“([]?[A-Z0-9])/u);
  const candidate = match?.[1] ?? text;
  return truncateAtWord(candidate, maxLength);
}

export function summarize(value: string, maxLength = 240): string {
  const text = stripMarkdown(value);
  if (text.length <= maxLength) return text;
  return truncateAtWord(text, maxLength);
}

export function truncateAtWord(value: string, maxLength: number): string {
  if (maxLength <= 0) return "";
  if (value.length <= maxLength) return value;
  const slice = value.slice(0, Math.max(0, maxLength - 1));
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > maxLength * 0.55 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeWhitespace(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

export function asArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item : String(item ?? "")))
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

export function approxTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

export function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}[\]()#+.!|>~-])/g, "\\$1");
}

export function extractHeadings(markdown: string): string[] {
  const headings: string[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (match?.[1]) headings.push(normalizeWhitespace(match[1]));
  }
  return headings;
}

export function firstParagraph(markdown: string): string {
  const withoutFrontmatter = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  const paragraphs = withoutFrontmatter
    .split(/\r?\n\s*\r?\n/)
    .filter((part) => part.trim() && !part.trimStart().startsWith("#"))
    .map((part) => stripMarkdown(part))
    .filter(Boolean);
  return paragraphs[0] ?? "";
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

export function searchTerms(text: string): string[] {
  return tokenize(text).filter((term) => !STOPWORDS.has(term) && term.length > 1);
}

/**
 * Very light stemming. MiniSearch does not ship a stemmer; this handles the
 * plural forms that matter for browsing ("dashboards", "palettes", "fonts").
 */
export function stemTerm(term: string): string {
  if (term.length > 4 && term.endsWith("ies")) return `${term.slice(0, -3)}y`;
  if (term.length > 4 && term.endsWith("ses")) return term.slice(0, -2);
  if (term.length > 4 && term.endsWith("s") && !term.endsWith("ss")) return term.slice(0, -1);
  return term;
}

export function isStopword(term: string): boolean {
  return STOPWORDS.has(term);
}

export function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function deepClone<T>(value: T): T {
  return structuredClone(value);
}
