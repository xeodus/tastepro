# Client setup

TastePro works over stdio for local clients and Streamable HTTP for hosted
clients. Use one server, one content catalog, and whichever transport the client
supports.

Build first:

```bash
bun ci
bun run build
```

Then use the absolute path to `dist/cli.js` in the examples below. Replace
`/absolute/path/to/tastepro` with the real path. If you ran `bun link`, you can
use `tastepro` instead of `node .../dist/cli.js`.

## Claude Desktop (stdio)

Edit the Claude Desktop config file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "tastepro": {
      "command": "node",
      "args": ["/absolute/path/to/tastepro/dist/cli.js", "--stdio"]
    }
  }
}
```

Restart Claude Desktop. The four tools should appear in the tools menu.

If you have published or linked the package, the shorter form is:

```json
{
  "mcpServers": {
    "tastepro": {
      "command": "bunx",
      "args": ["tastepro", "--stdio"]
    }
  }
}
```

## Claude Code (stdio or HTTP)

Local stdio:

```bash
claude mcp add tastepro -- node /absolute/path/to/tastepro/dist/cli.js --stdio
```

Remote Streamable HTTP with a bearer token:

```bash
claude mcp add --transport http tastepro https://mcp.example.com/mcp \
  --header "Authorization: Bearer $TASTEPRO_API_KEY"
```

If the hosted endpoint is intentionally anonymous read-only, omit the header.

## OpenCode (stdio or HTTP)

Add TastePro to `opencode.json` in your project or global config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "tastepro": {
      "type": "local",
      "command": ["node", "/absolute/path/to/tastepro/dist/cli.js", "--stdio"],
      "enabled": true
    }
  }
}
```

Remote:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "tastepro": {
      "type": "remote",
      "url": "https://mcp.example.com/mcp",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer {env:TASTEPRO_API_KEY}"
      }
    }
  }
}
```

OpenCode expands `{env:TASTEPRO_API_KEY}` from the environment. Keep the token
out of committed config files.

For an OAuth deployment, the same `type: "remote"` config works: the server
advertises `/.well-known/oauth-protected-resource`, and clients that speak the
MCP OAuth flow discover it from the endpoint. If your client build cannot
complete the flow, either deploy with a static key instead or supply a valid
access token (with the `tastepro:audit` scope if you want audit access) in the
`Authorization` header.

HTTP is stateless by default, so the server does not issue `Mcp-Session-Id` and
any replica can serve any request. Clients must tolerate a server that does not
return a session id; the SDK client does. Only opt into `--stateful` if you need
SSE or resumability, and then use sticky routing when running more than one
replica.

## Cursor (stdio)

Create `.cursor/mcp.json` in the project, or edit the global Cursor MCP config:

```json
{
  "mcpServers": {
    "tastepro": {
      "command": "node",
      "args": ["/absolute/path/to/tastepro/dist/cli.js", "--stdio"]
    }
  }
}
```

## ChatGPT (hosted HTTP)

ChatGPT custom connectors require a remotely reachable HTTPS MCP endpoint. A
localhost server is not enough; deploy the HTTP transport first. See
[deployment.md](deployment.md).

1. Deploy TastePro with the HTTP transport and a public HTTPS URL.
2. In ChatGPT, open **Settings → Connectors** and enable developer mode if your
   plan exposes it. The exact labels vary by plan and rollout.
3. Create a connector with the MCP URL `https://your-host.example/mcp`.
4. For anonymous read-only use, choose no authentication against an intentionally
   anonymous read-only endpoint.
5. Start a conversation and ask for a design brief or an audit plan.

ChatGPT custom connectors are happiest with OAuth. TastePro now validates
OAuth access tokens as a resource server against your own IdP, but it is not an
authorization server and does not issue tokens or implement dynamic client
registration itself. Options: point the connector at an OAuth deployment backed
by your IdP, or use an intentionally anonymous read-only endpoint (which never
exposes `taste_audit`). Do not point ChatGPT at a bearer-only endpoint that
requires a static token it cannot send.

## Generic Streamable HTTP client

Initialize a session:

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

The response includes an `Mcp-Session-Id` header. Send that header on subsequent
requests. With `TASTEPRO_API_KEY` set, add:

```http
Authorization: Bearer <token>
```

Use `GET /healthz` for liveness and `GET /readyz` for readiness. Both are
anonymous.

## Client checklist

- The client is using the transport you deployed: stdio for a local process,
  HTTP for a URL.
- `node --version` is 22 or newer.
- The content directory is present. `node dist/cli.js info` should print 873
  catalog entries.
- For HTTP, the URL ends in `/mcp`, not `/`.
- For HTTP with auth, the `Authorization` header is present on every `/mcp`
  request.
- The client tolerates a server that does not issue `Mcp-Session-Id` (the
  stateless default). If you run stateful mode, the load balancer routes the
  session id consistently.
- For hosted clients, the endpoint is HTTPS and reachable from the public
  internet.
- The client shows four tools: `taste_search`, `taste_get`, `taste_guidelines`,
  and `taste_audit` (`taste_audit` is absent on explicitly anonymous hosted
  endpoints and needs the `tastepro:audit` scope under OAuth).

If a tool call fails, run `node dist/cli.js info` and check `/healthz` first.
Content and setup errors are almost always visible there.
