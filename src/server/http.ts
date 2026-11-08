import { randomUUID, timingSafeEqual } from "node:crypto";
import { type ServerType, serve } from "@hono/node-server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { VERSION } from "../version.js";
import type { TasteProContext } from "./context.js";
import { createLogger, type Logger } from "./logger.js";
import {
  createOAuthVerifier,
  type OAuthConfig,
  type OAuthPrincipal,
  oauthChallenge,
  protectedResourceMetadata,
} from "./oauth.js";
import { type AuditToolOptions, createTasteProServer } from "./server.js";

export interface HttpAppOptions {
  context: TasteProContext;
  apiKey?: string;
  /** OAuth resource-server config. When set, /mcp requires a valid JWT. */
  oauth?: OAuthConfig;
  corsOrigin?: string;
  allowedHosts?: string[];
  /** Explicit opt-in for an unauthenticated non-loopback endpoint. */
  allowAnonymous?: boolean;
  /** taste_audit wiring. startHttpServer strips it from anonymous non-loopback binds. */
  audit?: AuditToolOptions;
  /**
   * HTTP session mode. Stateless is the production default: each request gets a
   * fresh server/transport, so any replica can serve it. Stateful is opt-in for
   * SSE, resumability, and session-scoped clients.
   */
  sessionMode?: "stateless" | "stateful";
  sessionTtlMs?: number;
  maxSessions?: number;
  jsonResponse?: boolean;
  logger?: Logger;
}

interface Session {
  id: string;
  transport: WebStandardStreamableHTTPServerTransport;
  server: McpServer;
  lastSeen: number;
}

export interface HttpApp {
  app: Hono;
  close: () => Promise<void>;
  sessionCount: () => number;
}

const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1_000;
const DEFAULT_MAX_SESSIONS = 500;
const MAX_BODY_BYTES = 1_048_576;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && (value as number) > 0 ? Math.floor(value as number) : fallback;
}

function positiveDuration(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && (value as number) > 0 ? Math.floor(value as number) : fallback;
}

function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.replace(/^\[|\]$/g, "").toLowerCase());
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function sessionNotFound(c: any) {
  return c.json(
    {
      jsonrpc: "2.0",
      error: { code: -32001, message: "Session not found or expired. Initialize a new session." },
      id: null,
    },
    404,
  );
}

function badRequest(c: any, message: string) {
  return c.json({ jsonrpc: "2.0", error: { code: -32600, message }, id: null }, 400);
}

/**
 * Build the Hono app. Sessions are stateful (the SDK generates an
 * `Mcp-Session-Id` on initialize) and expire after an idle TTL. A read-only
 * content server does not need server-initiated notifications, so JSON
 * responses are the default; set `jsonResponse: false` for SSE streaming.
 */
