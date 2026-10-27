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
  const maxChars = Math.max(0, maxTokens * 4 - notice.length);
  const value = `${truncateAtWord(text, maxChars)}${notice}`;
  return { value, truncated: true, tokens: estimateTokens(value) };
}

type Path = Array<string | number>;

function collectStrings(
  value: unknown,
  path: Path = [],
  out: Array<{ path: Path; length: number }> = [],
): Array<{ path: Path; length: number }> {
  if (typeof value === "string") {
    out.push({ path, length: value.length });
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

/**
 * Fit a JSON value into an approximate token budget. It never invents data:
 * long strings are shortened and, if necessary, optional top-level keys are
 * removed. Required keys are always kept.
 */
export function fitJson<T>(
  value: T,
  maxTokens: number,
  options: { requiredKeys?: string[]; optionalKeys?: string[] } = {},
): BudgetResult<T> {
  const initialTokens = estimateTokens(value);
  if (initialTokens <= maxTokens) {
    return { value, truncated: false, tokens: initialTokens };
  }

  const working = structuredClone(value) as unknown;
  let truncated = false;

  // First pass: shorten the longest strings, repeatedly, until we fit.
  for (let pass = 0; pass < 12; pass += 1) {
    if (estimateTokens(working) <= maxTokens) break;
    const strings = collectStrings(working).sort((a, b) => b.length - a.length);
    if (strings.length === 0) break;
    const target = Math.max(48, Math.min(240, Math.floor(maxTokens * 4 * 0.12)));
    let changed = false;
    for (const item of strings) {
      if (item.length <= target) continue;
      let cursor: any = working;
      for (const segment of item.path) cursor = cursor[segment as any];
      const shortened = truncateAtWord(String(cursor), target);
      if (shortened !== cursor) {
        setAtPath(working, item.path, shortened);
        changed = true;
      }
      if (estimateTokens(working) <= maxTokens) break;
    }
    if (!changed) break;
    truncated = true;
  }

  // Second pass: drop optional top-level keys, least important last.
  for (const key of options.optionalKeys ?? []) {
    if (estimateTokens(working) <= maxTokens) break;
    if (key in (working as Record<string, unknown>)) {
      delete (working as Record<string, unknown>)[key];
      truncated = true;
    }
  }

  // Third pass: if a single remaining field is still too large, truncate it
  // hard. This is a last resort; callers should prefer optionalKeys.
  if (estimateTokens(working) > maxTokens) {
    const strings = collectStrings(working).sort((a, b) => b.length - a.length);
    for (const item of strings) {
      if (estimateTokens(working) <= maxTokens) break;
      const over = estimateTokens(working) - maxTokens;
      const current = (() => {
        let cursor: any = working;
        for (const segment of item.path) cursor = cursor[segment as any];
        return String(cursor);
      })();
      const nextLength = Math.max(32, current.length - over * 4 - 32);
      setAtPath(working, item.path, truncateAtWord(current, nextLength));
      truncated = true;
    }
  }

  return {
    value: working as T,
    truncated,
    tokens: estimateTokens(working),
  };
}
