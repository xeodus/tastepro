# Architecture

TastePro is a read-only MCP server. It loads a committed, validated content
catalog, exposes four tools and a small set of resources/prompts, and speaks
either stdio or Streamable HTTP. It has no database, no user accounts, no
server-side LLM calls, and no network access at request time.

The architecture optimizes for four things:

1. **Determinism.** The same query and content hash produce the same response.
2. **Context economy.** Agents get compact cards first and full packs only when
   they ask, with token budgets on every response.
3. **Auditability.** Every pack carries source, commit, path, license, authors,
   and transformations. The catalog has a content hash.
4. **Small operational surface.** One Node process, a read-only filesystem, and
   no external services.

## Runtime topology

```text
┌──────────────────────┐        stdio (JSON-RPC)        ┌──────────────────────┐
│ Claude Desktop       │ ◄────────────────────────────► │                      │
│ Claude Code          │                                │                      │
│ OpenCode / Cursor    │                                │   tastepro process   │
└──────────────────────┘                                │                      │
                                                        │  MCP server          │
┌──────────────────────┐   Streamable HTTP  /mcp       │  ├─ taste_search     │
│ ChatGPT connector    │ ◄────────────────────────────► │  ├─ taste_get        │
│ Remote agent / CI    │                                │  └─ taste_guidelines │
└──────────────────────┘                                │                      │
                                                        │  ContentLoader       │
                                                        │  SearchService       │
                                                        │  GetService          │
                                                        │  GuidelinesService   │
                                                        └──────────┬───────────┘
                                                                   │
                                                        content/generated/*
                                                        content/references/*
```

Both transports share the same `TasteProContext`. A stdio process serves one
client. An HTTP process is stateless by default: each request gets its own SDK
server/transport pair, so any replica can serve it. Stateful mode keeps one
server/transport pair per `Mcp-Session-Id`; all modes share the same immutable
loader and indexes.

## Module map

| Path                         | Responsibility                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `src/cli.ts`                 | CLI parsing, stdio/HTTP startup, signal handling, local commands                 |
| `src/server/server.ts`       | MCP tools, resources, resource templates, prompts                                |
| `src/server/context.ts`      | Shared service construction                                                      |
| `src/server/http.ts`         | Hono app, stateless/stateful transport, auth, host guard, CORS, health, shutdown |
| `src/server/instructions.ts` | Server instructions and `tastepro://skill`                                       |
| `src/server/logger.ts`       | stderr-only structured logger                                                    |
| `src/core/content/loader.ts` | Content-dir resolution, lazy validated loading, id resolution                    |
| `src/core/schema.ts`         | Zod schemas for every content kind and for catalog/stats/sources                 |
| `src/core/search.ts`         | MiniSearch index, alias/domain inference, ranking, budgets                       |
| `src/core/get.ts`            | brief/full/markdown/json projections and token fitting                           |
| `src/core/guidelines.ts`     | Guideline index, filters, checklist Markdown, budgets                            |
| `src/core/budget.ts`         | Token estimation and response fitting                                            |
| `src/core/text.ts`           | Slugify, normalize, tokenize, light stemming, summaries                          |
| `scripts/ingest.ts`          | Fetch pinned sources, transform, write generated content                         |
| `scripts/validate.ts`        | Content, provenance, hash, reference, and playbook validation                    |
| `scripts/update-sources.ts`  | Check or advance the four source pins                                            |
| `scripts/smoke-http.ts`      | Real HTTP MCP smoke test with auth                                               |

## Request lifecycle

### Search

1. The MCP tool validates arguments with Zod and calls `SearchService.search`.
2. The service loads the catalog through `ContentLoader` (memoized).
3. The query is normalized and tokenized. Stopwords and one-character terms are
   dropped; a light stemmer handles plurals.
4. `domainsForQuery` scores domain names and aliases against the query. Phrase
   aliases such as `developer tool` outweigh single-word aliases.
5. MiniSearch runs an **AND-first** query over catalog fields. Fuzzy matching is
   allowed per term, so typos still work; every meaningful term must be present.
6. Inferred domain playbooks are merged in, even when their text does not
   contain every query term. This is what makes `fintech dashboard` start with
   the fintech playbook.
7. If the query lands **only** on taxonomy-only domains, same-family playbooks
   are merged in as `familyFallback`. This is a starting point, not a
   domain-specific playbook. Explicit `domain` filters stay literal.
