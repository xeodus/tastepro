import { exportJWK, generateKeyPair, type JSONWebKeySet, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createOAuthVerifier,
  discoverJwksUri,
  hasScope,
  oauthChallenge,
  protectedResourceMetadata,
} from "../../src/server/oauth.js";

const ISSUER = "https://idp.example.com";
const AUDIENCE = "https://tastepro.example.com/mcp";
const RESOURCE = "https://tastepro.example.com";
const SCOPE = "tastepro:audit";

let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
let jwks: JSONWebKeySet;

async function sign(
  claims: Record<string, unknown> = {},
  options: { issuer?: string; audience?: string; expires?: string | number } = {},
): Promise<string> {
  return await new SignJWT({ scope: `${SCOPE} openid`, ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setSubject("user-1")
    .setIssuedAt()
    .setExpirationTime(options.expires ?? "5m")
    .sign(privateKey);
}

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  jwks = { keys: [{ ...jwk, kid: "test-key", alg: "RS256", use: "sig" }] };
});

function verifier() {
  return createOAuthVerifier({
    issuer: ISSUER,
    audience: AUDIENCE,
    resource: RESOURCE,
    requiredScope: SCOPE,
    jwks,
  });
}

describe("OAuth resource server", () => {
  it("accepts a valid token and exposes its scopes", async () => {
    const principal = await verifier().verify(await sign());
    expect(principal.subject).toBe("user-1");
    expect(principal.issuer).toBe(ISSUER);
    expect(principal.scopes).toEqual([SCOPE, "openid"]);
    expect(hasScope(principal, SCOPE)).toBe(true);
    expect(hasScope(principal, "tastepro:admin")).toBe(false);
  });

  it("accepts scopes from an array-valued scp claim", async () => {
    const token = await sign({ scope: undefined, scp: [SCOPE] });
    const principal = await verifier().verify(token);
    expect(principal.scopes).toEqual([SCOPE]);
  });

  it("merges scope and scp claims instead of preferring one", async () => {
    const token = await sign({ scope: "openid profile", scp: [SCOPE] });
    const principal = await verifier().verify(token);
    expect(principal.scopes).toEqual(expect.arrayContaining(["openid", "profile", SCOPE]));
  });

  it("rejects a wrong issuer, audience, expiry, or signature", async () => {
    const verifierInstance = verifier();
    await expect(
      verifierInstance.verify(await sign({}, { issuer: "https://evil.example.com" })),
    ).rejects.toThrow(/issuer/i);
    await expect(
      verifierInstance.verify(await sign({}, { audience: "https://other.example.com" })),
    ).rejects.toThrow(/audience/i);
    await expect(
      verifierInstance.verify(await sign({}, { expires: Math.floor(Date.now() / 1000) - 60 })),
    ).rejects.toThrow(/expired|exp/i);

    const [header, payload] = (await sign()).split(".");
    const tampered = `${header}.${payload}.AAAA`;
    await expect(verifierInstance.verify(tampered)).rejects.toThrow(/signature|token/i);
  });

  it("rejects a token without a subject", async () => {
    const token = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    await expect(verifier().verify(token)).rejects.toThrow(/subject/i);
  });

  it("publishes protected-resource metadata and a challenge", () => {
    const metadata = protectedResourceMetadata({
      issuer: ISSUER,
      audience: AUDIENCE,
      resource: RESOURCE,
      requiredScope: SCOPE,
      jwks,
    });
    expect(metadata).toEqual({
      resource: AUDIENCE,
      authorization_servers: [ISSUER],
      scopes_supported: [SCOPE],
      bearer_methods_supported: ["header"],
    });
    expect(oauthChallenge({ issuer: ISSUER, audience: AUDIENCE, resource: RESOURCE, jwks })).toBe(
      'Bearer resource_metadata="https://tastepro.example.com/.well-known/oauth-protected-resource"',
    );
  });

  it("discovers the JWKS URI from OIDC metadata", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ jwks_uri: "https://idp.example.com/jwks.json" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    await expect(discoverJwksUri(ISSUER, fetchImpl)).resolves.toBe(
      "https://idp.example.com/jwks.json",
    );
    await expect(
      discoverJwksUri(
        ISSUER,
        async () =>
          new Response(JSON.stringify({ issuer: ISSUER }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    ).rejects.toThrow(/jwks_uri/i);
  });
});
