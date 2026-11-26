# Changelog

All notable changes are recorded here. The project follows semantic versioning
for the MCP tool surface, configuration, and package API. Content counts may
change between minor releases without breaking the tool contract.

## 1.3.0 - 2026-11-27

### Added

- IBM Carbon: 23 enterprise component, pattern, and data-visualization packs.
- Adobe Spectrum: 14 component and foundation packs from the Spectrum 2 JSON.
- SAP Fiori: 20 components with when-to-use, when-to-avoid, and best practices.
- PatternFly: 7 enterprise patterns and 3 content-design guides.
- Ant Design: 12 B2B design specifications.
- GitHub Primer: 10 UI patterns.
- ethereum.org: 5 Web3 design, transaction, and gas packs.
- PIE: 8 food-delivery and marketplace patterns.
- Catalog grows from 905 to 1007 entries; app patterns from 57 to 159.

### Changed

- A shared HTML-to-text renderer now serves the USWDS, NHS, CMS, Carbon, and
  other adapters.
- `NOTICE` and `ATTRIBUTION.md` record the new Apache-2.0, MIT, and CC BY 4.0
  sources and their asset exclusions.

## 1.2.0 - 2026-11-26

### Added

- GOV.UK form patterns: bank details, payment card details, validation, error
  summary, addresses, names, dates, and check answers.
- USWDS identity patterns: name, address, date of birth, email, phone, Social
  Security Number, keep a record, and establish trust.
- CMS Medicare and Medicaid patterns: alert, table, accordion, pagination,
  tabs, multi-input date field, ZIP codes, and phone numbers.
- NHS.UK healthcare patterns: NHS numbers, check answers, confirmation,
  question pages, start page, multiple tasks, care decisions, and interruption
  pages.
- A `SourceAdapter` interface; new sources are isolated, fixture-tested, and
  carry their own license and provenance.
- Catalog grows from 873 to 905 entries; app patterns from 25 to 57.

### Changed

- `NOTICE` and `ATTRIBUTION.md` now record OGL-3.0 and CC0 sources, including
  the third-party asset exclusions.

## 1.1.0 - 2026-11-26

### Added

- `tastepro audit <file>` audits a local HTML file, prints rule ids, evidence
  and fixes, and can fail a build with `--fail-on error`. `--json` prints the
  same report for CI.
- `server.json` publishes the server to the official MCP Registry through both
  the npm package and the GHCR image.
- npm distribution with provenance. `npx -y tastepro` is now the shortest local
  install; the standalone binaries remain available.
- One-line install recipes for Claude Code, Codex, OpenCode, Cursor, VS Code,
  and Zed.

### Changed

- `docs/clients.md` uses the OpenCode V2 `mcp.servers` shape and the current
  client commands. The retired V1 shape is gone.
- The README quick start is npm-first; development instructions moved below it.

### Fixed

- The Docker image carries the
  `io.modelcontextprotocol.server.name` label required by the MCP Registry.

## 1.0.2 - 2026-11-10

### Fixed

- The Playwright audit image now installs Chromium's OS libraries in the Node
  runtime and publishes `linux/amd64` and `linux/arm64`. v1.0.1's audit image was
  amd64-only and could not launch Chromium from the Node runtime.

## 1.0.1 - 2026-11-10

### Fixed

- The optional Playwright audit image now prepares Chromium in a Bun stage
  instead of trying to install Bun inside the Node runtime. The v1.0.0
  binaries and server image remain valid; this release adds the audit image.

## 1.0.0 - 2026-11-08

### Added

- `taste_audit`: static HTML audit against the pinned web-interface rubric,
  with guideline ids, severity, evidence, fixes, and an explicit
  `notVerified` list.
- SSRF-guarded URL input for `taste_audit`, disabled by default.
- Opt-in browser rendering for `taste_audit`: JavaScript disabled, all
  subresource requests blocked, hard timeouts, and a bounded concurrency gate.
- OAuth resource-server authentication for hosted HTTP: JWKS/OIDC discovery,
  issuer/audience/expiry checks, protected-resource metadata, and the
  `tastepro:audit` scope.
- Stateless Streamable HTTP as the production default, with stateful sessions
  available via `--stateful` / `TASTEPRO_HTTP_MODE=stateful` for SSE and
  resumability.
- Coverage, CodeQL, and Dependabot automation.

### Changed

- A non-loopback HTTP bind fails closed without OAuth or a static API key, and
  always requires an explicit `Host` allowlist.
- Explicitly anonymous non-loopback endpoints no longer expose `taste_audit`.
- `resources/list` returns only the four static resources; pack and guideline
  templates are discovered through `taste_search` and URI completion.
- Audit responses preserve guideline ids exactly or omit them whole.

### Fixed

- The container image now starts with the documented `TASTEPRO_ALLOWED_HOSTS`
  value instead of exiting at startup.
- Browser audit can no longer fetch external images, stylesheets, fonts, or
  iframes from submitted HTML.
- Identity, provenance, source URLs, and guideline ids are never partially
  truncated to fit a token budget.
