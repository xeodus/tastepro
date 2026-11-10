# AGENTS.md

TastePro is a TypeScript MCP server (stdio and Streamable HTTP) serving a pinned, offline design-content snapshot, plus an opt-in `taste_audit` tool that can fetch URLs (SSRF-guarded) and render HTML without JavaScript. Runtime requests never hit a database and never store submitted documents.

## Verify changes

- Bun 1.4.4 (CI: Bun 1.4.4; Node 22 only for the Playwright audit image). ESM/NodeNext; local imports use `.js` suffixes.
- CI order: `bun ci && bun audit && bun run typecheck && bun run lint && bun run validate && bun run test && bun run build && bun run smoke:http`.
- One test file: `bunx vitest run tests/unit/budget.test.ts`; filter by name with `-t "<pattern>"`.
- `bun run test:integration` runs the real stdio/HTTP MCP client suites (also included in `bun run test`).
- `bun run build:binaries` builds the host standalone binary with embedded content; `bun run smoke:binary` runs it over real stdio from a temp cwd.
- `bun run smoke:oauth` runs the real Keycloak E2E; start `deploy/keycloak.compose.yml` first. It is not part of the default gate.
- `bun run lint` runs Biome check (lint plus format); `lint:fix` applies safe fixes.
- `bun run build` compiles only `src/` into gitignored `dist/`. Tests and scripts are typechecked by `bun run typecheck`, not built.

## Cleanup after confirmed work

Once a change is confirmed, qualified (tests/checks pass), and committed, remove the private/temp artifacts it created before starting the next item.

- Remove: session scratch dirs, tarballs, `coverage/`, `.cache/research`, stale logs, and local Docker images/build cache created for verification.
- Keep: tracked source, `dist/`, `node_modules/`, `.cache/sources` (offline ingest), current evidence, secrets, and user data.
- Never delete uncommitted work or unrelated temp trees. Verify with `df -h` and `du -sh`; report what was removed.

## Architecture boundaries

- `src/core/`: deterministic schemas, content loading, search, retrieval, budgeting. Keep transport and HTTP concerns out.
- `src/server/`: MCP tools/resources/prompts (`server.ts`), HTTP transport/hardening (`http.ts`), and the Bun/Node server adapter (`serve.ts`).
- `src/cli.ts`: CLI commands and transport startup. `src/index.ts` and `src/server.ts` are public package entrypoints; note the `src/server.ts` file versus `src/server/` directory.
- `scripts/`: privileged build/release pipeline (`ingest`, `validate`, `update-sources`, `smoke-http`, `build-binaries`, `smoke-binary`). Runtime loads one immutable snapshot; do not add write paths, databases, or vector stores to `src/core`.
- Runtime logs go to stderr. stdout is reserved for MCP stdio frames; never add `console.log` to runtime code.

## Content pipeline

- Authored inputs: `content/domains/seed.json`, `content/taxonomy/domains.json`, `content/sources.lock.json`.
- Fetched or derived and committed: licenses, `content/generated/**`, `content/references/**`. Never hand-edit these; regenerate them.
- `bun run ingest` fetches pinned sources; `ingest:offline` uses `.cache/sources`; add `-- --refresh` to ignore the cache.
- Ingest stages a complete snapshot, runs the release validator, and swaps it into place. A failed fetch, transform, or validation leaves the live content untouched; still start from a clean tree and inspect the diff.
- Root `sources.lock.json` is the human-edited pin source. `content/sources.lock.json` is derived; `bun run sources:update --write` edits the root, then ingest refreshes the packaged copy.
- Source cache paths include the pinned commit, so changing a pin cannot reuse stale bytes.
- Exact content counts are asserted in `scripts/lib/validate-content.ts`; the 873 catalog total is also hardcoded in `scripts/smoke-http.ts` and `.github/workflows/ci.yml`. Update all three deliberately when the snapshot changes.
- `bun run validate` checks schemas, counts, provenance, licenses, and the snapshot hash. The hash covers the catalog, full pack files, reference bodies, and pins; validation passing therefore proves those served artifacts match.
- Adding or updating an upstream source requires its license under `content/sources/licenses/` plus `NOTICE` and `ATTRIBUTION.md` updates.

