import {
  createLocalJWKSet,
  createRemoteJWKSet,
  type JSONWebKeySet,
  type JWTPayload,
  type JWTVerifyGetKey,
  jwtVerify,
} from "jose";

export interface OAuthConfig {
  /** Token issuer, matched exactly against the `iss` claim. */
  issuer: string;
  /** Expected audience, normally the public MCP endpoint. */
  audience: string;
  /** Public origin used to build the protected-resource metadata URL. */
  resource: string;
  /** Scope required to call the audit tool. */
  requiredScope?: string;
  /** Scopes advertised in protected-resource metadata. */
  scopes?: string[];
  /** In-memory JWKS for tests or an operator-managed key set. */
  jwks?: JSONWebKeySet;
  /** JWKS endpoint; discovery is used when omitted. */
  jwksUri?: string;
  fetchImpl?: typeof fetch;
}

export interface OAuthPrincipal {
  subject: string;
  issuer: string;
  audience: string[];
  scopes: string[];
  expiresAt?: number;
}

export interface OAuthVerifier {
  verify(token: string): Promise<OAuthPrincipal>;
}

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported: string[];
  bearer_methods_supported: string[];
}

const DISCOVERY_TIMEOUT_MS = 5_000;

function scopesOf(payload: JWTPayload): string[] {
  const scopes = new Set<string>();
  for (const raw of [payload.scope, payload.scp]) {
    if (typeof raw === "string") {
      for (const value of raw.split(/\s+/)) {
        if (value) scopes.add(value);
      }
    } else if (Array.isArray(raw)) {
      for (const value of raw) {
        if (typeof value === "string" && value) scopes.add(value);
      }
    }
  }
  return [...scopes];
}

function audienceOf(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return [];
}

function tokenError(error: unknown): Error {
  const claim = (error as { claim?: string }).claim;
  if (claim === "iss") return new Error("Invalid access token: issuer mismatch.");
  if (claim === "aud") return new Error("Invalid access token: audience mismatch.");
  if (claim === "exp") return new Error("Invalid access token: expired.");
  if (claim === "nbf") return new Error("Invalid access token: not active yet.");
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`Invalid access token: ${message}`);
}

export async function discoverJwksUri(
  issuer: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const url = `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not load OIDC discovery for ${issuer}: ${message}`);
  }
  if (!response.ok) {
    throw new Error(`OIDC discovery for ${issuer} failed with HTTP ${response.status}.`);
  }
  let metadata: unknown;
  try {
    metadata = await response.json();
  } catch {
    throw new Error(`OIDC discovery for ${issuer} is not valid JSON.`);
  }
  const jwksUri = (metadata as { jwks_uri?: unknown } | null)?.jwks_uri;
  if (typeof jwksUri !== "string" || !jwksUri.trim()) {
    throw new Error(`OIDC discovery for ${issuer} did not include jwks_uri.`);
  }
  return jwksUri;
}

async function resolveKeySet(config: OAuthConfig): Promise<JWTVerifyGetKey> {
  if (config.jwks) return createLocalJWKSet(config.jwks);
  const jwksUri = config.jwksUri ?? (await discoverJwksUri(config.issuer, config.fetchImpl));
  return createRemoteJWKSet(new URL(jwksUri), { timeoutDuration: DISCOVERY_TIMEOUT_MS });
}

export function createOAuthVerifier(config: OAuthConfig): OAuthVerifier {
  let keySetPromise: Promise<JWTVerifyGetKey> | undefined;
  const getKeySet = (): Promise<JWTVerifyGetKey> => {
    keySetPromise ??= resolveKeySet(config);
    return keySetPromise;
  };

  return {
    async verify(token: string): Promise<OAuthPrincipal> {
      if (token.split(".").length !== 3) {
        throw new Error("Invalid access token: expected a signed JWT.");
      }
      let payload: JWTPayload;
      try {
        const result = await jwtVerify(token, await getKeySet(), {
          issuer: config.issuer,
          audience: config.audience,
          algorithms: ["RS256", "ES256"],
          clockTolerance: 5,
        });
        payload = result.payload;
      } catch (error) {
        throw tokenError(error);
      }
      if (typeof payload.sub !== "string" || !payload.sub.trim()) {
        throw new Error("Invalid access token: missing subject.");
      }
      return {
        subject: payload.sub,
        issuer: typeof payload.iss === "string" ? payload.iss : config.issuer,
        audience: audienceOf(payload.aud),
        scopes: scopesOf(payload),
        expiresAt: typeof payload.exp === "number" ? payload.exp : undefined,
      };
    },
  };
}

export function hasScope(principal: { scopes: string[] }, scope: string): boolean {
  return principal.scopes.includes(scope) || principal.scopes.includes("*");
}

export function protectedResourceMetadata(config: OAuthConfig): ProtectedResourceMetadata {
  const base = config.resource.replace(/\/$/, "");
  return {
    resource: base.endsWith("/mcp") ? base : `${base}/mcp`,
    authorization_servers: [config.issuer],
    scopes_supported: config.scopes ?? (config.requiredScope ? [config.requiredScope] : []),
    bearer_methods_supported: ["header"],
  };
}

export function oauthChallenge(config: OAuthConfig): string {
  const base = config.resource.replace(/\/$/, "");
  const metadata = new URL("/.well-known/oauth-protected-resource", base).toString();
  return `Bearer resource_metadata="${metadata}"`;
}
