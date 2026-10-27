import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fetchCached, fetchJsonCached, mapLimit } from "../../scripts/lib/fetch.js";

const servers: Server[] = [];
const dirs: string[] = [];

async function startServer(
  handler: (request: number) => { status?: number; body: string; contentType?: string },
): Promise<{ url: string; hits: () => number }> {
  let hits = 0;
  const server = createServer((_request, response) => {
    hits += 1;
    const result = handler(hits);
    response.statusCode = result.status ?? 200;
    response.setHeader("content-type", result.contentType ?? "text/plain");
    response.end(result.body);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no server address");
  return { url: `http://127.0.0.1:${address.port}`, hits: () => hits };
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function cacheDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tastepro-fetch-"));
  dirs.push(dir);
  return dir;
}

describe("cached fetch", () => {
  it("fetches once and then serves from the cache", async () => {
    const server = await startServer(() => ({ body: "hello" }));
    const dir = await cacheDir();
    const first = await fetchCached(`${server.url}/file`, "file.txt", { cacheDir: dir });
    const second = await fetchCached(`${server.url}/file`, "file.txt", { cacheDir: dir });
    expect(first).toBe("hello");
    expect(second).toBe("hello");
    expect(server.hits()).toBe(1);
    expect(await readFile(join(dir, "file.txt"), "utf8")).toBe("hello");
  });

  it("refreshes the cache when asked", async () => {
    const server = await startServer((request) => ({ body: `version-${request}` }));
    const dir = await cacheDir();
    expect(await fetchCached(`${server.url}/file`, "file.txt", { cacheDir: dir })).toBe(
      "version-1",
    );
    expect(
      await fetchCached(`${server.url}/file`, "file.txt", {
        cacheDir: dir,
        refresh: true,
      }),
    ).toBe("version-2");
    expect(server.hits()).toBe(2);
  });

  it("uses the cache in offline mode and fails clearly when it is missing", async () => {
    const server = await startServer(() => ({ body: "offline" }));
    const dir = await cacheDir();
    await fetchCached(`${server.url}/file`, "file.txt", { cacheDir: dir });
    const cached = await fetchCached(`${server.url}/file`, "file.txt", {
      cacheDir: dir,
      offline: true,
    });
    expect(cached).toBe("offline");
    await expect(
      fetchCached(`${server.url}/missing`, "missing.txt", {
        cacheDir: dir,
        offline: true,
      }),
    ).rejects.toThrow(/Offline mode/);
  });

  it("retries transient failures", async () => {
    const server = await startServer((request) =>
      request === 1 ? { status: 500, body: "nope" } : { body: "recovered" },
    );
    const dir = await cacheDir();
    const text = await fetchCached(`${server.url}/file`, "file.txt", {
      cacheDir: dir,
      retries: 2,
    });
    expect(text).toBe("recovered");
    expect(server.hits()).toBe(2);
  });

  it("reports the final failure", async () => {
    const server = await startServer(() => ({ status: 503, body: "down" }));
    const dir = await cacheDir();
    await expect(
      fetchCached(`${server.url}/file`, "file.txt", {
        cacheDir: dir,
        retries: 2,
      }),
    ).rejects.toThrow(/HTTP 503/);
  });

  it("parses JSON and reports invalid JSON", async () => {
    const server = await startServer(() => ({
      body: '{"ok":true}',
      contentType: "application/json",
    }));
    const dir = await cacheDir();
    await expect(
      fetchJsonCached<{ ok: boolean }>(`${server.url}/data`, "data.json", { cacheDir: dir }),
    ).resolves.toEqual({ ok: true });

    const bad = await startServer(() => ({ body: "{oops", contentType: "application/json" }));
    await expect(fetchJsonCached(`${bad.url}/data`, "bad.json", { cacheDir: dir })).rejects.toThrow(
      /Invalid JSON/,
    );
  });

  it("maps with bounded concurrency and preserves order", async () => {
    let active = 0;
    let peak = 0;
    const results = await mapLimit([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return value * 2;
    });
    expect(results).toEqual([2, 4, 6, 8, 10]);
    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBeGreaterThan(1);
  });
});