8. If a kind filter leaves no literal match but the query infers a domain, packs
   of that kind mapped to the inferred domain are merged in and the response
   reports `match: "domain-fallback"`. This is narrow: it only runs when the
   filtered result set is empty.
9. Results are grouped: inferred domain playbooks first, same-family fallback
   playbooks next, then full-coverage matches, then partial coverage. Within a
   group, BM25 score, quality, kind priority, and name break ties.
10. Cards are projected, the response is fitted to the token budget, and hints
    explain the match mode and next step. Identity, provenance, and source URLs
    are preserved exactly or omitted as whole fields; they are never truncated.

If AND matching returns nothing, the response still contains inferred domain
playbooks and a hint. The separate `suggest()` path is used only for missing
`taste_get` ids; it allows OR matching but requires at least one exact term.

### Get

1. Ids are resolved exactly, then by trailing suffix if unique.
2. Packs are loaded lazily from their kind file.
3. The requested projection is built:
   - `brief` — decision-oriented fields.
   - `full` — complete pack.
   - `markdown` — implementation document.
   - `json` — raw pack.
4. Brand Markdown puts contrast and the anti-impersonation note before the
   token tables so accessibility warnings survive a tight budget.
5. Reference `includeBody: true` raises the default budget to the 24,000-token
   maximum unless the caller passed an explicit `maxTokens`.
6. The response is fitted to budget. Missing ids return suggestions rather than
   a bare error.

### Guidelines

1. The 104 guideline packs are loaded and indexed separately from the catalog.
2. Filters apply first (severity, category substring).
3. A query uses **AND** semantics with the same fuzzy/prefix tolerance. Audit
   queries are short; OR would return the entire rubric for a single common
   word.
4. Results are sorted by category, severity, and source line.
5. JSON cards or a Markdown checklist is produced and fitted to budget.

## Content loading

`resolveContentDir` tries, in order:

1. an explicit `contentDir` option,
2. `TASTEPRO_CONTENT_DIR`,
3. the package-relative `content/` directory,
4. `./content` from the current working directory.

The first directory containing `generated/catalog.json` wins. This supports
`tsx` from `src/`, compiled `dist/`, an bun install, a Docker image, and test
fixtures without separate code paths.

The loader validates every file with Zod on first read and memoizes it. It
rejects duplicate catalog ids, kind/file mismatches, and malformed packs with
the file path and issue list. Reference bodies are resolved under the content
directory and rejected if the relative path escapes it.

The loader never mutates pack objects. Services can share it safely across
sessions.

## Search ranking

MiniSearch provides BM25 over these fields:

| Field     | Boost | Why                            |
| --------- | ----: | ------------------------------ |
| `name`    |   3.2 | Names are the strongest signal |
| `tags`    |   2.0 | Curated vocabulary             |
| `domains` |   2.2 | Cross-domain discovery         |
| `moods`   |   1.4 | Art-direction queries          |
| `summary` |   1.0 | Prose fallback                 |
| `sectors` |   0.8 | Upstream vocabulary            |
| `kind`    |   0.6 | Allows "palette" as a query    |

Quality is a boost, not a filter: verified ×1.35, reviewed ×1.2, reference ×1.0,
draft ×0.55, incomplete ×0.4. Incomplete and draft packs are excluded unless
`includeIncomplete` is true.

Kind priority is used only as a deterministic tie-breaker. Domain playbooks come
first because they are the first step of the agent workflow; directions, brands,
sites, palettes, and type follow.

Family fallback is a precision feature, not a recall feature. It activates only
when every inferred domain is taxonomy-only, and it returns same-family
playbooks rather than pretending the uncovered domain has one. The response
field `familyFallback` lists the added domain ids, and a hint says they are not
domain-specific.

The index covers catalog cards, not full pack bodies. This keeps memory and query
cost low. `taste_get` is the step that loads the full playbook.

## Response budgets

Budgets are estimated, not tokenized with a model-specific tokenizer. The
estimate is intentionally conservative: roughly four characters per token plus
a small per-item overhead. Every response reports `truncated`.

| Tool               | Default | Maximum |
| ------------------ | ------: | ------: |
| `taste_search`     |   1,400 |  24,000 |
| `taste_get`        |   2,400 |  24,000 |
| `taste_guidelines` |   1,800 |  24,000 |

Fitting is progressive:

- Search: shorten summaries/tags/moods, then drop trailing cards, then reduce
  the last card to a minimal stub.
- Get: fit JSON by dropping optional detail; fit Markdown/text by truncating at
  a word boundary with a visible notice.
