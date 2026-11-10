import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuditService } from "../../src/core/audit.js";
import { createTasteProContext } from "../../src/server/context.js";
import { type RunningHttpServer, startHttpServer } from "../../src/server/http.js";
import { createLogger } from "../../src/server/logger.js";
import { AUDIT_SCOPE } from "../../src/server/server.js";

const context = createTasteProContext();
const servers: RunningHttpServer[] = [];
const clients: Client[] = [];

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  return content.map((item) => item.text ?? "").join("\n");
}

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<unknown> {
  return JSON.parse(textOf(await client.callTool({ name, arguments: args })));
}

beforeAll(async () => {
  const guidelines = await context.loader.guidelines();
  const server = await startHttpServer({
    context,
    host: "127.0.0.1",
    port: 0,
    apiKey: "parity-key",
    audit: {
      service: createAuditService({ guidelines }),
      allowUrlFetch: false,
      requiredScope: AUDIT_SCOPE,
    },
    logger: createLogger("silent"),
  });
  servers.push(server);

  const httpTransport = new StreamableHTTPClientTransport(new URL(`${server.url}/mcp`), {
    requestInit: { headers: { Authorization: "Bearer parity-key" } },
  });
  const httpClient = new Client({ name: "parity-http", version: "0.1.0" }, { capabilities: {} });
  await httpClient.connect(httpTransport);
  clients.push(httpClient);

  const isBun = Boolean((process.versions as { bun?: string }).bun);
  const stdioTransport = new StdioClientTransport({
    command: isBun ? "bun" : process.execPath,
    args: isBun ? ["src/cli.ts", "--stdio"] : ["--import", "tsx", "src/cli.ts", "--stdio"],
    stderr: "pipe",
  });
  const stdioClient = new Client({ name: "parity-stdio", version: "0.1.0" }, { capabilities: {} });
  await stdioClient.connect(stdioTransport);
  clients.push(stdioClient);
});

afterAll(async () => {
  await Promise.all(clients.map((client) => client.close().catch(() => undefined)));
  await Promise.all(servers.map((server) => server.close()));
});

describe("transport parity", () => {
  it("returns the same tool payloads over stdio and stateless HTTP", async () => {
    const [httpClient, stdioClient] = clients;
    expect(httpClient).toBeDefined();
    expect(stdioClient).toBeDefined();

    const cases: Array<[string, Record<string, unknown>]> = [
      ["taste_search", { query: "fintech palette", limit: 3 }],
      ["taste_get", { ids: ["domain/fintech-payments"], format: "brief" }],
      ["taste_guidelines", { severity: "error", limit: 5, format: "json" }],
      [
        "taste_audit",
        {
          html: "<html><body><img src='/hero.png'><div onclick='go()'>Go</div></body></html>",
          target: "parity",
        },
      ],
    ];

    for (const [name, args] of cases) {
      const [overHttp, overStdio] = await Promise.all([
        call(httpClient!, name, args),
        call(stdioClient!, name, args),
      ]);
      expect(overHttp, name).toEqual(overStdio);
    }
  });
});
