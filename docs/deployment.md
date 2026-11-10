# Deployment

TastePro has two deployment shapes:

- **Local stdio** — the client launches `dist/cli.js --stdio`. No network, no
  auth, no container required.
- **Hosted Streamable HTTP** — a long-running process serves `POST /mcp`,
  `GET /healthz`, and `GET /readyz`. Use a container, a reverse proxy, and TLS.

The content is read-only and committed. A deployment does not need a database,
an object store, or an LLM API key.

## Local HTTP

```bash
bun ci
bun run build
node dist/cli.js --http --host 127.0.0.1 --port 3000
```

Or:

```bash
bun run dev:http
```

The server prints its URL and auth mode to stderr. Health:

```bash
curl -s http://127.0.0.1:3000/healthz | jq
```

## Docker

Build and run:

```bash
docker build -t tastepro:local .
docker run --rm -p 127.0.0.1:3000:3000 \
  -e TASTEPRO_API_KEY="$(openssl rand -hex 32)" \
  -e TASTEPRO_ALLOWED_HOSTS=localhost,127.0.0.1 \
  tastepro:local
```

Or use Compose:

```bash
docker compose up --build
```

The image:

- Uses a multi-stage Node 22 build.
- Prunes development dependencies from the runtime layer.
- Runs as the non-root `node` user.
- Ships `dist/`, `content/`, and the attribution files.
- Uses a `HEALTHCHECK` against `/healthz`.

The local Compose file binds to `127.0.0.1` only. Do not expose it directly to
the public internet.

## Staging with TLS

The staging scaffold uses Caddy for automatic HTTPS:

```bash
cp deploy/staging.env.example deploy/staging.env
# Edit deploy/staging.env: domain, API key, CORS origin.
docker compose --env-file deploy/staging.env \
  -f deploy/staging.compose.yml up -d --build
```

DNS: point the domain in `TASTEPRO_DOMAIN` at the host before starting Caddy.
Caddy needs ports 80 and 443 (TCP and UDP) reachable for ACME.

The Compose file:

- Builds the image from the repository root.
- Runs TastePro as a read-only container with `no-new-privileges`.
- Sets `TASTEPRO_ALLOWED_HOSTS` to the staging domain plus `localhost` and
  `127.0.0.1` so the container healthcheck passes.
- Exposes TastePro only on the internal Docker network.
- Puts Caddy in front for TLS, compression, and security headers.

Verify:

```bash
curl -fsS https://mcp-staging.example.com/healthz | jq
curl -fsS https://mcp-staging.example.com/readyz | jq
```

Then add `https://mcp-staging.example.com/mcp` to your MCP client.

### Production compose

`deploy/production.compose.yml` is the production-shaped self-host profile:
Caddy terminates TLS, OAuth is required, HTTP is stateless, the container is
read-only and non-root, and CPU/memory limits are set. Copy the example env and
set the image, domain, and IdP:

```bash
cp deploy/production.env.example deploy/production.env
# edit deploy/production.env
docker compose --env-file deploy/production.env \
  -f deploy/production.compose.yml up -d
```

The compose file does not rate limit by itself. Put a WAF/CDN in front or use a
Caddy build with a rate-limit plugin.

### Anonymous read-only mode

Anonymous non-loopback hosting is an explicit opt-in. The server refuses to
bind a non-loopback host without either an API key or
`TASTEPRO_ALLOW_ANONYMOUS=true`:

```bash
docker run --rm -p 127.0.0.1:3000:3000 \
  -e TASTEPRO_ALLOW_ANONYMOUS=true \
  -e TASTEPRO_ALLOWED_HOSTS=localhost,127.0.0.1 \
  -e TASTEPRO_CORS_ORIGIN="https://app.example.com" \
  tastepro:local
```

For a public anonymous endpoint, put a rate-limiting proxy, CDN, or WAF in
front. The server has a 1 MiB body cap and a session cap, but it does not rate
limit by IP. Anonymous hosting is read-only by contract: the server removes the
`taste_audit` tool (and its URL fetcher and browser renderer) from explicitly
anonymous non-loopback binds. Do not use anonymous mode for anything else.

### OAuth (hosted auth)

TastePro is an OAuth **resource server**: it validates access tokens from your
IdP, it does not issue them. Configure it with the issuer, the public origin,
and (optionally) a JWKS endpoint; OIDC discovery is used when no JWKS URI is
set:

```bash
TASTEPRO_OAUTH_ISSUER="https://idp.example.com" \
TASTEPRO_PUBLIC_URL="https://tastepro.example.com" \
TASTEPRO_ALLOWED_HOSTS="tastepro.example.com" \
  node dist/cli.js --http --host 0.0.0.0 --port 3000
```

With OAuth configured:

