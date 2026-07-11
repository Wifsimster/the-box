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
| `geo_list_games` | `GET /games` | `limit?` | `geo-agent:read` |
| `geo_list_candidates` | `GET /games/:gameId/candidates` | `gameId`, `limit?` | `geo-agent:read` |
| `geo_list_maps` | `GET /games/:gameId/maps` | `gameId` | `geo-agent:read` |
| `geo_ingest_game` | `POST /games/:gameId/ingest` | `gameId`, `sources?` | `geo-agent:ingest` |
| `geo_propose_pin` | `POST /candidates/:id/pins` | `candidateId`, `x`, `y`, `source`, `rationale`, … | `geo-agent:propose` |
| `geo_enroll_game` | `POST /games` | `gameId?`, `rawgId?` | `geo-agent:curate` |
| `geo_import_captures` | `POST /games/:gameId/captures` | `gameId`, `targetCount?`, `imageUrls?` | `geo-agent:curate` |
| `geo_set_canonical_map` | `POST /games/:gameId/maps/:mapId/select` | `gameId`, `mapId` | `geo-agent:curate` |
| `geo_reject_map` | `POST /games/:gameId/maps/:mapId/reject` | `gameId`, `mapId` | `geo-agent:curate` |
| `geo_promote_candidate` | `POST /candidates/:id/promote` | `candidateId` | `geo-agent:promote` |

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
- `geo_ingest_game` needs `geo-agent:ingest` (per-key daily budget);
  `geo_propose_pin` needs `geo-agent:propose` (per-key hourly budget). Proposed
  pins are downweighted and can never promote ground truth on their own — they
  join consensus as one flagged, human-reviewed voter.
- `geo_enroll_game`, `geo_import_captures`, `geo_set_canonical_map`, and
  `geo_reject_map` need `geo-agent:curate` (each has its own per-key daily
  budget) and are additionally gated by `GEO_AGENT_CURATE_ENABLED` on the
  backend — while off they return `AGENT_CURATE_DISABLED` even for a key that
  holds the scope. This is the content-creation surface: it enrolls new games,
  tops up screenshot candidates, and lets an operator pick the canonical map
  for a game or reject a wrong-game/prop map.
- `geo_promote_candidate` needs `geo-agent:promote` (per-key daily budget) and
  is gated by a third, independent kill switch `GEO_AGENT_PROMOTE_ENABLED` —
  while off it returns `AGENT_PROMOTE_DISABLED` even for a key that holds the
  scope. It **confirms and promotes** a capture's consensus pin to canonical
  ground truth, but only where the crowd already earned it: the agent supplies
  **no coordinates**, and the server promotes only if consensus already
  qualifies (≥5 accepted human pins + a tight cluster — the same auto-promote
  gate). Agent pins are excluded from that human count, so this can never
  fabricate ground truth; it just pulls the trigger on a promotion the crowd
  earned. Returns `CONSENSUS_NOT_READY` (with the current human-pin count and
  confidence) when consensus doesn't yet qualify.
