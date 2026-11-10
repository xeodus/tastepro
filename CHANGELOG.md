# Changelog

All notable changes are recorded here. The project follows semantic versioning
for the MCP tool surface, configuration, and package API. Content counts may
change between minor releases without breaking the tool contract.

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
