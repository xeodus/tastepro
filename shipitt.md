# TastePro — production shipping plan

Status: active
Owner: xeodus
Started: 2026-11-26
Baseline: `v1.0.2`, commit `636d6a4`

## Progress

- 2026-11-26: Phases 1–3.5 implemented on `ship/prod-grade` (PR #15): npm
  packaging with provenance, `server.json` + OCI label, current client docs,
  and `tastepro audit <file>`. CI gates green, including a clean-directory npm
  tarball install.
- Blocked on credentials: npm trusted publishing and the registry variables.
- Next: Phase 4, protocol `2026-07-28`; spike result in
  [`docs/protocol-v2.md`](docs/protocol-v2.md).

## North star

A stranger on Claude Code, Codex, OpenCode, Cursor or VS Code installs TastePro
with **one command**, gets a server that speaks the **current protocol era**, and
reaches a useful design verdict in **under five minutes** — with documentation
that is literally true.

## Definition of done

1. `npx -y tastepro info` works from a clean directory on Node 22/24/26.
2. `registry.modelcontextprotocol.io/v0.1/servers?search=tastepro` returns our entry.
3. `server/discover` returns `2026-07-28`; legacy `initialize` still works.
4. Five client recipes tested on real clients, zero V1 config shapes.
5. One public HTTPS endpoint completes an OAuth login and gates `taste_audit`.
6. All existing tests pass, plus new packaging, registry and conformance tests.
7. `bun run validate`, `lint`, `typecheck`, `build`, `smoke:http`, `smoke:binary` green.
8. Every new content source has a license, pin, hash and attribution.

## Evidence snapshot (2026-11-26)

| Area              | Today                                                       | Industry norm                                                 |
| ----------------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| Protocol          | negotiates `2025-11-25`; `server/discover` returns `-32601` | `2026-07-28`, stateless, discover mandatory, dual-era default |
| Local install     | 96.7 MB GitHub Release binary                               | `npx -y <pkg>` is the only launcher every client documents    |
| npm               | no package; `tastepro` name is unclaimed (404)              | package + `mcpName` + provenance                              |
| Official registry | 0 results                                                   | metadata registry feeding Glama/PulseMCP/Zed                  |
| Remote            | code exists, nothing deployed                               | Figma/Cloudflare/Sentry/GitHub/Context7 lead remote           |
| Client docs       | OpenCode V1 shape; Codex/VS Code/Zed absent                 | install matrix, current config keys                           |
| Marketplace       | Glama listing only                                          | official registry → Glama; Anthropic needs remote OAuth       |
| Supply chain      | cosign + SHA256SUMS                                         | npm provenance or signed images                               |

## Principles

1. Distribution before features. No new tool until the install path is one line.
2. One source of truth: `server.json`, `package.json`, docs and CI agree.
3. Dual-era, not era-chasing. Serve `2026-07-28` and `2025-11-25`.
4. Evidence gates. Every phase ends with a command a reviewer can rerun.
5. No unsourced content. MIT/Apache/CC0 only, pinned, attributed.

---

## Phase 0 — baseline

**Goal:** a green tree that can be shipped from.

- Fix the Dependabot dependency PR (#14): `js-yaml 4→5`, `node-html-parser 7→9`,
  `@types/node 24→26`; lint error plus `brand-parser.test.ts:106` quality flip.
- Land action-version PRs (#1–#5).
- Run the full gate and record the numbers.

**Gate:** `bun run typecheck && bun run lint && bun run validate && bun run test`
green; no red PRs.

**Rollback:** none needed; dependency changes are isolated in a branch.

## Phase 1 — npm package

**Goal:** `npx -y tastepro info` from a clean directory.

Files:
- `package.json`: add `mcpName`, `repository`, `publishConfig`
  (`access: public`, `provenance: true`); trim `files` to runtime assets.
- `.github/workflows/release.yml`: add `publish-npm` job on tag, Node 24,
  `npm publish --provenance --access public`, trusted publishing.
- `tests/production/package.test.ts`: assert `bin`, `mcpName`, `repository`,
  `files`, no install scripts, version parity with `server.json`.

Rules:
- No `postinstall`; npm 12 blocks install scripts by default.
- `bin` stays `./dist/cli.js`; shebang already present.
- Version `1.1.0` for packaging + registry + protocol changes.

**Gate:** `npm pack --dry-run` shows only runtime files; clean-dir
`npx -y tastepro info` prints 1007 entries; `npm audit signatures` verifies.

**Rollback:** unpublish is not possible after 72h; publish a patch instead.

## Phase 2 — official registry and listings

**Goal:** a canonical registry entry that aggregators can ingest.

Files:
- `Dockerfile`: `LABEL io.modelcontextprotocol.server.name="io.github.xeodus/tastepro"`.
- `server.json`: schema `2025-12-11`, name, description ≤100 chars, version,
  `packages[]` for npm and oci.
- `.github/workflows/release.yml`: `mcp-publisher validate` + publish via
  `github-oidc` after artifacts exist.
- `tests/production/registry.test.ts`: validate shape, version parity, OCI
  identifier, description length.

**Gate:** `mcp-publisher validate` passes; registry API returns the entry;
`docker inspect` shows the label.

**Rollback:** `mcp-publisher status --status deleted`; version is immutable.

## Phase 3 — client truth

**Goal:** every recipe is current and tested.

Files:
- `docs/install.md`: one section per client, exact commands only.
- `docs/clients.md`: rewritten to point at `install.md`; delete V1 shapes.
- `README.md`: quick start becomes `npx -y tastepro`; remove "when published".
- `tests/production/docs.test.ts`: assert no `"enabled": true` OpenCode example,
  no `mcp.<name>` shape, and that every documented command references
  `npx -y tastepro` or a URL.

Matrix:
- Claude Code: `claude mcp add tastepro -- npx -y tastepro --stdio`
- Codex: `codex mcp add tastepro -- npx -y tastepro --stdio`
- OpenCode V2: `opencode mcp add tastepro -- npx -y tastepro --stdio`;
  JSON uses `mcp.servers` and `disabled`.
- Cursor: `~/.cursor/mcp.json`.
- VS Code: `code --add-mcp`.
- Zed: `context_servers`.
- Claude Desktop: JSON now, MCPB in Phase 7.

**Gate:** each recipe executed on the real client; logs committed as evidence.

## Phase 3.5 — first-run verdict

**Goal:** a 60-second experience on the user's own code.

Command:
```bash
npx -y tastepro audit ./index.html --fail-on error
```

Flags: `--json`, `--fail-on error|warn|none`, `--target`, `--max-tokens`.
Reads one local file, caps at 1 MB, never fetches, never stores.
Exit code 1 when findings meet the threshold.

Files:
- `src/cli.ts`: `audit` command.
- `tests/production/cli.test.ts`: pass/fail/JSON/missing-file/directory cases.
- `docs/install.md`: "First 60 seconds".

**Gate:** auditing a fixture with a missing `alt` exits 1; a clean fixture exits 0;
`--json` is stable and documented.

## Phase 4 — protocol 2026-07-28

**Goal:** current era without breaking legacy clients.

Dependency: `@modelcontextprotocol/server` 2.4.0 (stable, implements
`2026-07-28`), `@modelcontextprotocol/server-legacy` for old clients, and the
official codemod `@modelcontextprotocol/codemod`. Spike result and exact steps:
[`docs/protocol-v2.md`](docs/protocol-v2.md).

Steps:
1. Spike on a branch: install v2, run the codemod, port one tool, measure.
2. Migrate `src/server/server.ts` (4 tools, 2 prompts, 6 resources).
3. Implement `server/discover`: `supportedVersions`, `serverInfo`,
   `instructions`, `ttlMs`, `cacheScope`.
4. Adopt `resultType`, modern error codes (`-32022`), per-request `_meta`.
5. Keep legacy `initialize` via the legacy shim.
6. Add conformance tests: discover, legacy initialize, unsupported version,
   cache fields, stateless HTTP, OAuth scope challenge.

**Gate:** all old tests plus conformance tests green; Claude Code v2 negotiates
modern; OpenCode `protocol: auto` works; no client regression.

**Rollback:** keep v1 on `release/1.1.x`; ship v2 as 2.0.0 only if the tool
surface changes, otherwise 1.2.0.

## Phase 5 — remote product

**Goal:** the only channel that sells teams.

- Deploy one endpoint with TLS, `TASTEPRO_ALLOWED_HOSTS`, stateless HTTP.
- OAuth via a managed IdP with CIMD (preferred), DCR fallback, pre-registered
  escape hatch; add `scope` to the `WWW-Authenticate` challenge.
- Edge rate limits; metrics/alerts on 401/403/429/5xx, p95, audit busy.
- Publish `docs/privacy.md` and `docs/terms.md`.
- Submit to Anthropic's Connectors Directory after this phase.
- PR to Docker's MCP catalog; claim Glama; publish to the official registry.

**Gate:** OpenCode and Claude Code complete a real OAuth login; audit requires
`tastepro:audit`; anonymous endpoint exposes no audit.

## Phase 6 — content

**Goal:** opinion plus domain depth, not a link dump.

Cap: +200–250 packs. Every pack: source, repo, commit, path, license, authors,
transformations.

### Wave plan (current)

- **1.2.0 — public sector (done):** GOV.UK, USWDS, CMS, NHS.UK.
- **1.3.0 — enterprise and regulated domains:** Carbon, Spectrum, SAP Fiori,
  PatternFly, Ant Design, Primer, **ethereum.org, RainbowKit / ENS / EIPs /
  CAIPs, BigDesign, PIE, Skyscanner Backpack**.
- **1.4.0 — remaining domain sources:** Open edX Paragon, Guardian Source,
  GitHub Communities / opensource.guide / Bluesky / Zulip / Flarum / Matrix,
  Android TV / Video.js / Shaka / Media Chrome.
- **1.5.0 — original playbooks:** the 20 domains with no permissive source,
  plus SVOD and social-feed specifics.

The five moved sources — ethereum.org, RainbowKit / ENS / EIPs / CAIPs,
BigDesign, PIE, and Skyscanner Backpack — are deliberately part of **1.3.0**.
Backpack is archived and must be pinned and marked as a snapshot.

The tier lists below remain the source reference; the wave plan is the release
order.

### Tier 1

| Source                                                 | License    | Extract                                                                                                                                                                     |
| ------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Impeccable (`pbakaus/impeccable`)                      | Apache-2.0 | craft-floor, critique-rubric, audit severity, foundations, operate/persuade, bolder/quieter/distill/typeset/layout/animate/polish. Skip iOS/Android (Apple HIG provenance). |
| UI UX Pro Max (`nextlevelbuilder/ui-ux-pro-max-skill`) | MIT        | products, colors, ux-guidelines, charts, typography metadata, motion, landing, app-interface. Skip fonts/icons/stack code.                                                  |
| GOV.UK Design System (`alphagov/govuk-design-system`)  | MIT        | bank details, payment card details, validation, error summary, addresses, names, dates, check-answers, confirmation, task list, question pages.                             |

### Tier 2

| Source                    | License    | Extract                                                                                             |
| ------------------------- | ---------- | --------------------------------------------------------------------------------------------------- |
| Adobe Spectrum data       | Apache-2.0 | attention hierarchy, color/type/spacing/tokens, component do/don't.                                 |
| Carbon                    | Apache-2.0 | data-viz chart types, anatomy, axes, legends, palettes, dashboards; empty/loading/filtering/status. |
| Anthropic frontend-design | Apache-2.0 | five AI-default clusters, plan/review/build/critique, token template.                               |
| Modern Web Guidance       | Apache-2.0 | visual design, typography, color, dark mode; `expectations.md` as audit criteria.                   |
| USWDS                     | CC0        | design principles, token semantics, form/table guidance.                                            |

### Do not ingest

Figma MCP guide (no license), Material 3 prose (no content license), Superdesign
app (AGPL), Laws of UX (CC BY-NC-ND), Inclusive Components (no license),
Ghostfolio/Maybe/Firefly (AGPL), FT Visual Poster (CC BY-SA — reference only).
No font binaries, icon SVGs, screenshots or logos.

### Product changes

- Add a `data-viz` kind; extend `motion`.
- Map GOV.UK form patterns to `app-pattern`.
- Fill the 25 taxonomy-only domains: fintech, healthcare, b2b-saas, ecommerce.
- Recompute contrast; never trust upstream tokens.
- Update counts in `scripts/lib/validate-content.ts`, `scripts/smoke-http.ts`,
  `.github/workflows/ci.yml`; regenerate the hash.

**Gate:** `bun run validate` passes; every pack has provenance; no third-party
logos or screenshots.

## Phase 7 — desktop

- `manifest.json` with `server.type: "binary"`, per-platform binaries,
  `platform_overrides`.
- `mcpb validate` → `mcpb pack` → attach `.mcpb` to the release.
- Add `registryType: "mcpb"` + `fileSha256` to `server.json`.

**Gate:** one-click install on macOS; Windows only if a Windows binary exists.

## Phase 8 — launch

- Five real users, watched not explained; fix the first three frictions.
- Demo: fintech dashboard → audit → fix; one page, one recording.
- Anthropic directory after Phase 5; Docker catalog after Phase 2.
- Publish a changelog post with the registry and npm links.

**Gate:** five completed sessions; three frictions fixed; one public write-up.

---

## CI/CD changes

- `ci.yml`: add `npm pack --dry-run` + package metadata test; add
  `server.json` validation; keep exact count assertions.
- `release.yml`: build binaries → build/push images → sign → GitHub release →
  npm publish → registry publish. Registry publish depends on npm + OCI.
- Add `mcp-publisher` tarball verification with cosign before running.

## Risk register

| Risk                                       | Mitigation                                           |
| ------------------------------------------ | ---------------------------------------------------- |
| v2 SDK migration breaks transport/OAuth    | Spike + codemod + `server-legacy`; keep v1 branch    |
| npm name squatted                          | Publish 1.1.0 immediately                            |
| Registry preview resets                    | `server.json` in repo; CI republish is idempotent    |
| IdP lacks CIMD/DCR                         | Pre-registered client + documented `oauth.client_id` |
| Anthropic directory rejects non-API server | Launch without it; Glama + registry + Docker suffice |
| Content license contamination              | MIT/Apache/CC0 only; legal read before ingest        |
| Docs drift                                 | CI checks version parity and forbidden V1 shapes     |

## Decision log

- 2026-11-26: npm is the primary local install; the binary stays as a fallback.
- 2026-11-26: official registry first via OCI (already published) then npm.
- 2026-11-26: MCPB is a Claude Desktop convenience, not a distribution strategy.
- 2026-11-26: determinism is framed as reproducibility, not "no LLM".
- 2026-11-26: CI gate is the retention mechanism; the 60-second audit is the hook.

## Non-goals

- No hosted control plane, accounts, or billing in this cycle.
- No npm publishing to GitHub Packages.
- No Windows binary until a real user asks.
- No LLM calls at runtime.
