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
npm ci
npm run build
node dist/cli.js --http --host 127.0.0.1 --port 3000
```

Or:

```bash
npm run dev:http
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

### Anonymous read-only mode

M0 is read-only. If a client cannot send a static bearer token, you may run the
hosted endpoint anonymously:

```bash
docker run --rm -p 127.0.0.1:3000:3000 \
  -e TASTEPRO_CORS_ORIGIN="https://app.example.com" \
  tastepro:local
```

For a public anonymous endpoint, put a rate-limiting proxy, CDN, or WAF in
front. The server has a 1 MiB body cap and a session cap, but it does not rate
limit by IP. Anonymous hosting is only appropriate for the read-only tools that
exist in M0. Hosted audit endpoints must be auth-gated.

### OAuth status

M0 supports static bearer auth, not OAuth. ChatGPT custom connectors generally
expect OAuth for authenticated remote servers. Use an anonymous read-only
endpoint for ChatGPT in M0, or wait for the OAuth milestone before exposing
audit endpoints. Do not put a static bearer token in a place where ChatGPT
cannot send it.

## Environment variables

| Variable                 | Default            | Notes                                                         |
| ------------------------ | ------------------ | ------------------------------------------------------------- |
| `TASTEPRO_HOST`          | `127.0.0.1`        | Use `0.0.0.0` inside a container                              |
| `TASTEPRO_PORT`          | `3000`             | Container port                                                |
| `TASTEPRO_API_KEY`       | unset              | When set, `/mcp` requires `Authorization: Bearer`             |
| `TASTEPRO_CORS_ORIGIN`   | unset (deny)       | Comma-separated browser origins. Set explicitly in production |
| `TASTEPRO_ALLOWED_HOSTS` | unset              | Comma-separated `Host` allowlist                              |
| `TASTEPRO_LOG_LEVEL`     | `info`             | `debug` for staging diagnosis; `warn` in production           |
| `TASTEPRO_CONTENT_DIR`   | package `content/` | Override only if you ship content separately                  |

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
npm run sources:update          # check pins
npm run ingest -- --refresh     # fetch and regenerate
npm run validate
npm test
npm run build
docker build -t tastepro:staging .
```

Then deploy the new image. The `contentHash` changes, which makes the rollout
auditable. Keep the old image until the new one passes `/healthz`.

## Resource sizing

The catalog is small. A single instance with 256–512 MiB of RAM is enough for
read-only use. The Node process holds the catalog, kind files, reference bodies,
and two MiniSearch indexes. Startup is lazy: a client that only reads the skill
resource does not build the indexes.

Sessions are in memory. If you run multiple replicas, use sticky sessions or a
load balancer that routes `Mcp-Session-Id` consistently. The server does not
share sessions across replicas. For a stateless deployment, use one replica or
wait for a shared session store.

## Backups

There is nothing to back up at runtime. The source of truth is the git
repository, the pinned source commits, and the generated content. Back up the
repository and the deployment configuration; do not back up container
filesystems.

## Rollback

Deploy the previous image tag. Because content is immutable per image, rollback
also rolls back the catalog and content hash. If you use an external
`TASTEPRO_CONTENT_DIR`, roll back that volume or directory at the same time.
