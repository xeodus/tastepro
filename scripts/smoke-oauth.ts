#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createAuditService } from "../src/core/audit.js";
import { createTasteProContext } from "../src/server/context.js";
import { startHttpServer } from "../src/server/http.js";
import { createLogger } from "../src/server/logger.js";
import { AUDIT_SCOPE } from "../src/server/server.js";

const KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? "http://127.0.0.1:8080";
const REALM = "tastepro";
const ISSUER = `${KEYCLOAK_URL}/realms/${REALM}`;
const TASTEPRO_URL = "http://127.0.0.1:3100";
const AUDIENCE = `${TASTEPRO_URL}/mcp`;
const DIRTY = "<html><body><img src='/hero.png'><div onclick='go()'>Go</div></body></html>";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  return content.map((item) => item.text ?? "").join("\n");
}

async function waitForKeycloak(): Promise<void> {
  const url = `${ISSUER}/.well-known/openid-configuration`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Keycloak is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(
    `Keycloak did not become ready at ${url}. Start it with: docker compose -f deploy/keycloak.compose.yml up -d`,
  );
}

async function token(clientId: string, username: string, password: string): Promise<string> {
  const response = await fetch(`${ISSUER}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: clientId,
      username,
      password,
      scope: "openid",
    }),
  });
  if (!response.ok) {
    throw new Error(`Token request failed (${response.status}): ${await response.text()}`);
  }
  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("Token response did not include access_token.");
  return body.access_token;
}

async function connect(name: string, accessToken: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(`${TASTEPRO_URL}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const client = new Client({ name, version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  return client;
}

async function main(): Promise<void> {
  const checks: string[] = [];
  await waitForKeycloak();
  checks.push("keycloak");

  const context = createTasteProContext();
  const guidelines = await context.loader.guidelines();
  const running = await startHttpServer({
    context,
    host: "127.0.0.1",
    port: 3100,
    oauth: {
      issuer: ISSUER,
      audience: AUDIENCE,
      resource: TASTEPRO_URL,
      requiredScope: AUDIT_SCOPE,
    },
    audit: {
      service: createAuditService({ guidelines }),
      allowUrlFetch: false,
      requiredScope: AUDIT_SCOPE,
    },
    logger: createLogger("silent"),
  });

  try {
    const auditor = await token("tastepro-auditor", "auditor", "auditor");
    checks.push("token");

    const client = await connect("oauth-smoke-auditor", auditor);
    checks.push("initialize");

    const tools = await client.listTools();
    assert(
      tools.tools.some((tool) => tool.name === "taste_audit"),
      "taste_audit is missing from tools/list",
    );
    checks.push("tools/list");

    const audit = await client.callTool({
      name: "taste_audit",
      arguments: { html: DIRTY, target: "oauth-smoke" },
    });
    assert(!audit.isError, `taste_audit failed with the auditor token: ${textOf(audit)}`);
    const body = JSON.parse(textOf(audit)) as { findings?: unknown[] };
    assert((body.findings?.length ?? 0) > 0, "taste_audit returned no findings");
    checks.push("taste_audit");
    await client.close();

    const viewer = await token("tastepro-auditor", "viewer", "viewer");
    const viewerClient = await connect("oauth-smoke-viewer", viewer);
    const denied = await viewerClient.callTool({ name: "taste_audit", arguments: { html: DIRTY } });
    assert(denied.isError === true, "viewer token was allowed to call taste_audit");
    assert(textOf(denied).includes(AUDIT_SCOPE), "scope denial did not name the required scope");
    checks.push("scope-denial");
    await viewerClient.close();

    const wrongAudience = await token("tastepro-wrong-audience", "auditor", "auditor");
    const unauthorized = await fetch(`${TASTEPRO_URL}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${wrongAudience}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "wrong-audience", version: "0" },
        },
      }),
    });
    assert(
      unauthorized.status === 401,
      `wrong-audience token returned ${unauthorized.status}, expected 401`,
    );
    checks.push("audience-rejection");
  } finally {
    await running.close();
  }

  process.stdout.write(`OAuth smoke passed: ${checks.join(", ")}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
