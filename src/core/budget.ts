import { approxTokens, truncateAtWord } from "./text.js";

export interface BudgetResult<T> {
  value: T;
  truncated: boolean;
  tokens: number;
}

export const DEFAULT_SEARCH_MAX_TOKENS = 1_400;
export const DEFAULT_GET_MAX_TOKENS = 2_400;
export const DEFAULT_GUIDELINES_MAX_TOKENS = 1_800;
export const MAX_TOKENS_LIMIT = 24_000;
export const MIN_TOKENS_LIMIT = 128;

export function clampMaxTokens(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(MAX_TOKENS_LIMIT, Math.max(MIN_TOKENS_LIMIT, Math.floor(value as number)));
}

export function estimateTokens(value: unknown): number {
  const text = typeof value === "string" ? value : (JSON.stringify(value) ?? "");
  return approxTokens(text);
}

export function fitText(
  text: string,
  maxTokens: number,
  notice = "\n\n_…truncated to fit the response budget._",
): BudgetResult<string> {
  if (estimateTokens(text) <= maxTokens) {
    return { value: text, truncated: false, tokens: estimateTokens(text) };
  }

  const compactNotice = estimateTokens(notice) > maxTokens ? "\n\n_…truncated._" : notice;
  let maxChars = Math.max(0, maxTokens * 4 - compactNotice.length);
  let value = `${truncateAtWord(text, maxChars)}${compactNotice}`;
  while (maxChars > 0 && estimateTokens(value) > maxTokens) {
    maxChars = Math.max(0, maxChars - 4);
    value = `${truncateAtWord(text, maxChars)}${compactNotice}`;
  }
  return { value, truncated: true, tokens: estimateTokens(value) };
}

type Path = Array<string | number>;

interface StringEntry {
  path: Path;
  value: string;
}

function collectStrings(value: unknown, path: Path = [], out: StringEntry[] = []): StringEntry[] {
  if (typeof value === "string") {
    out.push({ path, value });
    return out;
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      collectStrings(item, [...path, index], out);
    }
    return out;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      collectStrings(child, [...path, key], out);
    }
  }
  return out;
}

function setAtPath(root: unknown, path: Path, next: unknown): void {
  if (path.length === 0) return;
  let cursor: any = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    cursor = cursor[path[index] as string | number];
    if (cursor === undefined || cursor === null) return;
  }
  cursor[path[path.length - 1] as string | number] = next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export interface FitJsonOptions {
  /** Top-level keys that must survive the fit. */
  requiredKeys?: string[];
  /** Top-level keys to drop first, in order. */
  optionalKeys?: string[];
  /** Arrays whose items may be dropped. Defaults to every top-level array. */
  arrayKeys?: string[];
  /** Keys to keep on objects inside arrays, highest priority first. */
  itemKeys?: string[];
}

/**
 * Identity, provenance, and source URLs are either preserved exactly or
 * omitted as a whole. A partial commit hash or repository URL is worse than no
 * provenance at all because it looks verifiable but is not.
 */
const EXACT_KEYS = new Set([
  "id",
  "kind",
  "sourceUrl",
  "url",
  "commit",
  "repo",
  "license",
  "source",
  "path",
  "sourcePath",
  "bodyPath",
  "guidelineId",
]);

const PROTECTED_ITEM_KEYS = new Set(["id", "kind", "name", "text"]);

function isExactPath(path: Path): boolean {
  if (path.includes("provenance")) return true;
  const last = path[path.length - 1];
  return typeof last === "string" && EXACT_KEYS.has(last);
}

/**
 * Fit a JSON value into a token budget. The result never exceeds the budget
 * when the required skeleton is small enough to represent. It preserves data
 * rather than inventing it: long strings are shortened, optional fields are
 * dropped, then array items are removed from the end.
 */
