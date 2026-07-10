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
| `geo-agent:ingest` | `POST /games/:id/ingest` — trigger the ingestion pipeline | 3 |
| `geo-agent:propose` | `POST /candidates/:id/pins` — propose a downweighted consensus pin | 4 |

A freshly minted key defaults to `geo-agent:read`. Ingest/propose are granted
per key as later phases ship.

## Rate limit & budgets

Fixed-window, **60 requests / minute per key** (in-memory). On exhaustion:
`429 RATE_LIMITED` with `Retry-After`.

Write endpoints additionally carry a **per-key budget** in Redis (survives
deploys). Ingest: `GEO_AGENT_MAX_INGESTS_PER_DAY` (default 20) per UTC day. Pin
proposals: `GEO_AGENT_MAX_PINS_PER_HOUR` (default 60) per UTC hour. On
exhaustion: `429 BUDGET_EXHAUSTED` with `Retry-After` (seconds to the window
reset). Budgets fail **closed** — if Redis is unreachable the call is rejected,
never silently unlimited.

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

### `POST /games/:gameId/ingest`

Scope: `geo-agent:ingest`. Triggers the existing map-ingestion pipeline for a
game — a pure enqueue that reuses the same workers, tombstones/circuit-breakers,
dedup, and license/attribution capture as the admin "Run now" button. The agent
**proposes sourcing work; it cannot alter ground truth.**

```json
{ "sources": ["fandom", "wand"] }
```

`sources` is optional (omit for all tiers) and restricted to the allowlist
`registry | fandom | strategywiki | fextralife | wand | wikidata` — anything
else is a `VALIDATION_ERROR`. A tier whose `geo_source_config` row is disabled
is skipped (`SOURCE_DISABLED`); tiers without a config row are always runnable.

```json
{
  "success": true,
  "data": {
    "gameId": 512,
    "results": [
      { "source": "fandom", "enqueued": true, "jobId": "manual-fandom-512" },
      { "source": "wand", "enqueued": false, "reason": "SOURCE_DISABLED" }
    ],
    "budget": { "used": 3, "limit": 20, "remaining": 17 }
  }
}
```

Per-source `reason` values mirror the admin path (`GAME_NOT_FOUND`,
`NOT_CURATED`, `METADATA_UNRESOLVED`, `NO_REGISTRY_ENTRY`,
`MISSING_FANDOM_METADATA`, `MISSING_WIKIDATA_QID`, `SOURCE_DISABLED`). A
non-enqueued source is not an error — the call still returns `200` with the
per-source breakdown. Poll `/games/:id/candidates` to see resulting captures.

Every ingest is written to `admin_audit_log` as `geo-agent.ingest`, keyed
`apikey:<id>`.

### `POST /candidates/:id/pins`

Scope: `geo-agent:propose`. Propose a location pin for a capture. **This is the
one write that touches consensus — and it is safe by construction.** The pin is
persisted flagged (`source = agent_structured | agent_vision`), **downweighted**
in the centroid (×0.6 / ×0.25 vs a human pin), and — critically — **excluded
from the promote count**: a candidate promotes only on ≥5 accepted *human* pins
(or an admin override), so no number of agent pins can create ground truth. Pins
land in the same review queue as crowd pins and are shown to moderators with
their rationale.

```json
{
  "x": 0.42,
  "y": 0.31,
  "source": "agent_structured",
  "rationale": "MapGenie 'Site of Grace: First Step' marker matches the capture's stairway",
  "confidence": 1,
  "model": "optional-model-id",
  "visionPass": 0
}
```

`x`/`y` are normalized to `[0,1]`. `rationale` is **required** (≤500 chars) — it
is the review artifact. `confidence` (1 sure … 3 guess) optionally scales the
weight further. `visionPass` (0–2) lets one key submit multiple independent
`agent_vision` passes per candidate as separate voters. **Propose only when
confident** — a wrong structured pin at weight 0.6 poisons the centroid; prefer
precision over recall.

**Vision gate (phase 5).** `source: "agent_vision"` is rejected with
`403 VISION_DISABLED` until `GEO_AGENT_VISION_ENABLED=true`. The flag is only
flipped after the offline study `npm run eval:geo-vision` clears the enable bar
(≥40% of predictions within the map's consensus radius, median normalized error
< 0.1, on ≥50 known-truth metas). `agent_structured` is unaffected. See
`packages/backend/scripts/geo-vision-eval.ts`.

**Per-key auto-pause (phase 5).** A key whose 7-day proposals are >60% rejected
by consensus (≥10 submissions) is paused with `403 KEY_PAUSED` — the same bar as
the human contributor shadow-ban, applied at the key level so a miscalibrated
proposer can't keep flooding the review queue.

```json
{ "success": true, "data": { "pinId": 90142, "received": true, "pinCount": 7, "budget": { "used": 3, "limit": 60, "remaining": 57 } } }
```

`409 ALREADY_PROMOTED` if the candidate already has a canonical pin. A duplicate
proposal (same key + candidate + `visionPass`) is an idempotent no-op:
`{ "received": true, "duplicate": true }`. Audited as `geo-agent.propose_pin`.

## Error codes

| Code | HTTP | Meaning |
|------|------|---------|
| `AGENT_API_DISABLED` | 503 | `GEO_AGENT_API_ENABLED` is off |
| `UNAUTHORIZED` | 401 | Missing / malformed / invalid key |
| `INSUFFICIENT_SCOPE` | 403 | Key lacks the required geo-agent scope (or carries a non-agent scope) |
| `RATE_LIMITED` | 429 | Per-minute limit hit; see `Retry-After` |
| `BUDGET_EXHAUSTED` | 429 | Write budget hit; `Retry-After` = seconds to window reset |
| `CANDIDATE_NOT_FOUND` | 404 | No such capture candidate (propose) |
| `ALREADY_PROMOTED` | 409 | Candidate already has a canonical pin (propose) |
| `VISION_DISABLED` | 403 | `agent_vision` proposals disabled pending the accuracy study |
| `KEY_PAUSED` | 403 | Key auto-paused: >60% of its recent proposals were rejected |
| `VALIDATION_ERROR` | 400 | Bad `gameId` / `limit` / `sources` / pin body |
| `INTERNAL_ERROR` | 500 | Server error |

## Audit

Admin key mints/revokes are written to `admin_audit_log`
(`agent_key.mint` / `agent_key.revoke`) with the acting admin, label, scopes.
Write endpoints (phases 3–4) will additionally audit each agent action keyed by
`apikey:<id>`.

## MCP wrapper

`@the-box/geo-agent-mcp` (in `packages/geo-agent-mcp/`) exposes these three
reads as MCP tools for Claude Code. See its README for the `mcpServers` config.
