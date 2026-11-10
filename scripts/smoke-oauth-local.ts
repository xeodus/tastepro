#!/usr/bin/env bun
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { createAuditService } from "../src/core/audit.js";
import { createTasteProContext } from "../src/server/context.js";
import { startHttpServer } from "../src/server/http.js";
import { createLogger } from "../src/server/logger.js";
import { AUDIT_SCOPE } from "../src/server/server.js";

const JWKS_PORT = 3210;
const TASTEPRO_PORT = 3211;
const ISSUER = `http://127.0.0.1:${JWKS_PORT}`;
const TASTEPRO_URL = `http://127.0.0.1:${TASTEPRO_PORT}`;
const AUDIENCE = `${TASTEPRO_URL}/mcp`;
const DIRTY = "<html><body><img src='/hero.png'><div onclick='go()'>Go</div></body></html>";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  return content.map((item) => item.text ?? "").join("\n");
}

const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = await exportJWK(publicKey);
const jwks = { keys: [{ ...jwk, kid: "smoke-key", alg: "RS256", use: "sig" }] };

const jwksServer = createServer((request, response) => {
  if (request.url === "/jwks") {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(jwks));
    return;
  }
  response.statusCode = 404;
  response.end();
});
await new Promise<void>((resolve) => jwksServer.listen(JWKS_PORT, "127.0.0.1", resolve));
const address = jwksServer.address() as AddressInfo;

async function token(scopes: string, audience = AUDIENCE): Promise<string> {
  return await new SignJWT({ scope: scopes })
    .setProtectedHeader({ alg: "RS256", kid: "smoke-key" })
    .setIssuer(ISSUER)
    .setAudience(audience)
    .setSubject("smoke-user")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

async function connect(accessToken: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(`${TASTEPRO_URL}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const client = new Client({ name: "oauth-local-smoke", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  return client;
}

const context = createTasteProContext();
const guidelines = await context.loader.guidelines();
const running = await startHttpServer({
  context,
  host: "127.0.0.1",
  port: TASTEPRO_PORT,
  oauth: {
    issuer: ISSUER,
    audience: AUDIENCE,
    resource: TASTEPRO_URL,
    requiredScope: AUDIT_SCOPE,
    jwksUri: `${ISSUER}/jwks`,
  },
  audit: {
    service: createAuditService({ guidelines }),
    allowUrlFetch: false,
    requiredScope: AUDIT_SCOPE,
  },
  logger: createLogger("silent"),
});

try {
  const auditor = await connect(await token(`openid ${AUDIT_SCOPE}`));
  const tools = await auditor.listTools();
  assert(
    tools.tools.some((tool) => tool.name === "taste_audit"),
    "taste_audit missing",
  );
  const audit = await auditor.callTool({
    name: "taste_audit",
    arguments: { html: DIRTY, target: "oauth-local" },
  });
  assert(!audit.isError, `audit failed: ${textOf(audit)}`);
  const body = JSON.parse(textOf(audit)) as { findings?: unknown[] };
  assert((body.findings?.length ?? 0) > 0, "audit returned no findings");
  await auditor.close();

  const viewer = await connect(await token("openid"));
  const denied = await viewer.callTool({ name: "taste_audit", arguments: { html: DIRTY } });
  assert(denied.isError === true, "viewer token was allowed to call taste_audit");
  assert(textOf(denied).includes(AUDIT_SCOPE), "scope denial did not name the scope");
  await viewer.close();

  const wrongAudience = await token("openid", "http://127.0.0.1:9999/mcp");
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
  assert(unauthorized.status === 401, `wrong audience returned ${unauthorized.status}`);
} finally {
  await running.close();
  await new Promise<void>((resolve, reject) => {
    jwksServer.close((error) => (error ? reject(error) : resolve()));
  });
}

process.stdout.write(
  `OAuth local smoke passed: jwks:${address.port}, initialize, tools, audit, scope-denial, audience-rejection\n`,
);
