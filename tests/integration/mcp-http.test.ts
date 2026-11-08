import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuditService } from "../../src/core/audit.js";
import { createTasteProContext } from "../../src/server/context.js";
import { type RunningHttpServer, startHttpServer } from "../../src/server/http.js";
import { createLogger } from "../../src/server/logger.js";
import { AUDIT_SCOPE } from "../../src/server/server.js";
import { resourceText } from "../helpers/mcp.js";

const apiKey = `test-${randomUUID()}`;
const context = createTasteProContext();
let running: RunningHttpServer;
let client: Client;
let transport: StreamableHTTPClientTransport;

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  return content.map((item) => item.text ?? "").join("\n");
}

async function connectClient(name: string): Promise<{
  client: Client;
  transport: StreamableHTTPClientTransport;
}> {
  const clientTransport = new StreamableHTTPClientTransport(new URL(`${running.url}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
  });
  const mcpClient = new Client({ name, version: "0.1.0" }, { capabilities: {} });
  await mcpClient.connect(clientTransport);
  return { client: mcpClient, transport: clientTransport };
}

beforeAll(async () => {
  const guidelines = await context.loader.guidelines();
  running = await startHttpServer({
    context,
    host: "127.0.0.1",
    port: 0,
    apiKey,
    sessionMode: "stateful",
    corsOrigin: "https://app.example.com",
    audit: {
      service: createAuditService({ guidelines }),
      allowUrlFetch: false,
      requiredScope: AUDIT_SCOPE,
    },
    logger: createLogger("silent"),
  });
  const connected = await connectClient("tastepro-http-test");
  client = connected.client;
  transport = connected.transport;
});

afterAll(async () => {
  await client.close();
  await running.close();
});

describe("streamable HTTP transport", () => {
  it("serves anonymous health, readiness, and root metadata", async () => {
    const health = await fetch(`${running.url}/healthz`);
    expect(health.status).toBe(200);
    expect(health.headers.get("x-content-type-options")).toBe("nosniff");
    expect(health.headers.get("referrer-policy")).toBe("no-referrer");
    const body = (await health.json()) as {
      status: string;
      catalogEntries: number;
      contentHash: string;
      warnings: number;
    };
    expect(body.status).toBe("ok");
    expect(body.catalogEntries).toBe(873);
    expect(body.contentHash).toHaveLength(64);
    expect(body.warnings).toBe(29);

    const ready = await fetch(`${running.url}/readyz`);
    expect(ready.status).toBe(200);

    const root = await fetch(`${running.url}/`);
    expect(root.status).toBe(200);
    const rootBody = (await root.json()) as {
      name: string;
      endpoint: string;
      auth: string;
    };
    expect(rootBody).toMatchObject({
      name: "tastepro",
      endpoint: "/mcp",
      auth: "bearer",
    });
  });

  it("requires a bearer token on /mcp", async () => {
    const missing = await fetch(`${running.url}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    expect(missing.status).toBe(401);
    expect(missing.headers.get("www-authenticate")).toContain("Bearer");

    const wrong = await fetch(`${running.url}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer wrong",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    expect(wrong.status).toBe(401);
  });

  it("handles CORS for allowed origins only", async () => {
    const allowed = await fetch(`${running.url}/mcp`, {
      method: "OPTIONS",
      headers: {
        origin: "https://app.example.com",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type,mcp-session-id",
      },
    });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://app.example.com");

    const denied = await fetch(`${running.url}/mcp`, {
      method: "OPTIONS",
      headers: {
        origin: "https://evil.example.com",
        "access-control-request-method": "POST",
      },
    });
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("rejects invalid and missing sessions with JSON-RPC errors", async () => {
    const invalid = await fetch(`${running.url}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "mcp-session-id": "not-a-real-session",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    });
    expect(invalid.status).toBe(404);
    const invalidBody = (await invalid.json()) as { error: { code: number } };
    expect(invalidBody.error.code).toBe(-32001);

    const get = await fetch(`${running.url}/mcp`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    expect(get.status).toBe(400);

    const del = await fetch(`${running.url}/mcp`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${apiKey}` },
    });
    expect(del.status).toBe(400);
  });

  it("serves tools, resources, and prompts over a stateful session", async () => {
    const tools = await client.listTools();
    expect(tools.tools).toHaveLength(4);
    expect(transport.sessionId).toBeTruthy();

    const search = await client.callTool({
      name: "taste_search",
      arguments: { query: "restaurant menu", limit: 3 },
    });
    const searchBody = JSON.parse(textOf(search)) as {
      results: Array<{ id: string }>;
    };
    expect(searchBody.results[0]?.id).toBe("domain/restaurants-food");

    const skill = await client.readResource({ uri: "tastepro://skill" });
    expect(resourceText(skill)).toContain("# TastePro skill");

    const prompts = await client.listPrompts();
    expect(prompts.prompts).toHaveLength(2);
  });

  it("keeps concurrent sessions isolated", async () => {
    const second = await connectClient("tastepro-http-second");
    try {
      expect(second.transport.sessionId).toBeTruthy();
      expect(second.transport.sessionId).not.toBe(transport.sessionId);

      const [firstResult, secondResult] = await Promise.all([
        client.callTool({ name: "taste_search", arguments: { query: "fintech", limit: 1 } }),
        second.client.callTool({ name: "taste_search", arguments: { query: "music", limit: 1 } }),
      ]);
      const firstBody = JSON.parse(textOf(firstResult)) as { results: Array<{ id: string }> };
      const secondBody = JSON.parse(textOf(secondResult)) as { results: Array<{ id: string }> };
      expect(firstBody.results[0]?.id).toBe("domain/fintech-payments");
      expect(secondBody.results[0]?.id).toBe("domain/music");
    } finally {
      await second.client.close();
    }
  });

  it("survives parallel tool calls", async () => {
    const responses = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        client.callTool({
          name: "taste_search",
          arguments: { query: index % 2 === 0 ? "fintech" : "healthcare", limit: 2 },
        }),
      ),
    );
    for (const response of responses) {
      const body = JSON.parse(textOf(response)) as { results: unknown[] };
      expect(body.results.length).toBeGreaterThan(0);
    }
  });

  it("returns 404 for unknown paths", async () => {
    const response = await fetch(`${running.url}/nope`);
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("not_found");
  });

  it("closes a session without affecting others", async () => {
    const extra = await connectClient("tastepro-http-close");
    const extraSession = extra.transport.sessionId;
    expect(extraSession).toBeTruthy();
    await extra.client.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(running.app).toBeTruthy();
    const stillWorks = await client.callTool({
      name: "taste_search",
      arguments: { query: "portfolio", limit: 1 },
    });
    expect(stillWorks.isError).toBeFalsy();
  });
});
