# TastePro

TastePro is a read-only [Model Context Protocol](https://modelcontextprotocol.io)
server that gives coding agents design taste: domain playbooks, original design
directions, palettes, type pairings, hero and section blueprints, brand-system
analyses, and a web-interface audit rubric. It is deterministic, works offline,
and never calls an LLM or browses the web on its own.

TastePro speaks **stdio** for local clients and **Streamable HTTP** for hosted
clients. The same server works with ChatGPT, Claude, OpenCode, Cursor, and any
MCP-compatible agent.

## Status: M0

M0 ships the read-only foundation:

- 873 committed content packs across 14 kinds.
- 40-domain taxonomy with 15 deep seed playbooks and same-family fallback for
  uncovered domains.
- 104-rule web-interface audit rubric with severity and category filters.
- `taste_search`, `taste_get`, and `taste_guidelines`.
- Static resources, resource templates, and two design prompts.
- stdio and Streamable HTTP transports.
- Bearer auth, host allowlists, CORS, body limits, session TTL, and health
  checks for the HTTP transport.
- Content ingestion from four pinned upstream repositories.
- Unit, integration, contract, and production-tier tests.
- Docker and staging scaffolding.

Not in M0: browser execution for the audit loop, OAuth, hosted audit
endpoints, and the six original fully built templates. M0 gives agents the
audit rubric and a prompt that plans the audit; the Playwright-driven execution
loop is a later milestone. See [Roadmap](#roadmap).

## Why it exists

Coding agents can write a page, but they often default to the same generic
SaaS landing page: a gradient hero, three feature cards, a fake dashboard, and
no point of view. TastePro gives the agent a curated vocabulary and a decision
sequence:

1. Frame the domain and read its playbook.
2. Commit to one visual direction, not five averaged together.
3. Choose a palette, type pairing, and the sections the page actually needs.
4. Build with real content and real states.
5. Audit against specific, citable rules.

The server returns compact cards first, then full packs only when the agent asks
for them. Response budgets keep context use predictable.

## Quick start

Requirements: Node.js 22 or newer and npm.

```bash
npm ci
npm run build
node dist/cli.js info
node dist/cli.js --stdio
```

`--stdio` is the default transport. It is meant to be launched by an MCP client,
not used interactively from a shell. To expose the HTTP transport locally:

```bash
node dist/cli.js --http --host 127.0.0.1 --port 3000
```

Health check:

```bash
curl http://127.0.0.1:3000/healthz
```

The response includes the content hash, catalog counts, quality mix, and
validation warning count.

### Install as a command

From a checkout:

```bash
npm link
tastepro info
tastepro --stdio
```

When the package is published, `npx -y tastepro --stdio` will be the shortest
local setup.

### Connect a client

- [Client setup: ChatGPT, Claude, OpenCode, Cursor](docs/clients.md)
- [Deployment: Docker, staging, reverse proxy, auth](docs/deployment.md)
- [Content model and authoring](docs/content.md)
- [Architecture and testing](docs/architecture.md)

## What it serves

| Kind          | Count | What it is                              |
| ------------- | ----: | --------------------------------------- |
| `domain`      |    40 | Domain taxonomy; 15 have deep playbooks |
| `direction`   |    20 | Complete visual arguments               |
| `palette`     |    56 | Token sets with contrast checks         |
| `type`        |    44 | Display/text pairings with sources      |
| `hero`        |    58 | Hero archetypes and blueprints          |
| `section`     |   185 | Section blueprints by role              |
| `motion`      |    18 | Motion recipes                          |
| `site`        |   202 | Text studies of real sites              |
| `brand`       |    84 | Brand design-system analyses            |
| `guideline`   |   104 | Web-interface audit rules               |
| `reference`   |    25 | Full reference documents                |
| `app-style`   |     7 | App visual systems                      |
| `app-shell`   |     5 | App shell blueprints                    |
| `app-pattern` |    25 | App screen patterns                     |

Quality mix: 550 verified, 313 reference, 10 incomplete. Incomplete packs are
excluded by default and are never presented as complete.

The content is committed under `content/generated/`, so the server works
offline. It is generated from the pinned sources by `npm run ingest`; do not
hand-edit generated files.

## Tools

### `taste_search`

Search the catalog by product, audience, domain, mood, kind, quality, or source.
Returns compact cards with ids. Defaults: 12 results, 1,400-token budget.

```json
{
  "query": "fintech dashboard",
  "domain": "fintech-payments",
  "kind": "direction",
  "limit": 5
}
```

Search first requires every meaningful query term (with fuzzy tolerance for
typos), then adds the inferred domain playbooks. This keeps a query such as
`dark developer tool` from returning a generic portfolio. If the query lands
only on domains without authored playbooks, the response adds same-family
playbooks and lists them in `familyFallback`; these are references, not
domain-specific playbooks.

### `taste_get`

Fetch one or more packs by id.

```json
{
  "ids": ["domain/fintech-payments", "direction/quiet-instrument"],
  "format": "brief"
}
```

Formats:

- `brief` — decision-oriented projection. Default.
- `full` — the complete pack.
- `markdown` — implementation-oriented document.
- `json` — raw JSON.

`includeBody: true` returns the full body of a reference pack instead of a
1,200-character excerpt. The default budget is 2,400 tokens; `includeBody`
raises the default to the 24,000-token maximum unless you pass an explicit
`maxTokens`.

### `taste_guidelines`

Query the 104-rule web-interface audit rubric.

```json
{
  "query": "focus",
  "severity": "error",
  "format": "markdown",
  "limit": 10
}
```

Use `severity: "error"` for must-fix issues. The Markdown format is a
copy-paste checklist with rule ids and source lines. Rules are pinned to the
Vercel Web Interface Guidelines commit recorded in `sources.lock.json`.

## Resources and prompts

Static resources:

- `tastepro://catalog` — stats, sources, and domain index.
- `tastepro://taxonomy/domains` — the 40 domains and authored playbooks.
- `tastepro://stats` — build stats and validation warnings.
- `tastepro://skill` — the agent-facing skill guide.

Resource templates:

- `tastepro://pack/{+id}` — any pack as JSON. References include the full body.
- `tastepro://guideline/{+id}` — one guideline rule as JSON.

Prompts:

- `design_brief` — turn a project description into a concrete brief.
- `design_audit` — turn a URL, file, or component into a prioritized audit
  plan. The prompt tells the agent not to claim it inspected a page it could
  not load.

## HTTP transport

The HTTP transport uses the MCP Streamable HTTP protocol at `POST /mcp`.
Sessions are stateful and use the `Mcp-Session-Id` header. JSON responses are
the default; `--sse` enables SSE streaming responses.

```bash
TASTEPRO_API_KEY="$(openssl rand -hex 32)" \
  node dist/cli.js --http --host 0.0.0.0 --port 3000
```

With an API key set, every `/mcp` request needs:

```http
Authorization: Bearer <token>
```

Health, readiness, and root metadata stay anonymous:

- `GET /healthz`
- `GET /readyz`
- `GET /`

Other hardening:

- `TASTEPRO_ALLOWED_HOSTS` rejects unexpected `Host` headers.
- CORS is deny-by-default for browser origins unless configured.
- Request bodies are capped at 1 MiB.
- Sessions expire after 30 minutes idle; the server caps concurrent sessions.
- `SIGINT`/`SIGTERM` close sessions and drain the HTTP server.

Hosted read-only access may be anonymous for clients that cannot send a static
bearer token, such as ChatGPT custom connectors in M0. Hosted audit endpoints
will require auth. OAuth validation is planned before hosted audit is exposed.

## Configuration

| Variable                 | Default            | Purpose                                    |
| ------------------------ | ------------------ | ------------------------------------------ |
| `TASTEPRO_CONTENT_DIR`   | package `content/` | Content directory                          |
| `TASTEPRO_HOST`          | `127.0.0.1`        | HTTP bind host                             |
| `TASTEPRO_PORT`          | `3000`             | HTTP port                                  |
| `TASTEPRO_API_KEY`       | unset              | Require bearer auth on `/mcp`              |
| `TASTEPRO_CORS_ORIGIN`   | unset (deny)       | Comma-separated browser origins, or `*`    |
| `TASTEPRO_ALLOWED_HOSTS` | unset              | Comma-separated `Host` allowlist           |
| `TASTEPRO_LOG_LEVEL`     | `info`             | `debug`, `info`, `warn`, `error`, `silent` |
| `TASTEPRO_PUBLIC_URL`    | unset              | Public base URL for hosted links (M2+)     |

CLI flags override environment variables. Run `node dist/cli.js --help` for the
full list.

## Content and provenance

The content pipeline is reproducible:

```bash
npm run ingest            # fetch pinned sources, transform, write content/generated
npm run ingest:offline    # use the local source cache only
npm run validate          # validate schemas, counts, hash, provenance, licenses
npm run sources:update    # check the four pins for newer commits
```

Every pack carries:

```json
{
  "provenance": {
    "source": "taste-skill",
    "repo": "https://github.com/Leonxlnx/taste-skill",
    "commit": "12af471f627f866411b4bd785b19646d3672784c",
    "path": "skills/taste-skill/library/directions.json",
    "license": "MIT",
    "authors": ["Leonxlnx"],
    "transformations": ["..."]
  }
}
```

The `contentHash` in `content/generated/stats.json` covers the catalog, counts,
and source commits. `npm run validate` recomputes it and fails if the committed
content drifts.

See [docs/content.md](docs/content.md) for the content model and authoring
rules.

## Development

```bash
npm run typecheck        # TypeScript strict check
npm run lint             # Biome
npm run format           # Biome format
npm test                 # all tests
npm run test:integration # real stdio/HTTP MCP clients
npm run validate         # content and provenance validation
npm run build            # compile to dist/
npm run smoke:http       # real HTTP MCP smoke test with auth
```

Tests are organized in tiers:

- `tests/unit/` — parsers, schema, budget, search, get, guidelines, loader.
- `tests/integration/` — real stdio and HTTP MCP clients.
- `tests/production/` — committed content, CLI lifecycle, HTTP hardening.

The HTTP tests bind to an ephemeral localhost port. The stdio tests spawn the
real CLI and speak JSON-RPC over pipes. No network is required for the test
suite.

## Docker

```bash
docker compose up --build
curl http://127.0.0.1:3000/healthz
```

The image runs as a non-root user, uses a multi-stage build, and ships the
committed content. For a staging deployment with Caddy and TLS, see
[deploy/staging.compose.yml](deploy/staging.compose.yml) and
[docs/deployment.md](docs/deployment.md).

## Security

TastePro is read-only. It has no write tools, no database, no user accounts,
and no server-side LLM calls. The main risks are content-path traversal,
resource exhaustion, and exposing an unauthenticated hosted endpoint.

Mitigations in M0:

- Content paths are resolved and checked against the content directory.
- Reference bodies are validated at build time and at read time.
- HTTP request bodies are capped at 1 MiB.
- HTTP sessions have an idle TTL and a concurrent-session cap.
- Host allowlists and CORS controls are available.
- Bearer auth is supported for hosted read-only access.
- Logs go to stderr, never stdout, so stdio JSON-RPC stays clean.

Report a vulnerability privately; see [SECURITY.md](SECURITY.md). Do not open a
public issue for an unfixed vulnerability.

## Licensing and attribution

TastePro's original code and content are Apache-2.0. Upstream-derived content
remains under its source license:

- Taste Skill — MIT
- Awesome DESIGN.md — MIT
- Vercel Web Interface Guidelines — MIT
- Microsoft Playwright CLI — Apache-2.0

See [ATTRIBUTION.md](ATTRIBUTION.md), [NOTICE](NOTICE), and the full license
texts in `content/sources/licenses/`. Brand packs are reference analyses, not
templates to clone. Do not impersonate a brand or reuse its logo, copy, or
assets.

## Roadmap

- **M0 (this release):** read-only catalog, playbooks, references, audit rubric,
  stdio + HTTP, hardening, content pipeline, tests, Docker/staging scaffolding.
- **M1:** six original fully built templates; richer domain playbooks; client
  recipes; hosted read-only deployment.
- **M2:** Playwright-based browser audit execution; hosted audit endpoints with
  OAuth; artifact storage and signed links.
- **M3:** team features, private content packs, and a hosted control plane.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). In short: keep changes deterministic,
add tests, preserve provenance, never add third-party screenshots or logos, and
run `npm run typecheck && npm run lint && npm run validate && npm test` before
opening a pull request.
