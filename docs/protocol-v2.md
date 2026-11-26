# Protocol 2026-07-28 migration

Status: planned, not started
Current: `@modelcontextprotocol/sdk` 1.32.2, negotiates `2025-11-25`
Target: `@modelcontextprotocol/server` 2.4.0, serves `2026-07-28` and `2025-11-25`

## Why

The `2026-07-28` revision makes the protocol stateless: `initialize` and
`Mcp-Session-Id` are gone, every request carries its own `_meta`, and
`server/discover` is mandatory. Claude Code's v2 runtime asks servers whether
they support the new revision; OpenCode's `protocol: auto` probes
`server/discover` and falls back. TastePro currently answers `-32601`.

This is not a client-breaking bug today — every current client falls back to
`2025-11-25` — but it is the difference between "legacy-only" and
"production-grade 2026".

## Spike result (2026-11-26)

The official codemod was run with `--dry-run` against this repository:

```bash
npx -y @modelcontextprotocol/codemod@latest v1-to-v2 . --dry-run
```

Result: **34 changes across 14 files**, no action-required markers.

- `package.json`: removes `@modelcontextprotocol/sdk`, adds
  `@modelcontextprotocol/client` and `@modelcontextprotocol/server`.
- `src/server/server.ts`: 8 changes — import paths, `registerTool` shapes,
  `z.object()` wrapping.
- `src/server/http.ts`: 2 changes — transport import path.
- Tests and scripts: import paths only.

The codemod does **not** serve the new revision. That requires moving the entry
points to `serveStdio(() => createServer())` and `createMcpHandler(() => server)`
(or `isLegacyRequest` routing in front of a legacy transport).

## Plan

1. **Branch and codemod.** Run the codemod without `--dry-run`, then
   `bun install`, `bun run typecheck`, `bun run test`. Fix the manual items the
   guide lists: `ctx` instead of `extra`, `setRequestHandler` method strings,
   `ProtocolError` codes, `StandardSchema` shapes.
2. **stdio.** Replace `server.connect(new StdioServerTransport())` with
   `serveStdio(() => createTasteProServer(...))`. This gives modern clients
   `server/discover` and legacy clients `initialize`.
3. **HTTP.** Keep the existing Hono app for health, auth, CORS, and host
   checks. Mount `createMcpHandler(() => server)` at `/mcp`, passing
   `authInfo` and `parsedBody`. Keep the legacy session path behind
   `isLegacyRequest` only if a real client needs it; the stateless default
   should not allocate sessions.
4. **OAuth.** `handler.fetch(request, { authInfo })`; handlers read
   `ctx.http?.authInfo`. Add `scope` to the `WWW-Authenticate` challenge.
5. **Discover.** Return `supportedVersions: ["2026-07-28", "2025-11-25"]`,
   `serverInfo`, `instructions`, `ttlMs`, `cacheScope: "public"`.
6. **Tests.** Add conformance cases: discover on stdio and HTTP; legacy
   initialize; unsupported version returns `-32022`; cache fields present;
   stateless request with no session id; OAuth scope challenge.
7. **Version.** Tool surface is unchanged; ship as `1.2.0` if the transport
   contract is backward compatible, `2.0.0` if any client-visible behavior
   changes.

## Dependencies

- `@modelcontextprotocol/server` 2.4.0
- `@modelcontextprotocol/hono` 2.4.0 (or `@modelcontextprotocol/node` if the
  custom Hono wiring is kept)
- `@modelcontextprotocol/core` 2.4.0 for raw schema constants
- `@modelcontextprotocol/server-legacy` only if a legacy session path is kept

## Risks

| Risk                                         | Mitigation                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| v2 adapter changes auth plumbing             | Pass `authInfo` explicitly; keep token verification in `oauth.ts`           |
| Stateless HTTP loses the session TTL tests   | Rewrite tests around per-request behavior; keep stateful mode behind a flag |
| `zod` v3 range installs but fails at runtime | The repo already uses `zod ^4.6.7`; verify the declared range               |
| Codemod touches tests/scripts                | Review the full diff; the dry run is import-only outside `src/`             |
| Registry/image consumers see a version bump  | Publish `1.2.0` only after conformance tests pass                           |

## Definition of done

- `initialize` with `2026-07-28` returns `2026-07-28`, not `2025-11-25`.
- `server/discover` returns both versions and cache fields.
- Claude Code v2 negotiates modern; OpenCode `protocol: auto` works.
- A legacy client still connects with `initialize`.
- `bun run test`, `smoke:http`, and `smoke:oauth:local` pass.
