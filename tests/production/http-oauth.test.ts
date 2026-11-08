import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { exportJWK, generateKeyPair, type JSONWebKeySet, SignJWT } from "jose";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createAuditService } from "../../src/core/audit.js";
import { createTasteProContext } from "../../src/server/context.js";
import { createHttpApp, type RunningHttpServer, startHttpServer } from "../../src/server/http.js";
import { createLogger } from "../../src/server/logger.js";
import type { OAuthConfig } from "../../src/server/oauth.js";
import { AUDIT_SCOPE, type AuditToolOptions } from "../../src/server/server.js";

const context = createTasteProContext();
const logger = createLogger("silent");
const running: RunningHttpServer[] = [];
const closers: Array<() => Promise<void>> = [];

const ISSUER = "https://idp.example.com";
const RESOURCE = "https://tastepro.example.com";
const DIRTY = "<html><body><img src='/hero.png'></body></html>";

let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
let oauth: OAuthConfig;
let audit: AuditToolOptions;

const INIT = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "oauth-test", version: "0.0.0" },
  },
});

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  const jwks: JSONWebKeySet = { keys: [{ ...jwk, kid: "test-key", alg: "RS256", use: "sig" }] };
  oauth = {
    issuer: ISSUER,
    audience: `${RESOURCE}/mcp`,
    resource: RESOURCE,
    requiredScope: AUDIT_SCOPE,
    jwks,
  };
  const guidelines = await context.loader.guidelines();
  audit = {
    service: createAuditService({ guidelines }),
    allowUrlFetch: false,
    requiredScope: AUDIT_SCOPE,
  };
});

afterEach(async () => {
  while (closers.length > 0) await closers.pop()?.();
});

afterAll(async () => {
  await Promise.all(running.map((server) => server.close()));
});

async function token(scopes: string): Promise<string> {
  return await new SignJWT({ scope: scopes })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(ISSUER)
    .setAudience(`${RESOURCE}/mcp`)
    .setSubject("user-1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

async function startServer(overrides: Partial<Parameters<typeof startHttpServer>[0]> = {}) {
  const server = await startHttpServer({
    context,
    logger,
    host: "127.0.0.1",
    port: 0,
    oauth,
    audit,
    ...overrides,
  });
  running.push(server);
  return server;
}

async function connect(url: string, authorization?: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(`${url}/mcp`), {
    requestInit: authorization ? { headers: { Authorization: authorization } } : undefined,
  });
  const client = new Client({ name: "oauth-test", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  closers.push(() => client.close());
  return client;
}

function jsonOf(result: Awaited<ReturnType<Client["callTool"]>>): any {
  const content = result.content as Array<{ type: string; text?: string }>;
  return JSON.parse(content.map((item) => item.text ?? "").join("\n"));
}

describe("OAuth resource server", () => {
  it("challenges anonymous and invalid tokens on /mcp", async () => {
    const { app, close } = createHttpApp({ context, oauth, logger });
    try {
      const missing = await app.request("/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: INIT,
      });
      expect(missing.status).toBe(401);
      expect(missing.headers.get("www-authenticate")).toBe(
        `Bearer resource_metadata="${RESOURCE}/.well-known/oauth-protected-resource"`,
      );

      const invalid = await app.request("/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: "Bearer not-a-jwt",
        },
        body: INIT,
      });
      expect(invalid.status).toBe(401);
      expect(invalid.headers.get("www-authenticate")).toContain("resource_metadata");
    } finally {
      await close();
    }
  });

  it("serves protected-resource metadata", async () => {
    const { app, close } = createHttpApp({ context, oauth, logger });
    try {
      for (const path of [
        "/.well-known/oauth-protected-resource",
        "/.well-known/oauth-protected-resource/mcp",
      ]) {
        const response = await app.request(path);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
          resource: `${RESOURCE}/mcp`,
          authorization_servers: [ISSUER],
          scopes_supported: [AUDIT_SCOPE],
          bearer_methods_supported: ["header"],
        });
      }
    } finally {
      await close();
    }
  });

  it("gates taste_audit behind the audit scope", async () => {
    const server = await startServer();

    const limited = await connect(server.url, `Bearer ${await token("openid")}`);
    const tools = await limited.listTools();
    expect(tools.tools.map((tool) => tool.name)).toContain("taste_audit");
    const denied = await limited.callTool({
      name: "taste_audit",
      arguments: { html: DIRTY },
    });
    expect(denied.isError).toBe(true);
    expect(JSON.stringify(denied)).toContain(AUDIT_SCOPE);

    const full = await connect(server.url, `Bearer ${await token(`openid ${AUDIT_SCOPE}`)}`);
    const allowed = await full.callTool({
      name: "taste_audit",
      arguments: { html: DIRTY, target: "landing page" },
    });
    expect(allowed.isError).toBeFalsy();
    const body = jsonOf(allowed);
    expect(body.target).toBe("landing page");
    expect(body.findings.length).toBeGreaterThan(0);
    expect(
      body.findings.some(
        (finding: { guidelineId: string }) =>
          finding.guidelineId === "guideline/accessibility-images-need-alt-or-alt-if-decorative",
      ),
    ).toBe(true);
  });

  it("omits taste_audit from an explicitly anonymous non-loopback endpoint", async () => {
    const server = await startServer({
      oauth: undefined,
      allowAnonymous: true,
      allowedHosts: ["localhost", "127.0.0.1", "0.0.0.0"],
      host: "0.0.0.0",
    });
    const client = await connect(server.url);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      "taste_get",
      "taste_guidelines",
      "taste_search",
    ]);
  });

  it("allows a non-loopback OAuth bind without an API key", async () => {
    const server = await startServer({
      host: "0.0.0.0",
      allowedHosts: ["localhost", "127.0.0.1", "0.0.0.0"],
    });
    const url = server.url.replace("0.0.0.0", "127.0.0.1");
    const response = await fetch(`${url}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: INIT,
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("resource_metadata");
  });

  it("refuses to start with both OAuth and a static API key", async () => {
    await expect(startServer({ apiKey: "secret" })).rejects.toThrow(/not both/i);
  });

  it("applies OAuth scopes per request in stateless mode", async () => {
    const server = await startServer();
    const headers = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    };

    const init = await fetch(`${server.url}/mcp`, {
      method: "POST",
      headers: { ...headers, authorization: `Bearer ${await token("openid")}` },
      body: INIT,
    });
    expect(init.status).toBe(200);
    expect(init.headers.get("mcp-session-id")).toBeNull();

    const allowed = await fetch(`${server.url}/mcp`, {
      method: "POST",
      headers: {
        ...headers,
        authorization: `Bearer ${await token(`openid ${AUDIT_SCOPE}`)}`,
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "taste_audit", arguments: { html: DIRTY } },
      }),
    });
    expect(allowed.status).toBe(200);
    const allowedBody = (await allowed.json()) as { result?: { isError?: boolean } };
    expect(allowedBody.result?.isError).toBeFalsy();

    const denied = await fetch(`${server.url}/mcp`, {
      method: "POST",
      headers: {
        ...headers,
        authorization: `Bearer ${await token("openid")}`,
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "taste_audit", arguments: { html: DIRTY } },
      }),
    });
    expect(denied.status).toBe(200);
    expect(JSON.stringify(await denied.json())).toContain(AUDIT_SCOPE);
  });
});