export function fitJson<T>(
  value: T,
  maxTokens: number,
  options: FitJsonOptions = {},
): BudgetResult<T> {
  const initialTokens = estimateTokens(value);
  if (initialTokens <= maxTokens) {
    return { value, truncated: false, tokens: initialTokens };
  }

  const working = structuredClone(value) as any;
  const required = new Set(options.requiredKeys ?? []);
  const fits = (): boolean => estimateTokens(working) <= maxTokens;
  const done = (): BudgetResult<T> => ({
    value: working as T,
    truncated: true,
    tokens: estimateTokens(working),
  });

  // 1. Drop explicitly optional top-level fields.
  if (isRecord(working)) {
    for (const key of options.optionalKeys ?? []) {
      if (fits()) return done();
      if (key in working) delete working[key];
    }
  }
  if (fits()) return done();

  // 2. Shorten long strings progressively. Identity and provenance stay exact.
  for (const target of [256, 160, 96, 64, 32, 16, 8]) {
    if (fits()) break;
    for (const entry of collectStrings(working)) {
      if (entry.value.length <= target) continue;
      if (isExactPath(entry.path)) continue;
      setAtPath(working, entry.path, truncateAtWord(entry.value, target));
    }
  }
  if (fits()) return done();

  // 3. Compact objects inside arrays to the fields the caller needs.
  const arrayKeys =
    options.arrayKeys ??
    (isRecord(working) ? Object.keys(working).filter((key) => Array.isArray(working[key])) : []);
  if (options.itemKeys?.length) {
    const keep = new Set(options.itemKeys);
    for (const key of arrayKeys) {
      if (fits()) break;
      const array = working?.[key];
      if (!Array.isArray(array)) continue;
      for (const item of array) {
        if (!isRecord(item)) continue;
        for (const itemKey of Object.keys(item)) {
          if (!keep.has(itemKey)) delete item[itemKey];
        }
      }
    }
  }
  if (fits()) return done();

  // 3b. Drop item fields in reverse priority order. Identity, provenance, and
  // source URLs are protected here and only dropped as whole fields later.
  if (options.itemKeys?.length) {
    for (let index = options.itemKeys.length - 1; index >= 0 && !fits(); index -= 1) {
      const itemKey = options.itemKeys[index]!;
      if (PROTECTED_ITEM_KEYS.has(itemKey)) continue;
      for (const key of arrayKeys) {
        const array = working?.[key];
        if (!Array.isArray(array)) continue;
        for (const item of array) {
          if (isRecord(item)) delete item[itemKey];
        }
      }
    }
  }
  if (fits()) return done();

  // 4. Drop top-level fields that are not required.
  if (isRecord(working) && required.size > 0) {
    for (const key of Object.keys(working)) {
      if (fits()) break;
      if (!required.has(key)) delete working[key];
    }
  }
  if (fits()) return done();

  // 5. Drop array items from the end, largest arrays first.
  const arrays = arrayKeys
    .map((key) => ({ key, array: working?.[key] }))
    .filter((entry): entry is { key: string; array: unknown[] } => Array.isArray(entry.array))
    .sort((left, right) => right.array.length - left.array.length);
  for (const { array } of arrays) {
    if (fits()) break;
    if (array.length === 0) continue;
    // Find the largest prefix that fits instead of removing one item at a time.
    let low = 0;
    let high = array.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      array.length = middle;
      if (fits()) low = middle;
      else high = middle - 1;
    }
    array.length = low;
  }
  if (fits()) return done();

  // 6. Keep one identity-bearing item per array, then drop provenance only if
  //    the identity alone still cannot fit. Values are never emptied: a field
  //    is either present and exact or absent.
  for (const { array } of arrays) {
    if (fits()) break;
    if (array.length === 0) continue;
    array.splice(1);
    for (const item of array) {
      if (!isRecord(item)) continue;
      for (const itemKey of Object.keys(item)) {
        if (
          ![
            "id",
            "kind",
            "name",
            "text",
            "guidelineId",
            "severity",
            "provenance",
            "sourceUrl",
          ].includes(itemKey)
        ) {
          delete item[itemKey];
        }
      }
    }
  }
  if (fits()) return done();
  for (const { array } of arrays) {
    if (fits()) break;
    for (const item of array) {
      if (!isRecord(item)) continue;
      delete item.provenance;
      delete item.sourceUrl;
    }
  }
  if (fits()) return done();

  // 7. Even the required skeleton is too large; return the smallest honest
  //    shape we can. Callers see truncated=true and can raise the budget.
  const minimal: Record<string, unknown> = {};
  for (const key of required) {
    const candidate = (value as any)?.[key];
    if (typeof candidate === "string") minimal[key] = truncateAtWord(candidate, 64);
    else if (typeof candidate === "number" || typeof candidate === "boolean") {
      minimal[key] = candidate;
    } else if (Array.isArray(candidate)) {
      const first = candidate[0];
      if (isRecord(first)) {
        const item: Record<string, unknown> = {};
        for (const itemKey of ["id", "kind", "name", "text", "guidelineId", "severity"]) {
          if (typeof first[itemKey] === "string") item[itemKey] = first[itemKey];
        }
        minimal[key] = Object.keys(item).length > 0 ? [item] : [];
      } else if (typeof first === "string") {
        minimal[key] = [first];
      } else {
        minimal[key] = [];
      }
    } else if (isRecord(candidate)) minimal[key] = {};
  }
  minimal.truncated = true;
  return { value: minimal as T, truncated: true, tokens: estimateTokens(minimal) };
}