- Guidelines: shorten cards, then drop trailing rules, then reduce summaries.

This guarantees a response stays under budget without silently losing the fact
that it was truncated.

## HTTP transport

`src/server/http.ts` builds a Hono app and serves it with `@hono/node-server`.

| Route      | Method          | Auth                | Purpose                                      |
| ---------- | --------------- | ------------------- | -------------------------------------------- |
| `/mcp`     | POST/GET/DELETE | Bearer off loopback | MCP Streamable HTTP                          |
| `/healthz` | GET             | No                  | Liveness plus content stats                  |
| `/readyz`  | GET             | No                  | Same check for readiness                     |
| `/`        | GET             | No                  | Name, version, endpoint, auth mode, sessions |

Stateless is the default. Every request gets a fresh server/transport pair;
the SDK issues no `Mcp-Session-Id`, `GET`/`DELETE` return 405, and the token's
scopes are applied per request. Any replica can serve any request, so no sticky
routing or session store is needed.

Stateful mode (`--stateful` / `TASTEPRO_HTTP_MODE=stateful`) generates
`Mcp-Session-Id` on initialize and stores the transport/server pair in a map.
Sessions expire after 30 minutes idle (configurable), and the map is capped at
500 sessions by default. When the cap is exceeded, the least-recently-seen
session is evicted. Use stateful mode only for SSE/resumability, and use sticky
routing when running more than one replica.

JSON responses are the default. `--sse` enables SSE streaming and requires
stateful mode; stateless mode rejects it at startup.

Hardening:

- With OAuth configured, `/mcp` verifies JWT access tokens (signature via JWKS
  or OIDC discovery, issuer, audience, expiry, RS256/ES256 only) at the HTTP
  boundary and serves `/.well-known/oauth-protected-resource`. The verified
  principal's scopes are attached to the request (or the stateful session); the
  MCP layer never sees tokens. OAuth and a static API key cannot be combined.
- Bearer auth uses a timing-safe comparison and applies only to `/mcp`. A
  non-loopback bind fails closed without OAuth or `TASTEPRO_API_KEY` unless
  `TASTEPRO_ALLOW_ANONYMOUS=true` is set explicitly; explicitly anonymous
  non-loopback binds have the `taste_audit` tool removed entirely.
- `taste_audit` requires the `tastepro:audit` scope on hosted requests. Its
  URL input is SSRF-guarded (private/loopback/link-local addresses refused,
  redirect, size, and timeout caps) and is disabled by default. Browser mode
  renders with JavaScript disabled, blocks service workers, aborts every
  subresource request, and enforces hard timeouts; a concurrency/queue gate
  bounds both static and browser audits. No submitted document is stored or
  logged.
- `Host` allowlisting rejects unexpected hostnames before routing; it is
  required for non-loopback binds.
- Browser origins are deny-by-default. A request with an untrusted `Origin` is
  rejected before authentication or request handling, not just without CORS
  headers. `*` is intended for local development only.
- Request bodies are capped at 1 MiB.
- In stateful mode, invalid session limits fall back to safe defaults instead of
  disabling the cap or creating a zero-delay cleanup timer.
- `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer` are set.
- Logs go to stderr only, so stdio JSON-RPC on stdout stays clean.
- `SIGINT`/`SIGTERM` close stateful MCP sessions first, then close the HTTP
  server and remaining connections.

Health returns 503 if content cannot be loaded. It reports the content hash,
catalog counts, quality mix, warning count, session count, and uptime. It does
not expose file paths or environment values.

## Content pipeline

```text
sources.lock.json (pinned SHAs)
        │
        ▼
scripts/ingest.ts ── fetch raw GitHub files ──► .cache/sources/
        │                                         (reused offline)
        ▼
scripts/lib/{taste,brand,guidelines,domains}.ts
        │  normalize, map domains, compute contrast, derive summaries
        ▼
content/generated/{catalog,kinds/*,sources,stats}.json
content/references/**/*.md
content/sources/licenses/*.txt
content/sources.lock.json
        │
        ▼
scripts/validate.ts ── schema, counts, hash, provenance, references, playbooks
```

The cache is keyed by source id, pinned commit, and upstream path. `--refresh`
bypasses it. `--offline` fails if a required file is missing rather than
silently producing partial content.

Ingest writes a complete snapshot into a sibling staging directory, validates
it, and only then swaps it into place. A failed fetch, transform, or validation
leaves the live content untouched.

