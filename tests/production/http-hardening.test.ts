import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it } from "vitest";
import { createTasteProContext } from "../../src/server/context.js";
import { createHttpApp, type RunningHttpServer, startHttpServer } from "../../src/server/http.js";
import { createLogger } from "../../src/server/logger.js";

const context = createTasteProContext();
const logger = createLogger("silent");
const running: RunningHttpServer[] = [];

async function start(options: Partial<Parameters<typeof startHttpServer>[0]> = {}) {
  const server = await startHttpServer({
    ...options,
    context: options.context ?? context,
    host: options.host ?? "127.0.0.1",
    port: 0,
    sessionMode: options.sessionMode ?? "stateful",
    logger,
  });
  running.push(server);
  return server;
}

async function connect(url: string, name = "hardening-test") {
  const transport = new StreamableHTTPClientTransport(new URL(`${url}/mcp`));
  const client = new Client({ name, version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  return { client, transport };
}

afterEach(async () => {
  await Promise.all(running.splice(0).map((server) => server.close()));
});

describe("HTTP hardening", () => {
  it("enforces the Host allowlist", async () => {
    const { app, close } = createHttpApp({
      context,
      allowedHosts: ["mcp.example.com"],
      logger,
    });
    try {
      const allowed = await app.request("/healthz", {
        headers: { host: "mcp.example.com" },
      });
      expect(allowed.status).toBe(200);

      const allowedWithPort = await app.request("/healthz", {
        headers: { host: "mcp.example.com:8443" },
      });
      expect(allowedWithPort.status).toBe(200);

      const denied = await app.request("/healthz", {
        headers: { host: "evil.example.com" },
      });
      expect(denied.status).toBe(403);
      expect(await denied.json()).toEqual({ error: "forbidden_host" });
    } finally {
      await close();
    }
  });

  it("denies browser origins by default", async () => {
    const { app, close } = createHttpApp({ context, logger });
    try {
      const response = await app.request("/mcp", {
        method: "OPTIONS",
        headers: {
          origin: "https://app.example.com",
          "access-control-request-method": "POST",
        },
      });
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    } finally {
      await close();
    }
  });

  it("rejects an untrusted Origin before creating a session", async () => {
    const { app, close } = createHttpApp({
      context,
      corsOrigin: "https://app.example.com",
      sessionMode: "stateful",
      logger,
    });
    try {
      const init = JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "origin-test", version: "0.0.0" },
        },
      });
      const denied = await app.request("/mcp", {
        method: "POST",
        headers: {
          origin: "https://evil.example.com",
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: init,
      });
      expect(denied.status).toBe(403);
      expect(await denied.json()).toEqual({ error: "forbidden_origin" });

      const allowed = await app.request("/mcp", {
        method: "POST",
        headers: {
          origin: "https://app.example.com",
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: init,
      });
      expect(allowed.status).toBe(200);
      expect(allowed.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
      expect(allowed.headers.get("mcp-session-id")).toBeTruthy();
    } finally {
      await close();
    }
  });

  it("refuses a non-loopback bind without an API key", async () => {
    await expect(start({ host: "0.0.0.0" })).rejects.toThrow(/TASTEPRO_API_KEY|API key/i);
  });

  it("refuses a non-loopback bind without an explicit Host allowlist", async () => {
    await expect(start({ host: "0.0.0.0", apiKey: "secret" })).rejects.toThrow(
      /TASTEPRO_ALLOWED_HOSTS|allowed hosts/i,
    );
  });

  it("still requires a Host allowlist for an explicitly anonymous non-loopback bind", async () => {
    await expect(start({ host: "0.0.0.0", allowAnonymous: true })).rejects.toThrow(
      /TASTEPRO_ALLOWED_HOSTS|allowed hosts/i,
    );
  });

  it("keeps loopback development unauthenticated", async () => {
    const server = await start();
    const response = await fetch(`${server.url}/healthz`);
    expect(response.status).toBe(200);
  });

  it("rejects oversized bodies before parsing", async () => {
    const server = await start();
    const padding = "x".repeat(1_048_576 + 10);
    const response = await fetch(`${server.url}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {},
        padding,
      }),
    });
    expect(response.status).toBe(413);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/Payload Too Large/);
  });

  it("requires the streamable HTTP Accept header", async () => {
    const server = await start();
    const response = await fetch(`${server.url}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    expect(response.status).toBe(406);
    expect((await response.json()) as { error: { code: number } }).toMatchObject({
      error: { code: -32000 },
    });
  });

  it("evicts the oldest session at capacity", async () => {
    const server = await start({ maxSessions: 2 });
    const first = await connect(server.url, "capacity-1");
    const second = await connect(server.url, "capacity-2");
    const third = await connect(server.url, "capacity-3");
    try {
      await expect(
        first.client.callTool({
          name: "taste_search",
          arguments: { query: "fintech", limit: 1 },
        }),
      ).rejects.toThrow(/Session not found|expired|404/i);

      const secondResult = await second.client.callTool({
        name: "taste_search",
        arguments: { query: "music", limit: 1 },
      });
      const thirdResult = await third.client.callTool({
        name: "taste_search",
        arguments: { query: "healthcare", limit: 1 },
      });
      expect(secondResult.isError).toBeFalsy();
      expect(thirdResult.isError).toBeFalsy();
    } finally {
      await Promise.allSettled([first.client.close(), second.client.close(), third.client.close()]);
    }
  });

  it("supports SSE streaming responses when configured", async () => {
    const server = await start({ jsonResponse: false });
    const connected = await connect(server.url, "sse-test");
    try {
      const result = await connected.client.callTool({
        name: "taste_search",
        arguments: { query: "restaurant menu", limit: 1 },
      });
      expect(result.isError).toBeFalsy();
      expect(connected.transport.sessionId).toBeTruthy();
    } finally {
      await connected.client.close();
    }
  });

  it("closes all sessions on shutdown", async () => {
    const server = await start();
    const first = await connect(server.url, "shutdown-1");
    const second = await connect(server.url, "shutdown-2");
    await server.close();
    const index = running.indexOf(server);
    if (index >= 0) running.splice(index, 1);
    await expect(
      first.client.callTool({ name: "taste_search", arguments: { query: "fintech" } }),
    ).rejects.toThrow();
    await expect(
      second.client.callTool({ name: "taste_search", arguments: { query: "fintech" } }),
    ).rejects.toThrow();
    await Promise.allSettled([first.client.close(), second.client.close()]);
  });
});
