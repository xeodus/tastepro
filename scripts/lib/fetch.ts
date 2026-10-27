import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface FetchCacheOptions {
  cacheDir: string;
  offline?: boolean;
  refresh?: boolean;
  retries?: number;
  timeoutMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function readCached(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

export async function fetchCached(
  url: string,
  relativePath: string,
  options: FetchCacheOptions,
): Promise<string> {
  const cachePath = join(options.cacheDir, relativePath);
  if (!options.refresh) {
    const cached = await readCached(cachePath);
    if (cached !== null) return cached;
  }
  if (options.offline) {
    throw new Error(
      `Offline mode: missing cached source ${cachePath}. Run npm run ingest once with network access.`,
    );
  }

  const retries = options.retries ?? 3;
  const timeoutMs = options.timeoutMs ?? 30_000;
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "tastepro-ingest/0.1 (+https://github.com/tastepro/tastepro)",
          Accept: "text/plain, application/json, text/markdown, */*",
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
      }
      const text = await response.text();
      await mkdir(dirname(cachePath), { recursive: true });
      const temporary = `${cachePath}.tmp-${process.pid}`;
      await writeFile(temporary, text, "utf8");
      await rename(temporary, cachePath);
      return text;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(250 * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(
    `Failed to fetch ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

export async function fetchJsonCached<T>(
  url: string,
  relativePath: string,
  options: FetchCacheOptions,
): Promise<T> {
  const text = await fetchCached(url, relativePath, options);
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(
      `Invalid JSON in ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index] as T, index);
    }
  });
  await Promise.all(runners);
  return results;
}
