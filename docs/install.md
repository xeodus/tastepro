# Install TastePro

TastePro is a local stdio server. It needs no account, no API key, and no
network access at runtime. Node.js 22 or newer is required for the npm package;
the standalone binary needs no runtime at all.

## One line per client

| Client         | Command                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| Claude Code    | `claude mcp add tastepro -- npx -y tastepro --stdio`                                                     |
| Codex          | `codex mcp add tastepro -- npx -y tastepro --stdio`                                                      |
| OpenCode       | `opencode mcp add tastepro -- npx -y tastepro --stdio`                                                   |
| Cursor         | Add the JSON from [clients.md](clients.md#cursor)                                                        |
| VS Code        | `code --add-mcp '{"name":"tastepro","type":"stdio","command":"npx","args":["-y","tastepro","--stdio"]}'` |
| Zed            | Add the JSON from [clients.md](clients.md#zed)                                                           |
| Claude Desktop | Add the JSON from [clients.md](clients.md#claude-desktop)                                                |

Bun users can replace `npx -y` with `bunx`.

## Verify in ten seconds

```bash
npx -y tastepro info
```

Expected: the current version, `Catalog entries: 881`, and a 64-character
content hash. If that works, the package and its embedded content are intact.

## First 60 seconds

Audit a file you already have:

```bash
npx -y tastepro audit ./index.html --fail-on error
```

Each finding cites a rule id, the evidence, and a fix. `--json` prints the same
report for CI. Exit code is `1` when the threshold is met.

Then, in your agent:

```text
Find a fintech dashboard direction, palette, and hero blueprint.
```

```text
Get domain/fintech-payments and direction/quiet-instrument in brief format.
```

```text
Audit this HTML against the rubric: <html>...</html>
```

## Standalone binary (no Node)

Pick the asset for your platform from
[the latest release](https://github.com/xeodus/tastepro/releases/latest):

```bash
curl -fsSLO https://github.com/xeodus/tastepro/releases/latest/download/tastepro-darwin-arm64
curl -fsSLO https://github.com/xeodus/tastepro/releases/latest/download/SHA256SUMS
shasum -a 256 -c SHA256SUMS --ignore-missing
chmod +x tastepro-darwin-arm64
sudo mv tastepro-darwin-arm64 /usr/local/bin/tastepro
tastepro info
```

Assets: `tastepro-darwin-arm64`, `tastepro-darwin-x64`, `tastepro-linux-arm64`,
`tastepro-linux-x64`.

The binary is not notarized. A download made through a browser carries macOS's
quarantine flag and Gatekeeper will refuse it; `curl` does not. If needed:

```bash
xattr -d com.apple.quarantine /usr/local/bin/tastepro
```

## Team server (HTTP)

For a shared endpoint with OAuth or a static bearer key, see
[deployment.md](deployment.md). The endpoint is `https://your-host/mcp`;
`/healthz` and `/readyz` are anonymous.

## Troubleshooting

| Symptom                       | Check                                                                    |
| ----------------------------- | ------------------------------------------------------------------------ |
| `npx` cannot find the package | `npm view tastepro version`; Node 22+                                    |
| Client shows no tools         | The command must include `--stdio`                                       |
| `taste_audit` is missing      | Anonymous hosted endpoints never expose it; OAuth needs `tastepro:audit` |
| Content looks stale           | `npx -y tastepro info` and compare the content hash                      |
| HTTP client fails             | The URL must end in `/mcp`, not `/`                                      |
