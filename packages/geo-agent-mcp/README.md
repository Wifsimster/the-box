# @the-box/geo-agent-mcp

A tiny [MCP](https://modelcontextprotocol.io) stdio server that exposes The Box's
**geo content-sourcing** read tools (issue #331, phase 2) to an MCP-capable
agent such as the Claude Code CLI. Zero runtime dependencies — it speaks
newline-delimited JSON-RPC directly.

It is a thin wrapper: every tool maps 1:1 to a `GET` on the key-authenticated
agent API (`/api/agent/v1/geo`). The MCP layer holds **no logic and no
privileges of its own** — a compromised or hallucinating agent can do nothing
the key can't, and the key is read-only in this phase.

## Tools

| Tool | Maps to | Args | Scope |
|------|---------|------|-------|
| `geo_health` | `GET /health` | — | `geo-agent:read` |
| `geo_games_needing_content` | `GET /games-needing-content` | `limit?` | `geo-agent:read` |
| `geo_list_candidates` | `GET /games/:gameId/candidates` | `gameId`, `limit?` | `geo-agent:read` |
| `geo_ingest_game` | `POST /games/:gameId/ingest` | `gameId`, `sources?` | `geo-agent:ingest` |

## Setup

1. **Mint a key.** Admin → Géo → *Clés agent Géo* → create a key with the
   `geo-agent:read` scope. Copy the plaintext (`tb_pk_live_…`) — shown once.
2. **Enable the surface.** Set `GEO_AGENT_API_ENABLED=true` on the backend and
   redeploy. While off, every tool returns `AGENT_API_DISABLED`.
3. **Build:** `npm run build -w @the-box/geo-agent-mcp`.

## Wire into Claude Code

Add to your MCP config (e.g. `.mcp.json` or the Claude Code settings):

```json
{
  "mcpServers": {
    "the-box-geo": {
      "command": "node",
      "args": ["packages/geo-agent-mcp/dist/index.js"],
      "env": {
        "THE_BOX_AGENT_KEY": "tb_pk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        "THE_BOX_API_URL": "https://the-box.battistella.ovh"
      }
    }
  }
}
```

`THE_BOX_API_URL` defaults to `http://localhost:3000` for local dev.

## Env

| Var | Required | Default | Purpose |
|-----|----------|---------|---------|
| `THE_BOX_AGENT_KEY` | yes | — | geo-agent API key (bearer) |
| `THE_BOX_API_URL` | no | `http://localhost:3000` | backend base URL |

## Notes

- stdout is the JSON-RPC channel; all diagnostics go to stderr.
- The server echoes the client's requested MCP `protocolVersion`.
- `geo_ingest_game` needs a key with the `geo-agent:ingest` scope and is bounded
  by a per-key daily budget. Pin-proposal (`geo-agent:propose`) tools land in
  phase 4.