- Every `/mcp` request needs `Authorization: Bearer <jwt>`. Tokens are verified
  for signature (RS256/ES256 via JWKS), issuer, audience, and expiry.
- The expected audience defaults to `<public-url>/mcp`; override it with
  `TASTEPRO_OAUTH_AUDIENCE` if your IdP issues a different audience.
- `/.well-known/oauth-protected-resource` (and its `/mcp` variant) publish the
  resource, authorization server, and scopes so MCP clients can discover the
  flow.
- The `taste_audit` tool requires the `tastepro:audit` scope. Read-only tools
  work with any valid token.
- Unauthenticated or invalid requests get `401` with a
  `WWW-Authenticate: Bearer resource_metadata="..."` challenge.
- OAuth and `TASTEPRO_API_KEY` cannot be combined; the server refuses to start.

Static bearer keys remain supported for single-operator deployments (CI, one
team) and grant all scopes. Use OAuth for multi-user hosted access.

Operational notes:

- TastePro caches the IdP's JWKS and refreshes when it sees an unknown `kid`.
  Publish a new signing key before removing the old one. Keep access tokens
  short-lived (15 minutes or less): TastePro validates expiry but does not
  introspect or revoke tokens.
- The reference Keycloak realm is development-only (HTTP, known passwords).
  Replace it with your IdP and HTTPS in production.

For a local end-to-end check, the repository includes a reference Keycloak
realm:

```bash
docker compose -f deploy/keycloak.compose.yml up -d
bun run smoke:oauth
docker compose -f deploy/keycloak.compose.yml down -v
```

The smoke verifies a real token, the `tastepro:audit` scope, scope denial, and
audience rejection. Replace the development realm with your IdP in production.

HTTP is stateless by default (`TASTEPRO_HTTP_MODE=stateless`), so the token's
scopes are evaluated on every request and any replica can serve any request.
Stateful mode (`--stateful` / `TASTEPRO_HTTP_MODE=stateful`) is required only
for SSE and resumability; it needs sticky routing when you run more than one
replica.

### The audit tool and privacy

`taste_audit` runs deterministic checks over submitted HTML. Defaults are
deliberately conservative:

- Submitted documents are never stored, logged, or written to disk. Responses
  contain only short evidence snippets. No project content is persisted.
- URL input (`TASTEPRO_AUDIT_ALLOW_URL_FETCH=true`) is SSRF-guarded: private,
  loopback, link-local, CGNAT, documentation, and multicast addresses are
  refused before fetching, with redirect, size (2 MiB), and timeout (5 s) caps.
  The guard is best-effort; keep outbound firewall rules in place and prefer
  submitting HTML directly.
- Browser mode (`TASTEPRO_AUDIT_BROWSER=playwright`) renders the already
  fetched HTML with JavaScript disabled, blocks service workers, and aborts
  every subresource request, so images, stylesheets, fonts, and iframes in the
  submitted document cannot reach the network. It uses hard timeouts and a
  concurrency/queue gate. Use the optional `Dockerfile.audit` image; the default
  image is Playwright-free. Do not enable browser mode without CPU/memory
  limits and a larger `/dev/shm`.
- Remove the tool entirely with `TASTEPRO_AUDIT_ENABLED=false`.
- Tune the gate with `TASTEPRO_AUDIT_MAX_CONCURRENCY` (default 2) and
  `TASTEPRO_AUDIT_MAX_QUEUE` (default 8). Excess requests fail fast with a
  "busy" error instead of queueing without bound.

## Environment variables

| Variable                         | Default            | Notes                                                         |
| -------------------------------- | ------------------ | ------------------------------------------------------------- |
| `TASTEPRO_HOST`                  | `127.0.0.1`        | Use `0.0.0.0` inside a container                              |
| `TASTEPRO_PORT`                  | `3000`             | Container port                                                |
| `TASTEPRO_API_KEY`               | unset              | When set, `/mcp` requires `Authorization: Bearer`             |
| `TASTEPRO_OAUTH_ISSUER`          | unset              | IdP issuer URL; enables OAuth on `/mcp`                       |
| `TASTEPRO_OAUTH_AUDIENCE`        | `<public-url>/mcp` | Expected audience                                             |
| `TASTEPRO_OAUTH_JWKS_URI`        | OIDC discovery     | JWKS endpoint                                                 |
| `TASTEPRO_PUBLIC_URL`            | unset              | Public origin; required with OAuth                            |
| `TASTEPRO_HTTP_MODE`             | `stateless`        | `stateful` enables sessions and SSE                           |
| `TASTEPRO_ALLOW_ANONYMOUS`       | `false`            | Explicit opt-in for an unauthenticated non-loopback endpoint  |
| `TASTEPRO_CORS_ORIGIN`           | unset (deny)       | Comma-separated browser origins. Set explicitly in production |
| `TASTEPRO_ALLOWED_HOSTS`         | unset              | Comma-separated `Host` allowlist; required off loopback       |
| `TASTEPRO_AUDIT_ENABLED`         | `true`             | Set `false` to remove the `taste_audit` tool                  |
| `TASTEPRO_AUDIT_ALLOW_URL_FETCH` | `false`            | Allow the SSRF-guarded `url` input                            |
| `TASTEPRO_AUDIT_BROWSER`         | unset              | `playwright` for browser rendering (JavaScript disabled)      |
| `TASTEPRO_AUDIT_MAX_CONCURRENCY` | `2`                | Maximum in-flight audits                                      |
| `TASTEPRO_AUDIT_MAX_QUEUE`       | `8`                | Maximum queued audits before a busy error                     |
| `TASTEPRO_LOG_LEVEL`             | `info`             | `debug` for staging diagnosis; `warn` in production           |
| `TASTEPRO_CONTENT_DIR`           | package `content/` | Override only if you ship content separately                  |

