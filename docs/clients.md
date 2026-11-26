# Client setup

TastePro runs over stdio for local clients and Streamable HTTP for hosted
clients. Start with [install.md](install.md) for the one-line install; this page
has the full configuration for each client.

The npm package runs on Node.js 22 or newer. The standalone binary needs no
runtime.

## Claude Desktop

Edit the config file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "tastepro": {
      "command": "npx",
      "args": ["-y", "tastepro", "--stdio"]
    }
  }
}
```

Restart Claude Desktop. Four tools should appear: `taste_search`, `taste_get`,
`taste_guidelines`, and `taste_audit`.

## Claude Code

```bash
claude mcp add tastepro -- npx -y tastepro --stdio
```

Remote Streamable HTTP with a static bearer key:

```bash
claude mcp add --transport http tastepro https://mcp.example.com/mcp \
  --header "Authorization: Bearer $TASTEPRO_API_KEY"
```

For an OAuth deployment, omit the header and authenticate from `/mcp` (or
`claude mcp login tastepro`). The server advertises
`/.well-known/oauth-protected-resource`; `taste_audit` requires the
`tastepro:audit` scope.

## Codex

```bash
codex mcp add tastepro -- npx -y tastepro --stdio
```

The shared config (`~/.codex/config.toml`, or `.codex/config.toml` in a trusted
project) is:

```toml
[mcp_servers.tastepro]
command = "npx"
args = ["-y", "tastepro", "--stdio"]
```

Remote with a bearer token:

```toml
[mcp_servers.tastepro]
url = "https://mcp.example.com/mcp"
bearer_token_env_var = "TASTEPRO_API_KEY"
```

For OAuth, omit `bearer_token_env_var` and run `codex mcp login tastepro`.

## OpenCode

OpenCode V2 puts servers under `mcp.servers` and uses `disabled`, not `enabled`.
The CLI writes the correct shape:

```bash
opencode mcp add tastepro -- npx -y tastepro --stdio
```

Equivalent `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "tastepro": {
        "type": "local",
        "command": ["npx", "-y", "tastepro", "--stdio"],
        "disabled": false
      }
    }
  }
}
```

Remote with a static key:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "tastepro": {
        "type": "remote",
        "url": "https://mcp.example.com/mcp",
        "oauth": false,
        "headers": {
          "Authorization": "Bearer {env:TASTEPRO_API_KEY}"
        }
      }
    }
  }
}
```

For OAuth, omit `oauth: false` and run `opencode mcp auth tastepro`.

## Cursor

Create `.cursor/mcp.json` in the project, or edit the global Cursor config:

```json
{
  "mcpServers": {
    "tastepro": {
      "command": "npx",
      "args": ["-y", "tastepro", "--stdio"]
    }
  }
}
```

## VS Code

```bash
code --add-mcp '{"name":"tastepro","type":"stdio","command":"npx","args":["-y","tastepro","--stdio"]}'
```

VS Code's current MCP config uses `mcpServers`. The older editor-managed
`.vscode/mcp.json` format uses `servers` and is being retired; prefer the
command above.

## Zed

```json
{
  "context_servers": {
    "tastepro": {
      "command": "npx",
      "args": ["-y", "tastepro", "--stdio"]
    }
  }
}
```

## ChatGPT (hosted)

ChatGPT web connectors require a public HTTPS endpoint; localhost is not enough.
Deploy the HTTP transport first (see [deployment.md](deployment.md)), then add a
connector with the URL `https://your-host.example/mcp`.

ChatGPT does not send static bearer tokens. Use an OAuth deployment backed by an
IdP that supports CIMD or dynamic client registration, or an intentionally
anonymous read-only endpoint. Anonymous endpoints never expose `taste_audit`.

## Generic Streamable HTTP client

```bash
curl -s http://127.0.0.1:3000/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-11-25",
      "capabilities": {},
      "clientInfo": { "name": "curl", "version": "0" }
    }
  }'
```

HTTP is stateless by default: the server does not issue `Mcp-Session-Id`, so any
replica can serve any request. Add `Authorization: Bearer <token>` when the
endpoint requires auth.

Use `GET /healthz` for liveness and `GET /readyz` for readiness. Both are
anonymous.

## Client checklist

- The client launches `npx -y tastepro --stdio` (or a binary path) with
  `--stdio`.
- `npx -y tastepro info` prints 947 catalog entries.
- For HTTP, the URL ends in `/mcp`, not `/`.
- For HTTP with auth, every `/mcp` request carries the `Authorization` header.
- The client tolerates a stateless server with no session id.
- The client shows four tools; `taste_audit` is absent on explicitly anonymous
  hosted endpoints and requires `tastepro:audit` under OAuth.

If a tool call fails, run `npx -y tastepro info` and check `/healthz` first.
Content and setup errors are almost always visible there.
