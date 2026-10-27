# Security policy

TastePro is a read-only MCP server for design content. It has no write tools, no
database, no user accounts, and no server-side LLM calls. The main security
concerns are therefore different from a typical web application: content-path
traversal, resource exhaustion, unauthenticated exposure, and supply-chain
integrity.

## Supported versions

| Version | Supported |
| ------- | --------- |
| `0.1.x` | Yes       |
| Older   | No        |

M0 is pre-1.0. Security fixes land on the latest `0.1.x` release. If you deploy
from a fork or a pinned image, track upstream releases and rebuild regularly.

## Reporting a vulnerability

**Do not open a public issue for an unfixed vulnerability.**

Use GitHub's private vulnerability reporting on the repository:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability**.
3. Include:
   - affected version or commit;
   - deployment shape (stdio, local HTTP, hosted HTTP, Docker);
   - a minimal reproduction;
   - impact and any known workaround;
   - whether the issue is already public.

If private reporting is unavailable, contact the maintainers through the
security contact listed in the repository profile. Do not include secrets,
tokens, or personal data in a public issue.

We aim to:

- acknowledge a report within 3 business days;
- provide an initial assessment within 7 business days;
- ship a fix or mitigation for confirmed high-severity issues as soon as
  practical;
- credit reporters who want credit, after the fix is available.

## Scope

In scope:

- the MCP server, CLI, HTTP transport, content loader, and content pipeline;
- authentication and host/CORS controls;
- path traversal or arbitrary file read through content ids or reference bodies;
- denial of service through crafted MCP requests;
- provenance/licensing violations in committed content;
- supply-chain issues in the build or release process.

Out of scope:

- vulnerabilities in upstream dependencies that are already fixed upstream and
  not exploitable through TastePro's usage (report them upstream, but tell us if
  you believe TastePro is affected);
- social engineering;
- issues that require a compromised host, shell access, or a malicious
  `TASTEPRO_CONTENT_DIR`;
- the content of third-party sites referenced by URL;
- brand or trademark disputes (use the attribution process instead).

## Threat model

### Assets

- The content catalog and its provenance.
- Bearer tokens used for hosted `/mcp`.
- The host filesystem, limited to the content directory.
- Availability of the HTTP endpoint.
- Integrity of the release artifact and generated content.

### Trust boundaries

- **Client → server.** MCP arguments are untrusted. Zod validates them; ids are
  resolved against the catalog, not used as raw paths.
- **Server → filesystem.** The content directory is trusted, but reference
  `bodyPath` values are checked to stay inside it.
- **Internet → hosted HTTP.** Anonymous read-only endpoints are exposed to
  arbitrary traffic. Auth, host allowlists, CORS, body limits, session caps, and
  a reverse proxy are the controls.
- **Upstream → ingest.** Pinned GitHub content is parsed and validated. A
  compromised upstream commit is a supply-chain risk; pins and review are the
  mitigation.
- **Build → runtime.** The Docker image ships `dist/`, `content/`, and
  production dependencies. Build provenance and image scanning are deployment
  responsibilities.

### Non-goals

M0 does not execute a browser, run user-supplied code, store user content, or
call an LLM. It does not implement OAuth. It does not rate limit by IP. It does
not protect against a malicious operator who controls the content directory or
environment.

## Deployment guidance

### Local stdio

The client launches the process as the current user. There is no network
surface. Keep the checkout and `node_modules` trusted; do not run `npm run
ingest` against untrusted pins without reviewing the diff.

### Local HTTP

Bind to `127.0.0.1` unless you intentionally need LAN access. If you bind to
`0.0.0.0`, set `TASTEPRO_API_KEY` and an explicit `TASTEPRO_CORS_ORIGIN`. Do not
expose the local Compose file directly to the internet.

### Hosted HTTP

Use HTTPS at a reverse proxy or load balancer. Recommended controls:

- Set `TASTEPRO_API_KEY` for authenticated clients, or run anonymous read-only
  only if the endpoint is intentionally public.
- Set `TASTEPRO_ALLOWED_HOSTS` to the public hostname(s).
- Set `TASTEPRO_CORS_ORIGIN` to the exact browser origins that need it; do not
  use `*` in production.
- Add rate limiting at the proxy/WAF. TastePro caps body size and sessions but
  does not rate limit by IP.
- Keep request bodies at or below 1 MiB at the proxy.
- Do not cache `/mcp` responses.
- Log at the proxy and monitor 401/403/429 rates, health failures, and session
  counts.
- Run the container as non-root, read-only, with `no-new-privileges`, and a
  small `/tmp` tmpfs.
- Pin the image by digest for production. Rebuild to pick up dependency and
  base-image fixes.

Hosted audit endpoints (M2+) must be auth-gated. Do not expose a browser
automation endpoint anonymously, even if the read-only catalog is anonymous.