The content hash covers the catalog, every full pack file (including embedded
reference bodies), the readable reference Markdown, and source commits.
Validation recomputes it from the served files and fails on drift. Generated
files are committed so the server works without network access.

## Determinism and performance

- No request-time network calls.
- No LLM calls.
- No randomness in ranking; ties are broken by stable fields.
- Indexes are built lazily on first search/guideline call and memoized.
- Catalog cards are small; full packs are loaded only by id.
- A single process holds the catalog and two indexes. 256–512 MiB is ample.

The only nondeterministic fields are timestamps (`startedAt`, health uptime,
`generatedAt`) and session ids. Content responses are stable for a content hash.

## Testing strategy

| Tier        | Location                 | What it proves                                                                  |
| ----------- | ------------------------ | ------------------------------------------------------------------------------- |
| Unit        | `tests/unit/`            | Parsers, schemas, budgets, ranking, projections, loader behavior                |
| Integration | `tests/integration/`     | Real stdio and HTTP MCP clients against the real server                         |
| Production  | `tests/production/`      | Committed content invariants, CLI lifecycle, HTTP hardening                     |
| Smoke       | `scripts/smoke-http.ts`  | Auth, initialize, tools, search/get/guidelines/audit, resources, prompts, close |
| OAuth smoke | `scripts/smoke-oauth.ts` | Real Keycloak token, audit scope, scope denial, audience rejection              |

Unit tests use fixtures and temporary content directories. Integration tests
spawn the compiled or `tsx` CLI and speak JSON-RPC over pipes or real HTTP.
Production tests read the committed catalog and assert counts, provenance,
reference bodies, domain playbooks, and the content hash. No network is required.

Coverage thresholds are configured in `vitest.config.ts` for the core and parser
modules.

## Failure modes

| Failure                        | Behavior                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------- |
| Missing content                | CLI exits with a clear "run ingest" message                                  |
| Invalid JSON/schema            | Loader throws with file path and Zod issues                                  |
| Missing id                     | `taste_get` returns `missing` plus suggestions                               |
| No search matches              | Empty results plus domain hints; inferred playbooks if any                   |
| Budget too small               | Response is truncated with a visible flag, never silently cut                |
| Session expired                | HTTP 404 JSON-RPC error telling the client to initialize again (stateful)    |
| Stateless GET/DELETE           | HTTP 405 with `Allow: POST`                                                  |
| Unauthorized                   | HTTP 401 with `WWW-Authenticate: Bearer` (+ `resource_metadata` under OAuth) |
| Missing audit scope            | `taste_audit` returns an error naming the required scope                     |
| Audit URL refused              | `taste_audit` error explaining SSRF/limit rules; nothing fetched             |
| Audit busy                     | `taste_audit` error asking the client to retry                               |
| Browser render timeout         | `taste_audit` error; the browser is closed                                   |
| Unexpected host                | HTTP 403 `forbidden_host`                                                    |
| Content load failure at health | HTTP 503                                                                     |

## Extension points

The current design leaves room for later milestones without changing the
read-only contract:

- **Templates (M1).** Add a `template` kind, generated/original packs, and a
  `taste_get` Markdown projection. Templates should carry the same provenance
  and quality fields.
- **Executed-JS audit.** Browser mode renders with JavaScript disabled. Running
  page scripts would add real runtime evidence but needs a hardened sandbox,
  egress policy, and artifact rules; it is deliberately out of scope.
- **Private packs (M3).** Add a content source abstraction and per-tenant
  overlays; the loader already resolves a single content directory, so this
  needs a merge layer, not a rewrite.
- **Stateful scaling.** Stateless is the default and needs no shared state.
  Stateful mode's in-memory map needs sticky routing or a shared store if it is
  ever run with multiple replicas.

## Decision log

| Decision                        | Rationale                                                    |
| ------------------------------- | ------------------------------------------------------------ |
| stdio + Streamable HTTP         | Covers local agents and hosted connectors with one server    |
| Hono + WebStandard transport    | Small, portable, works with the SDK's web-standard transport |
| MiniSearch BM25, no embeddings  | Deterministic, offline, fast, no model dependency            |
| AND-first search                | Precision matters more than recall for a curated catalog     |
| Separate guideline search       | Audit rules need different filters and output shape          |
| Committed generated content     | Offline operation, reproducible deploys, auditable hash      |
| Lazy loading + memoization      | Fast startup for clients that only read the skill resource   |
| Token budgets on every response | Predictable context cost for agents                          |
| No server-side LLM              | Determinism, cost, privacy, and a smaller attack surface     |
