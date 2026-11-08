import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuditService } from "../../src/core/audit.js";
import { createTasteProContext } from "../../src/server/context.js";
import { type RunningHttpServer, startHttpServer } from "../../src/server/http.js";
import { createLogger } from "../../src/server/logger.js";
import { AUDIT_SCOPE } from "../../src/server/server.js";

const context = createTasteProContext();
const logger = createLogger("silent");
const servers: RunningHttpServer[] = [];
const apiKey = "stateless-test-key";
const INIT = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "stateless-test", version: "0.0.0" },
  },
};

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  return content.map((item) => item.text ?? "").join("\n");
}

beforeAll(async () => {
  const guidelines = await context.loader.guidelines();
  const audit = {
    service: createAuditService({ guidelines }),
    allowUrlFetch: false,
    requiredScope: AUDIT_SCOPE,
  };
  for (let index = 0; index < 2; index += 1) {
    servers.push(
      await startHttpServer({
        context,
        host: "127.0.0.1",
        port: 0,
        apiKey,
        audit,
        logger,
      }),
    );
  }
});

afterAll(async () => {
  await Promise.all(servers.map((server) => server.close()));
});

describe("stateless Streamable HTTP", () => {
  it("serves MCP without issuing a session id", async () => {
    const transport = new StreamableHTTPClientTransport(new URL(`${servers[0]?.url}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
    });
    const client = new Client({ name: "stateless-client", version: "0.1.0" }, { capabilities: {} });
    await client.connect(transport);

    expect(transport.sessionId).toBeFalsy();
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      "taste_audit",
      "taste_get",
      "taste_guidelines",
      "taste_search",
    ]);

    const search = await client.callTool({
      name: "taste_search",
      arguments: { query: "fintech palette", limit: 2 },
    });
    expect(JSON.parse(textOf(search)).results[0].id).toBe("domain/fintech-payments");

    const audit = await client.callTool({
      name: "taste_audit",
      arguments: { html: "<html><body><img src='/hero.png'></body></html>" },
    });
    expect(audit.isError).toBeFalsy();
    expect(JSON.parse(textOf(audit)).findings.length).toBeGreaterThan(0);

    await client.close();
  });

  it("serves a request on a different instance with no shared state", async () => {
    const headers = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${apiKey}`,
    };
    const init = await fetch(`${servers[0]?.url}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify(INIT),
    });
    expect(init.status).toBe(200);
    expect(init.headers.get("mcp-session-id")).toBeNull();

    const list = await fetch(`${servers[1]?.url}/mcp`, {
      method: "POST",
      headers: { ...headers, "mcp-protocol-version": "2025-06-18" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    });
    expect(list.status).toBe(200);
    const body = (await list.json()) as { result?: { tools?: unknown[] } };
    expect(body.result?.tools).toHaveLength(4);

    const call = await fetch(`${servers[1]?.url}/mcp`, {
      method: "POST",
      headers: { ...headers, "mcp-protocol-version": "2025-06-18" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "taste_search", arguments: { query: "fintech palette", limit: 1 } },
      }),
    });
    expect(call.status).toBe(200);
    const callBody = (await call.json()) as {
      result?: { content?: Array<{ text?: string }> };
    };
    const payload = JSON.parse(callBody.result?.content?.[0]?.text ?? "{}") as {
      results?: Array<{ id?: string }>;
    };
    expect(payload.results?.[0]?.id).toBe("domain/fintech-payments");
  });

  it("returns 405 for GET and DELETE because stateless mode has no session", async () => {
    const headers = { authorization: `Bearer ${apiKey}` };
    const get = await fetch(`${servers[0]?.url}/mcp`, { headers });
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST");

    const del = await fetch(`${servers[0]?.url}/mcp`, { method: "DELETE", headers });
    expect(del.status).toBe(405);
    expect(del.headers.get("allow")).toBe("POST");
  });

  it("rejects SSE responses in stateless mode", async () => {
    await expect(
      startHttpServer({
        context,
        host: "127.0.0.1",
        port: 0,
        apiKey,
        jsonResponse: false,
        logger,
      }),
    ).rejects.toThrow(/stateful|SSE/i);
  });

  it("allows SSE responses in stateful mode", async () => {
    const server = await startHttpServer({
      context,
      host: "127.0.0.1",
      port: 0,
      apiKey,
      sessionMode: "stateful",
      jsonResponse: false,
      logger,
    });
    try {
      const response = await fetch(`${server.url}/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(INIT),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
    } finally {
      await server.close();
    }
  });
});