CLI flags override environment variables. For example:

```bash
node dist/cli.js --http --port 8080 --log-level warn
```

## Reverse proxy checklist

- Terminate TLS at the proxy.
- Forward `Host` unchanged so the allowlist works.
- Do not buffer or transform `/mcp` responses; Streamable HTTP may use SSE.
- Keep request bodies at or below 1 MiB at the proxy as well.
- Set generous read timeouts for SSE streams, or use JSON responses (the
  default) and keep timeouts short.
- Add rate limits for anonymous deployments.
- Do not cache `/mcp` responses. Health endpoints may be cached briefly.

Caddy example (the staging scaffold uses this):

```caddyfile
{$TASTEPRO_DOMAIN} {
  encode zstd gzip
  reverse_proxy tastepro:3000
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "no-referrer"
  }
}
```

Nginx needs `proxy_buffering off;` and `proxy_read_timeout` longer than the SSE
keep-alive if you enable `--sse`.

### Rate limiting, metrics, and retention

- Rate limit at the edge: per-IP for anonymous traffic and per-token for OAuth.
  The app caps body size and audit concurrency but does not rate limit by IP.
- Scrape proxy metrics and alert on 401/403/429/5xx rates, p95 latency, audit
  busy errors, memory, and container restarts. The app exposes `/healthz` and
  `/readyz`; it does not expose Prometheus metrics.
- Logs go to stderr and never contain tokens or request bodies. Retention is
  the operator's policy; keep it short and restrict access.

## Health and readiness

- `GET /healthz` returns content stats. It fails with 503 if the content cannot
  be loaded.
- `GET /readyz` is the same check. Use it for container readiness.
- `GET /` returns name, version, endpoint, auth mode, and session count.

The health payload includes `contentHash`, `catalogEntries`, `counts`,
`quality`, `warnings`, `sessions`, and `uptimeSeconds`. Alert on:

- non-200 health for more than a minute;
- `catalogEntries` not equal to the expected snapshot;
- a change in `contentHash` outside a deploy;
- warning count growth;
- session count approaching the cap.

## Logs

Logs go to stderr as one line per event. The default level is `info`; session
creation and closure are logged at `info`, request timing at `debug`. Never log
bearer tokens. The server does not log request bodies.

## Updating content

Content is baked into the image. To update:

```bash
bun run sources:update          # check pins
bun run ingest -- --refresh     # fetch and regenerate
bun run validate
bun run test
bun run build
docker build -t tastepro:staging .
```

Then deploy the new image. The `contentHash` changes, which makes the rollout
auditable. Keep the old image until the new one passes `/healthz`.

## Resource sizing

The catalog is small. A single instance with 256–512 MiB of RAM is enough for
read-only use. The Node process holds the catalog, kind files, reference bodies,
and two MiniSearch indexes. Startup is lazy: a client that only reads the skill
resource does not build the indexes.

Stateless is the default: no session state, no sticky routing, and any replica
can serve any request. If you opt into stateful mode for SSE/resumability, the
session map is in memory; use sticky routing (for example, a load balancer that
routes `Mcp-Session-Id` consistently) and do not share sessions across replicas.
A single instance with 256–512 MiB is enough for stateless read-only use; add
memory for concurrent browser audits.

## Backups

There is nothing to back up at runtime. The source of truth is the git
repository, the pinned source commits, and the generated content. Back up the
repository and the deployment configuration; do not back up container
filesystems.

## Rollback

Deploy the previous image tag. Because content is immutable per image, rollback
also rolls back the catalog and content hash. If you use an external
`TASTEPRO_CONTENT_DIR`, roll back that volume or directory at the same time.