export function createHttpApp(options: HttpAppOptions): HttpApp {
  const logger = options.logger ?? createLogger("info");
  const sessionMode = options.sessionMode ?? "stateless";
  if (sessionMode === "stateless" && options.jsonResponse === false) {
    throw new Error(
      "SSE responses require stateful HTTP sessions. Set sessionMode=stateful (TASTEPRO_HTTP_MODE=stateful or --stateful).",
    );
  }
  const sessions = new Map<string, Session>();
  const apiKey = options.apiKey;
  // Browser origins are denied unless explicitly configured. Server-to-server
  // MCP clients do not send an Origin header and are unaffected.
  const corsSetting = options.corsOrigin ?? "";
  const allowAllOrigins = corsSetting.trim() === "*";
  const allowedOrigins = corsSetting
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedHosts = (options.allowedHosts ?? [])
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  const sessionTtlMs = Math.max(
    30_000,
    positiveDuration(options.sessionTtlMs, DEFAULT_SESSION_TTL_MS),
  );
  const maxSessions = positiveInteger(options.maxSessions, DEFAULT_MAX_SESSIONS);
  let closed = false;

  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: (origin) => {
        if (allowAllOrigins) return "*";
        if (!origin) return "";
        return allowedOrigins.includes(origin) ? origin : "";
      },
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "Mcp-Session-Id",
        "Mcp-Protocol-Version",
        "Last-Event-ID",
      ],
      exposeHeaders: ["Mcp-Session-Id"],
      maxAge: 86_400,
    }),
  );

  app.use("*", async (c, next) => {
    if (allowedHosts.length > 0) {
      const host = (c.req.header("host") ?? "").toLowerCase();
      const hostname = host.replace(/:\d+$/, "");
      if (!allowedHosts.includes(host) && !allowedHosts.includes(hostname)) {
        return c.json({ error: "forbidden_host" }, 403);
      }
    }
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
  });

  // Browser origins are denied unless explicitly configured. Reject the
  // request before authentication or session creation, not just the CORS
  // response headers: an untrusted page must not be able to open a session.
  app.use("*", async (c, next) => {
    if (!c.req.path.startsWith("/mcp")) return next();
    const origin = c.req.header("origin");
    if (!origin || allowAllOrigins || allowedOrigins.includes(origin)) return next();
    return c.json({ error: "forbidden_origin" }, 403);
  });

  // Bearer auth applies only to /mcp. OAuth is the hosted path: a JWT from the
  // configured issuer is verified here and the principal's scopes are attached
  // to the request for session creation. The MCP layer never sees tokens.
  // Static bearer keys are the single-tenant operator path and grant all
  // scopes; they cannot be combined with OAuth.
  const verifier = options.oauth ? createOAuthVerifier(options.oauth) : undefined;
  const principals = new WeakMap<Request, OAuthPrincipal>();
  app.use("*", async (c, next) => {
    const path = c.req.path;
    if (!path.startsWith("/mcp")) return next();
    if (!verifier && !apiKey) return next();
    const authorization = c.req.header("authorization") ?? "";
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";

    if (verifier) {
      const challenge = oauthChallenge(options.oauth as OAuthConfig);
      const unauthorized = () =>
        c.json(
          { error: "unauthorized", message: "A valid bearer token is required for this endpoint." },
          401,
          { "WWW-Authenticate": challenge },
        );
      if (!token) return unauthorized();
      try {
        const principal = await verifier.verify(token);
        principals.set(c.req.raw, principal);
        return next();
      } catch {
        return unauthorized();
      }
    }

    if (!token || !safeEqual(token, apiKey as string)) {
      return c.json(
        { error: "unauthorized", message: "A bearer token is required for this endpoint." },
        401,
        { "WWW-Authenticate": 'Bearer realm="tastepro"' },
      );
    }
    principals.set(c.req.raw, {
      subject: "operator",
      issuer: "static-bearer",
      audience: [],
      scopes: ["*"],
    });
    return next();
  });

  app.use("*", async (c, next) => {
    const started = Date.now();
    await next();
    if (c.req.path.startsWith("/mcp")) {
      logger.debug("request", {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        ms: Date.now() - started,
      });
    }
  });

  async function closeSession(id: string): Promise<void> {
    const session = sessions.get(id);
    if (!session) return;
    sessions.delete(id);
    try {
      await session.server.close();
    } catch (error) {
      logger.debug("session close failed", {
        sessionId: id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function evictOverflow(): void {
    while (sessions.size > maxSessions) {
      const oldest = [...sessions.values()].sort((a, b) => a.lastSeen - b.lastSeen)[0];
      if (!oldest) return;
      logger.warn("evicting session at capacity", { sessionId: oldest.id });
      void closeSession(oldest.id);
    }
  }

  async function createSession(principal?: OAuthPrincipal): Promise<{
    transport: WebStandardStreamableHTTPServerTransport;
    server: McpServer;
  }> {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: options.jsonResponse ?? true,
      maxRequestBodySize: MAX_BODY_BYTES,
      keepAliveMs: 15_000,
      onsessionclosed: (id) => {
        sessions.delete(id);
      },
    });
    const server = createTasteProServer({
      context: options.context,
      audit: options.audit,
      // Scopes are captured when the session is initialized; every later
      // request still re-verifies the token in the middleware above.
      auth: principal ? { scopes: principal.scopes } : undefined,
    });
    await server.connect(transport);
    return { transport, server };
  }

  /**
   * Stateless requests get a fresh transport and server, as the SDK requires
   * (a stateless transport cannot be reused). The response is buffered so the
   * server can close before the HTTP response is returned; this is safe because
   * stateless mode requires JSON responses.
   */
  async function handleStateless(c: any): Promise<Response> {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      maxRequestBodySize: MAX_BODY_BYTES,
    });
    const principal = principals.get(c.req.raw);
    const server = createTasteProServer({
      context: options.context,
      audit: options.audit,
      // Stateless scopes come from this request's verified token, not a session.
      auth: principal ? { scopes: principal.scopes } : undefined,
    });
    await server.connect(transport);
    try {
      const response = await transport.handleRequest(c.req.raw);
      const body = await response.text();
      const headers = new Headers(response.headers);
      headers.delete("content-length");
      return new Response(body.length > 0 ? body : null, {
        status: response.status,
        headers,
      });
    } finally {
      await server.close().catch(() => undefined);
    }
  }

  app.get("/", (c) =>
    c.json({
      name: "tastepro",
      version: VERSION,
      description:
        "Design taste, domain playbooks, references, and a web-interface audit rubric for coding agents.",
      transport: "streamable-http",
      endpoint: "/mcp",
      health: "/healthz",
      auth: options.oauth ? "oauth" : apiKey ? "bearer" : "none",
      sessionMode,
      sessions: sessionMode === "stateful" ? sessions.size : 0,
    }),
  );

  async function health(c: any) {
    try {
      const stats = await options.context.loader.stats();
      return c.json({
        status: "ok",
        name: "tastepro",
        version: VERSION,
        contentHash: stats.contentHash,
        generatedAt: stats.generatedAt,
        catalogEntries: stats.catalogEntries,
        counts: stats.counts,
        quality: stats.quality,
        warnings: stats.warnings.length,
        sessionMode,
        sessions: sessionMode === "stateful" ? sessions.size : 0,
        uptimeSeconds: Math.floor(process.uptime()),
      });
    } catch (error) {
      logger.error("health check failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        },
        503,
      );
    }
  }

  app.get("/healthz", health);
  app.get("/readyz", health);

  if (options.oauth) {
    const metadata = protectedResourceMetadata(options.oauth);
    app.get("/.well-known/oauth-protected-resource", (c) => c.json(metadata));
    app.get("/.well-known/oauth-protected-resource/mcp", (c) => c.json(metadata));
  }

  app.post("/mcp", async (c) => {
    if (sessionMode === "stateless") {
      return handleStateless(c);
    }

    const sessionId = c.req.header("mcp-session-id");
    if (sessionId) {
      const session = sessions.get(sessionId);
      if (!session) return sessionNotFound(c);
      session.lastSeen = Date.now();
      return session.transport.handleRequest(c.req.raw);
    }

    const { transport, server } = await createSession(principals.get(c.req.raw));
    try {
      const response = await transport.handleRequest(c.req.raw);
      if (transport.sessionId) {
        const session: Session = {
          id: transport.sessionId,
          transport,
          server,
          lastSeen: Date.now(),
        };
        sessions.set(session.id, session);
        logger.info("session created", { sessionId: session.id, sessions: sessions.size });
        evictOverflow();
      } else {
        // A non-initialize POST without a session is rejected by the transport.
        // Close the throwaway server rather than leaking it.
        await server.close().catch(() => undefined);
      }
      return response;
    } catch (error) {
      await server.close().catch(() => undefined);
      throw error;
    }
  });

  app.get("/mcp", async (c) => {
    if (sessionMode === "stateless") {
      return c.body(null, 405, { Allow: "POST" });
    }
    const sessionId = c.req.header("mcp-session-id");
    if (!sessionId) return badRequest(c, "Mcp-Session-Id header is required for GET streams.");
    const session = sessions.get(sessionId);
    if (!session) return sessionNotFound(c);
    session.lastSeen = Date.now();
    return session.transport.handleRequest(c.req.raw);
  });

  app.delete("/mcp", async (c) => {
    if (sessionMode === "stateless") {
      return c.body(null, 405, { Allow: "POST" });
    }
    const sessionId = c.req.header("mcp-session-id");
    if (!sessionId) return badRequest(c, "Mcp-Session-Id header is required to close a session.");
    const session = sessions.get(sessionId);
    if (!session) return sessionNotFound(c);
    const response = await session.transport.handleRequest(c.req.raw);
    sessions.delete(sessionId);
    await session.server.close().catch(() => undefined);
    logger.info("session closed", { sessionId, sessions: sessions.size });
    return response;
  });

  app.notFound((c) => c.json({ error: "not_found", message: "Use /mcp, /healthz, or /." }, 404));

  app.onError((error, c) => {
    logger.error("request failed", {
      path: c.req.path,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json({ error: "internal_error" }, 500);
  });

  const cleanup = setInterval(
    () => {
      const cutoff = Date.now() - sessionTtlMs;
      for (const session of [...sessions.values()]) {
        if (session.lastSeen < cutoff) {
          logger.info("session expired", { sessionId: session.id });
          void closeSession(session.id);
        }
      }
    },
    Math.min(60_000, Math.max(10_000, Math.floor(sessionTtlMs / 2))),
  );
  cleanup.unref?.();

  return {
    app,
    sessionCount: () => sessions.size,
    close: async () => {
      if (closed) return;
      closed = true;
      clearInterval(cleanup);
      await Promise.all([...sessions.keys()].map((id) => closeSession(id)));
    },
  };
}

export interface StartHttpOptions extends HttpAppOptions {
  host?: string;
  port?: number;
}

export interface RunningHttpServer {
  server: ServerType;
  app: Hono;
  url: string;
  close: () => Promise<void>;
}

export async function startHttpServer(options: StartHttpOptions): Promise<RunningHttpServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3000;
  if (options.oauth && options.apiKey) {
    throw new Error(
      "Configure either OAuth (TASTEPRO_OAUTH_ISSUER) or a static API key (TASTEPRO_API_KEY), not both.",
    );
  }
  if (!isLoopbackHost(host)) {
    if (!options.oauth && !options.apiKey && !options.allowAnonymous) {
      throw new Error(
        "Refusing to bind a non-loopback HTTP host without auth. Set TASTEPRO_OAUTH_ISSUER with TASTEPRO_PUBLIC_URL, or TASTEPRO_API_KEY, or explicitly set TASTEPRO_ALLOW_ANONYMOUS=true.",
      );
    }
    if (!(options.allowedHosts ?? []).some((value) => value.trim())) {
      throw new Error(
        "Refusing to bind a non-loopback HTTP host without TASTEPRO_ALLOWED_HOSTS. Set the public Host header values explicitly.",
      );
    }
  }
  // An explicitly anonymous non-loopback endpoint is read-only by contract:
  // never expose the audit tool, its URL fetcher, or its browser renderer
  // without an authenticated principal.
  const anonymousNonLoopback =
    !options.oauth && !options.apiKey && Boolean(options.allowAnonymous) && !isLoopbackHost(host);
  const appOptions: StartHttpOptions =
    options.audit && anonymousNonLoopback ? { ...options, audit: undefined } : options;
  const { app, close } = createHttpApp(appOptions);
  const server = serve({ fetch: app.fetch, hostname: host, port });
  await new Promise<void>((resolve, reject) => {
    server.once("listening", () => resolve());
    server.once("error", (error) => reject(error));
  });
  const address = server.address();
  const actualPort =
    address && typeof address === "object" && "port" in address ? address.port : port;
  return {
    server,
    app,
    url: `http://${host.includes(":") ? `[${host}]` : host}:${actualPort}`,
    close: async () => {
      // Close MCP sessions first so any open GET/SSE streams end before the
      // HTTP server waits for its connections to drain.
      await close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
      });
    },
  };
}