### Secrets

- `TASTEPRO_API_KEY` is a bearer token. Treat it as a secret.
- Pass it through the environment or a secret manager, not a committed file.
- Do not put it in client configuration that is committed to a repository.
- Rotate it if it leaks. The server reads it at startup; restart to apply.
- The server never logs the token. It does not log request bodies.

### Reverse proxy

Terminate TLS, preserve `Host`, disable response buffering for SSE if you enable
`--sse`, and set timeouts longer than the SSE keep-alive. See
[docs/deployment.md](docs/deployment.md) for a Caddy example.

## Application controls

### Authentication

When `TASTEPRO_API_KEY` is set, every `/mcp` request must send:

```http
Authorization: Bearer <token>
```

The comparison is timing-safe. Health, readiness, and root metadata are
anonymous. Auth is not a substitute for TLS; use both.

M0 does not implement OAuth. ChatGPT custom connectors may require OAuth for
authenticated servers. Use anonymous read-only hosting for ChatGPT in M0, or
wait for the OAuth milestone. Do not weaken auth to make a client work.

### Host allowlist

`TASTEPRO_ALLOWED_HOSTS` rejects requests whose `Host` header (with or without
port) is not listed. This mitigates DNS rebinding and misrouting. Set it in
hosted deployments.

### CORS

CORS is deny-by-default for browser origins unless configured. `*` is allowed
for local development and server-to-server clients that do not send an Origin
header. In production, list exact origins. CORS is not authentication; it only
controls browser reads.

### Body and session limits

- Request bodies are capped at 1 MiB.
- Sessions are capped (default 500) and expire after 30 minutes idle.
- When the cap is exceeded, the least-recently-seen session is evicted.
- `SIGINT`/`SIGTERM` close sessions before draining the HTTP server.

These are availability controls, not a full DoS defense. Use a proxy/WAF for
rate limiting and connection limits.

### Content path safety

Ids are resolved against the catalog. Reference bodies are resolved under the
content directory and rejected if the relative path escapes it. Do not pass
user input directly to the filesystem; go through `ContentLoader`.

### Logging

Logs go to stderr, one line per event. The logger never logs bearer tokens or
request bodies. Stdout is reserved for stdio JSON-RPC. If you add logging,
preserve that split.

## Supply chain

The content pipeline fetches raw files from four pinned GitHub commits. Ingest:

- uses the commit SHA, not a branch;
- retries with timeouts;
- caches files under `.cache/sources/`;
- validates schemas, provenance, counts, and the content hash;
- writes upstream license texts into the repository.

Recommendations:

- Review `sources.lock.json` changes and the generated diff before merging.
- Run `npm run sources:update` deliberately; do not auto-advance pins in CI.
- Keep `package-lock.json` committed and use `npm ci`.
- Run `npm audit` and image scanning in your deployment pipeline.
- Verify the image digest you deploy.

## Content security

Brand packs are analyses of published design systems. They must not include
logos, screenshots, fonts, or proprietary assets. Do not use TastePro content to
impersonate a brand. If you believe content is misattributed or used outside its
license, open an issue with the source id and content id. See
[ATTRIBUTION.md](ATTRIBUTION.md).

Reference documents may contain instructions or examples from upstream. Treat
them as reference text, not as trusted executable instructions. The server does
not execute them.

## Future audit tooling

The planned Playwright audit loop will introduce new risks:

- arbitrary URL fetching (SSRF, internal network access);
- browser sandbox escapes;
- resource exhaustion from rendering;
- artifact storage and signed-link leakage;
- untrusted page content.

Before exposing it:

- require auth on audit endpoints;
- allow public URLs only in hosted mode, with DNS/IP filtering and redirect
  checks;
- run browsers in a sandbox/container with CPU, memory, and time limits;
- isolate artifacts per tenant and expire them;
- never return raw cookies, storage state, or internal headers;
- validate OAuth tokens and scopes.

## Disclosure

We prefer coordinated disclosure. We will credit reporters who want credit once
a fix is available. Please give us a reasonable window before publishing details,
especially for hosted deployments.

## Security checklist for operators

- [ ] HTTPS is terminated at a trusted proxy.
- [ ] `TASTEPRO_API_KEY` is set for authenticated deployments.
- [ ] `TASTEPRO_ALLOWED_HOSTS` is set.
- [ ] `TASTEPRO_CORS_ORIGIN` is explicit, not `*`.
- [ ] Rate limiting and connection limits are in front of the service.
- [ ] Container runs non-root, read-only, with `no-new-privileges`.
- [ ] `/healthz` and `/readyz` are monitored.
- [ ] Logs are collected and do not contain secrets.
- [ ] Dependencies and the base image are patched.
- [ ] Audit endpoints are not exposed in M0.