## Tests and contracts

- Follow red, green, refactor: add a failing test for the intended contract, implement, then rerun focused and full checks.
- Do not loosen assertions, skip tests, or lower coverage thresholds to make a build pass. If a contract intentionally changes, update the unit/integration test and matching smoke/CI assertions together.
- Existing tests encode exact tool/prompt/resource counts, token budgets, and error behavior. Treat these as product contracts, not incidental snapshots.
- `tests/production/` covers committed content, CLI behavior, and HTTP hardening; `tests/integration/` uses real MCP clients. Both run under `bun run test` with 30s timeouts and a fork pool.
- Coverage thresholds (80% lines/functions/statements, 70% branches) apply only to `bun run test:coverage`.

## Configuration traps

- HTTP is stateless by default: each request gets a fresh server/transport, `GET`/`DELETE` return 405, and the token's scopes apply per request. `--stateful` / `TASTEPRO_HTTP_MODE=stateful` is required for `--sse` and resumability. Do not reintroduce a session map into the stateless path.
- Standalone binaries embed `content/` via `bun build --compile --asset ./content`. The loader checks the bundle root before the package-relative path; the version comes from the `__TASTEPRO_VERSION__` define. `bun run smoke:binary` must run from a temp cwd so it cannot silently read repo content. `dist-bin/` and `*.bun-build` are ignored build artifacts.
- HTTP auth is optional on loopback only: `/mcp` is unauthenticated when no auth is configured and the bind host is loopback. A non-loopback bind fails closed without OAuth (`TASTEPRO_OAUTH_ISSUER` + `TASTEPRO_PUBLIC_URL`) or `TASTEPRO_API_KEY` unless `TASTEPRO_ALLOW_ANONYMOUS=true`; it also requires `TASTEPRO_ALLOWED_HOSTS`. OAuth and a static API key are exclusive; the server refuses to start with both. Empty-string env values are treated as unset.
- OAuth lives only at the HTTP boundary (`src/server/oauth.ts`, `http.ts`): tokens are verified there and requests receive just `{ scopes }`. `src/server/server.ts` gates `taste_audit` on the `tastepro:audit` scope; it never sees tokens. Explicitly anonymous non-loopback binds have the audit runtime stripped in `startHttpServer`, so they never register `taste_audit`. Keycloak tokens carry both `scope` and `scp`; `scopesOf` must merge them.
- `src/core/audit.ts` cites real guideline ids in its `GUIDELINE` map and throws at service construction if the rubric loses one. When a guideline id changes, update the map and `tests/unit/audit.test.ts` together; never cite an id that does not exist. Its concurrency/queue gate bounds both static and browser audits.
- `taste_audit` URL input is off by default and goes through `src/server/audit-fetch.ts`: private/loopback/link-local/CGNAT/multicast addresses are refused, redirects are re-validated, and size/timeout caps apply. The guard is best-effort (no connection-IP pinning); do not present it as a network boundary. Browser mode (`src/server/audit-browser.ts`) renders with JavaScript disabled, blocks service workers, aborts all subresource requests, and enforces hard timeouts; `playwright` is an optional runtime import, and only `Dockerfile.audit` installs it.
- `tastepro://pack/{+id}` and `tastepro://guideline/{+id}` deliberately keep `list: undefined`. Enumerating every pack costs roughly 77k tokens in `resources/list`; discovery belongs in `taste_search` and URI completion.
- `src/core/budget.ts` preserves identity, provenance, source URLs, and guideline ids exactly or omits them whole. Never reintroduce partial commits, URLs, or guideline ids to make a budget fit.
- Biome ignores `content/generated` and `content/sources/licenses`; a clean lint result says nothing about those files.
- Token budgets and retrieval semantics live in `src/core/budget.ts`, `search.ts`, `get.ts`, and `guidelines.ts`. Changing them changes agent-visible behavior and budgets.

## Read first

- `docs/architecture.md` for runtime and request lifecycle.
- `docs/content.md` for the content model, provenance, and authoring rules.
- `docs/release.md` for tagging, GHCR/binary publishing, and verification.
- `README.md` for scope, commands, and environment variables.
- `SECURITY.md` for the documented security posture.
