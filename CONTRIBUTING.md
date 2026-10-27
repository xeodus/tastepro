# Contributing

Thanks for helping improve TastePro. The project is an open-core MCP server for
design taste and frontend references. Contributions are welcome across code,
content, tests, docs, and deployment.

## Before you start

- Read [README.md](README.md), [docs/architecture.md](docs/architecture.md), and
  [docs/content.md](docs/content.md).
- Check existing issues and pull requests to avoid duplicate work.
- For a large change, open an issue first so the design can be discussed.
- Be precise about provenance. Content licensing is a hard requirement, not a
  cleanup task.

## Development setup

Requirements: Node.js 22 or newer and npm.

```bash
git clone <repository>
cd tastepro
npm ci
npm run build
node dist/cli.js info
npm test
```

The content is committed, so you do not need network access to run the server or
the tests. Ingest needs network access unless the cache is populated.

Useful commands:

```bash
npm run dev              # stdio via tsx
npm run dev:http         # HTTP via tsx
npm run typecheck        # TypeScript strict check
npm run lint             # Biome check
npm run lint:fix         # Biome check with safe fixes
npm run format           # Biome format
npm test                 # all tests
npm run test:watch       # watch mode
npm run test:integration # real stdio/HTTP MCP clients
npm run validate         # content/provenance/hash validation
npm run build            # compile to dist/
npm run smoke:http       # real HTTP MCP smoke test with auth
```

## Test-driven development

The project expects tests for behavior changes. The tiers are:

- `tests/unit/` — parsers, schemas, budgets, search/get/guidelines, loader.
- `tests/integration/` — real MCP clients over stdio and HTTP.
- `tests/production/` — committed content, CLI lifecycle, HTTP hardening.

For a bug fix:

1. Add a failing test that reproduces the bug.
2. Fix the smallest responsible layer.
3. Run the focused test, then the full suite.
4. If the bug is content-related, add a validation or content invariant test.

For a new tool or response field:

1. Add unit tests for the service.
2. Add an integration test that exercises the real MCP tool.
3. Update the server instructions and docs.
4. Consider the token budget and truncation behavior.

For a new content kind:

1. Add the Zod schema and `KIND_FILE_NAMES`/`KIND_PRIORITY` entries.
2. Add the loader/get/search projections.
3. Add ingest and validation.
4. Add fixtures and tests.
5. Update the docs and attribution if the source is upstream.

## Code style

- TypeScript strict, ESM, NodeNext.
- 2-space indentation, double quotes, trailing commas, 100-column lines.
- Prefer small pure functions and explicit types at module boundaries.
- Keep the server deterministic. Do not add request-time network calls, LLM
  calls, or randomness to ranking.
- Keep stdout clean for stdio JSON-RPC. Log to stderr through
  `src/server/logger.ts`.
- Validate external input with Zod at the boundary.
- Do not use `any` in new code. Existing `any` in Hono handlers is a pragmatic
  exception; prefer typed helpers when touching it.
- Add comments only where the reason is not obvious from the code. Explain
  tradeoffs, not mechanics.

Run `npm run lint` and `npm run typecheck` before committing. Biome warnings are
allowed to exist, but do not add new ones.

## Content contributions

Read [docs/content.md](docs/content.md) first. In short:

- Authored content lives in `content/taxonomy/`, `content/domains/`, and
  `content/references/`.
- Generated content lives in `content/generated/` and is produced by
  `npm run ingest`. Do not hand-edit it.
- Every pack needs provenance.
- Do not add third-party screenshots, logos, fonts, or copied prose.
- Brand packs are analyses, not clones.
- Recommended direction/palette/section ids must exist.
- Incomplete packs must explain what is missing; do not invent tokens.

If you change an upstream pin:

```bash
npm run sources:update -- --write
npm run ingest -- --refresh
npm run validate
npm test
npm run build
```

Review the generated diff carefully. A pin update can change many packs and the
content hash. Do not mix a pin update with unrelated code changes.

If you add a domain playbook:

1. Add the domain to `content/taxonomy/domains.json` (or use an existing one).
2. Add the playbook to `content/domains/seed.json`.
3. Set `launchTier` only when the playbook is complete.
4. Run ingest and validation.
5. Add a test if the domain is used in search examples.

## Documentation

- Update `README.md` for user-visible behavior.
- Update `docs/clients.md` for client setup changes.
- Update `docs/deployment.md` for transport, auth, or container changes.
- Update `docs/architecture.md` for structural changes.
- Update `docs/content.md` for content-model changes.
- Update `ATTRIBUTION.md` and `NOTICE` for new upstream sources.
- Keep examples runnable and paths relative to the repository.

## Commits and pull requests

- Use a clear, imperative commit subject, e.g. `Fix reference body budget`.
- Keep commits focused. Separate generated content changes from code changes
  when practical.
- Explain the why in the commit body if it is not obvious.
- Link the issue in the pull request.
- Include test evidence: commands run and results.
- Note any content hash change and why it changed.
- Call out breaking changes, new env vars, and new tools.

### Pull request checklist

- [ ] The change is focused and described.
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes (no new warnings).
- [ ] `npm run validate` passes.
- [ ] `npm test` passes.
- [ ] `npm run build` passes.
- [ ] `npm run smoke:http` passes for transport/auth changes.
- [ ] New behavior has unit/integration coverage.
- [ ] Docs and server instructions are updated.
- [ ] Provenance and licensing are correct.
- [ ] No secrets, tokens, personal data, logos, or third-party screenshots.
- [ ] Generated content was produced by ingest, not hand-edited.

## Licensing of contributions

By contributing, you agree that your code and original content are licensed
under the Apache License 2.0, and that upstream-derived content remains under its
source license. Do not contribute content you cannot license.

If you add a new upstream source:

1. Add it to `sources.lock.json` with a pinned commit and license.
2. Add the full license text under `content/sources/licenses/`.
3. Update `NOTICE` and `ATTRIBUTION.md`.
4. Add provenance to every derived pack.
5. Add validation for the new source id and license.

## Security

Do not open a public issue for an unfixed vulnerability. See
[SECURITY.md](SECURITY.md).

## Code of conduct

Be direct, be kind, and assume good faith. Critique the work, not the person.
Harassment, discrimination, and deliberate licensing violations are not
welcome.

## Questions

Open a discussion or an issue with the `question` label. For client setup, include
the client name and version, the transport, the command or URL, and the exact
error. For content issues, include the pack id and the source.
