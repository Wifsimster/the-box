# Geo Agent API — content sourcing (issue #331)

Key-authenticated, read-only HTTP surface that lets an AI agent (Claude Code /
an MCP client) safely *drive* geo content sourcing against prod. This is the
phase-2 deliverable of the [agent-assisted geo sourcing plan](../tasks/prd-geo-agent-sourcing.html):
it proves the auth / audit / rate-limit surface with **zero write risk** before
ingest (phase 3) and pin proposals (phase 4) land.

> Design principle: the agent *proposes*, consensus + admins *dispose*. This
> read surface exposes only diagnostics and catalog data — no writes, no user
> PII, no raw SQL. See `docs/geo-mode.md` for the consensus gate it feeds.

Base URL: `https://the-box.battistella.ovh/api/agent/v1/geo` (prod) ·
`http://localhost:3000/api/agent/v1/geo` (dev).

All responses use the envelope `{ success: boolean, data?, error? }`.

## Kill switch

The whole surface is gated by `GEO_AGENT_API_ENABLED` (default `false`). While
off, every route returns `503 AGENT_API_DISABLED` — flip the env and redeploy
to disable instantly, alongside per-key revocation.

## Authentication

Bearer API keys, minted by an **admin only** (Admin → Géo → *Clés agent Géo*,
or `POST /api/admin/agent-keys`). Keys carry only `geo-agent:*` scopes and are
mutually exclusive with the streamer-kit scopes — a streamer key is rejected
here with `INSUFFICIENT_SCOPE`, and a geo-agent key is rejected on the public
streamer API.

```http
Authorization: Bearer tb_pk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Keys are stored as SHA-256 hashes; the plaintext is shown once at mint. Revoke
via `DELETE /api/admin/agent-keys/:id` (any admin, instant).

### Scopes

| Scope | Grants | Phase |
|-------|--------|-------|
| `geo-agent:read` | `/health`, `/games-needing-content`, `/games/:id/candidates` | 2 |
| `geo-agent:ingest` | trigger the existing ingestion pipeline | 3 |
| `geo-agent:propose` | submit downweighted, flagged consensus pins | 4 |

A freshly minted key defaults to `geo-agent:read`. Ingest/propose are granted
per key as later phases ship.

## Rate limit

Fixed-window, **60 requests / minute per key** (in-memory). On exhaustion:
`429 RATE_LIMITED` with `Retry-After`. Write budgets (daily ingests, hourly pin
proposals) arrive as Redis counters with phases 3–4.

## Endpoints

### `GET /health`

Content-readiness snapshot — the same eligibility the GeoGamers daily worker
gates on. Shared with `GET /api/admin/geogamers/health`.

```json
{
  "success": true,
  "data": {
    "enabled": false,
    "minRequired": 10,
    "cooldownDays": 14,
    "eligibleGames": 9,
    "eligibleScreenshots": 41,
    "gamesOnCooldown": 2,
    "starved": true,
    "todayChallengeExists": false,
    "currentChallengeDate": null,
    "season": { "month": "2026-07", "players": 0 }
  }
}
```

`starved` (`eligibleGames < minRequired`) is the signal an agent acts on.

### `GET /games-needing-content?limit=`

The "one pin away" work queue: games with an active map and captures collecting
pins but no canonical pin yet. Promoting one such capture grows the eligible
pool by one. `limit` 1–100 (default 25). Sorted by proximity to the next
consensus recompute.

```json
{
  "success": true,
  "data": [
    {
      "gameId": 512,
      "gameName": "Hollow Knight",
      "candidateCount": 6,
      "topPinCount": 4,
      "pinsToNextThreshold": 1,
      "bestCandidateId": 8842
    }
  ]
}
```

`topPinCount` counts raw submissions (an upper bound — promotion needs 5
*accepted* pins). `pinsToNextThreshold` is pins until the next consensus
recompute (`[5, 10, 20, 50]`; `0` past the top threshold).

### `GET /games/:gameId/candidates?limit=`

Unpinned/collecting captures for a game plus its active maps (image URL +
dimensions), so a proposer has what it needs to localize a screenshot. Promoted
captures are omitted (they already have ground truth). `limit` 1–100
(default 50).

```json
{
  "success": true,
  "data": {
    "maps": [
      { "id": 77, "gameId": 512, "imageUrl": "https://…", "widthPx": 4096, "heightPx": 4096, "consensusRadius": 0.03 }
    ],
    "candidates": [
      { "id": 8842, "gameId": 512, "geoMapId": 77, "imageUrl": "https://…", "status": "collecting", "pinCount": 4 }
    ]
  }
}
```

Candidate payloads carry pin **counts**, never pin owners — no user identity or
PII crosses this surface.

## Error codes

| Code | HTTP | Meaning |
|------|------|---------|
| `AGENT_API_DISABLED` | 503 | `GEO_AGENT_API_ENABLED` is off |
| `UNAUTHORIZED` | 401 | Missing / malformed / invalid key |
| `INSUFFICIENT_SCOPE` | 403 | Key lacks the required geo-agent scope (or carries a non-agent scope) |
| `RATE_LIMITED` | 429 | Per-minute limit hit; see `Retry-After` |
| `VALIDATION_ERROR` | 400 | Bad `gameId` / `limit` |
| `INTERNAL_ERROR` | 500 | Server error |

## Audit

Admin key mints/revokes are written to `admin_audit_log`
(`agent_key.mint` / `agent_key.revoke`) with the acting admin, label, scopes.
Write endpoints (phases 3–4) will additionally audit each agent action keyed by
`apikey:<id>`.

## MCP wrapper

`@the-box/geo-agent-mcp` (in `packages/geo-agent-mcp/`) exposes these three
reads as MCP tools for Claude Code. See its README for the `mcpServers` config.
