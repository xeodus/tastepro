import { afterEach, describe, expect, it } from "vitest";
import { serveHttp } from "../../src/server/serve.js";

const bunKey = "Bun";
const originalBun = (globalThis as Record<string, unknown>)[bunKey];

afterEach(() => {
  if (originalBun === undefined) {
    delete (globalThis as Record<string, unknown>)[bunKey];
  } else {
    (globalThis as Record<string, unknown>)[bunKey] = originalBun;
  }
});

describe("serveHttp", () => {
  it("uses Bun.serve when the Bun runtime is present", async () => {
    const calls: Array<Record<string, unknown>> = [];
    let stopped = false;
    (globalThis as Record<string, unknown>)[bunKey] = {
      serve(options: Record<string, unknown>) {
        calls.push(options);
        return {
          port: 4321,
          stop(closeActiveConnections: boolean) {
            stopped = closeActiveConnections;
          },
        };
      },
    };

    const handle = await serveHttp({
      fetch: async () => new Response("ok"),
      hostname: "127.0.0.1",
      port: 0,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ hostname: "127.0.0.1", port: 0 });
    expect(handle.url).toBe("http://127.0.0.1:4321");
    await handle.close();
    expect(stopped).toBe(true);
  });
});
