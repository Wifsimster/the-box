# Geo Agent API — content sourcing (issue #331)

Key-authenticated HTTP surface that lets an AI agent (Claude Code / an MCP
client) safely *drive* geo content sourcing against prod. It started as a
read-only proof of the auth / audit / rate-limit surface (phase 2) and grew a
write surface in stages: ingest triggers (phase 3), downweighted pin proposals
(phase 4), **content creation & curation** (phase 5) — enrolling new games,
topping up screenshot candidates, and picking/rejecting candidate maps — and
**confirm/promote** (phase 7): letting the agent pull the trigger on a
promotion the crowd has already earned. See the
[agent-assisted geo sourcing plan](../tasks/prd-geo-agent-sourcing.html).

> Design principle: the agent *proposes*, consensus + admins *dispose*. Even
> the curate endpoints only reach content the admin UI already lets an
> operator create — no raw SQL, no user PII, and every write is scoped,
> budgeted, and audited. See `docs/geo-mode.md` for the consensus gate the
> pin-proposal surface feeds.

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
| `geo-agent:read` | `/health`, `/games-needing-content`, `/games`, `/games/:id/candidates`, `/games/:id/maps` | 2, 5 |
| `geo-agent:ingest` | `POST /games/:id/ingest` — trigger the ingestion pipeline | 3 |
| `geo-agent:propose` | `POST /candidates/:id/pins` — propose a downweighted consensus pin | 4 |
| `geo-agent:curate` | `POST /games`, `POST /games/:id/captures`, `POST /games/:id/maps/:mapId/select`, `POST /games/:id/maps/:mapId/reject` — content creation & curation | 5 |
| `geo-agent:promote` | `POST /candidates/:id/promote` — confirm & promote a capture's qualifying consensus pin to canonical | 7 |

A freshly minted key defaults to `geo-agent:read`. Ingest/propose/curate/promote
are granted per key as later phases ship.

## Curate kill switch (phase 5)

The four `geo-agent:curate` write endpoints sit behind a **second**,
independent kill switch: `GEO_AGENT_CURATE_ENABLED` (default `false`). While
off they return `503 AGENT_CURATE_DISABLED` even for a key that holds the
scope — an operator can run read/ingest/propose in production while curation
stays dark, and can flip curation off alone without touching the rest of the
surface.

## Promote kill switch (phase 7)

The single `geo-agent:promote` write endpoint sits behind a **third**,
independent kill switch: `GEO_AGENT_PROMOTE_ENABLED` (default `false`). While
off it returns `503 AGENT_PROMOTE_DISABLED` even for a key that holds the
scope — promotion is the one agent write that creates ground truth, so it can
stay dark while read/ingest/propose/curate run in production, and can be flipped
off alone.

## Rate limit & budgets

Fixed-window, **60 requests / minute per key** (in-memory). On exhaustion:
`429 RATE_LIMITED` with `Retry-After`.

Write endpoints additionally carry a **per-key budget** in Redis (survives
deploys). Ingest: `GEO_AGENT_MAX_INGESTS_PER_DAY` (default 20) per UTC day. Pin
proposals: `GEO_AGENT_MAX_PINS_PER_HOUR` (default 60) per UTC hour. Curate
(phase 5), each its own daily counter: enroll —
`GEO_AGENT_MAX_ENROLLS_PER_DAY` (default 5); capture import —
`GEO_AGENT_MAX_CAPTURE_IMPORTS_PER_DAY` (default 10); map select/reject —
`GEO_AGENT_MAX_MAP_ACTIONS_PER_DAY` (default 30, shared by both actions).
Promote (phase 7): `GEO_AGENT_MAX_PROMOTES_PER_DAY` (default 20) per UTC day. On
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

### `GET /games?limit=`

The whole geo-curated catalog (issue #331, phase 5) — every game with
`geo_curated = true`, not just the "one pin away" work queue. `limit` 1–500
(default 200).

```json
{
  "success": true,
  "data": [
    {
      "gameId": 512,
      "gameName": "Hollow Knight",
      "captureCount": 22,
      "mapCount": 1,
      "canonicalPinCount": 3,
      "eligible": true,
      "starved": false
    }
  ]
}
```

`eligible` mirrors the GeoGamers eligibility gate (an active map + at least
one canonical pin). `starved` flags a game whose active capture count hasn't
reached the ingest pipeline's per-game target (30) — where
`POST /games/:id/captures` would help.

### `POST /games`

Scope: `geo-agent:curate`. Enroll a game into the geo pipeline. Pass either
`gameId` (an existing game row) or `rawgId` (looked up by `rawg_id`, or
created from RAWG if no game has that id yet). Reuses the **same** switch the
admin "Games" tab flips (`games.geo_curated = true` +
`geo_metadata_status = 'pending'`) rather than duplicating the RAWG import /
metadata-resolve / map-ingest pipeline — that one write is all it takes for
the existing resolver + ingest tick to pick the game up on their next pass.
Idempotent: enrolling an already-curated game just re-arms metadata
resolution.

```json
{ "rawgId": 3498 }
```

```json
{
  "success": true,
  "data": {
    "gameId": 512,
    "name": "Hollow Knight",
    "created": false,
    "curated": true,
    "budget": { "used": 1, "limit": 5, "remaining": 4 }
  }
}
```

`404 GAME_NOT_FOUND` if `gameId` doesn't exist. `400 RAWG_LOOKUP_FAILED` if
`rawgId` doesn't resolve via RAWG (or `RAWG_API_KEY` isn't configured).
Audited as `geo-agent.enroll_game`.

### `POST /games/:gameId/captures`

Scope: `geo-agent:curate`. Top up an enrolled game's screenshot candidates.
Reuses the existing RAWG importer (the same function the ingest tick calls) —
pass `targetCount` to pull more from RAWG, or `imageUrls` to insert an
explicit list of manual/gameplay captures instead (RAWG's promotional shots
are often combat beauty-shots, not geolocatable stills). Requires the game to
already have an enabled map (`409 NO_ACTIVE_MAP` otherwise).

```json
{ "targetCount": 20 }
```

```json
{ "imageUrls": ["https://example.com/gameplay-1.jpg", "https://example.com/gameplay-2.jpg"] }
```

```json
{
  "success": true,
  "data": {
    "gameId": 512,
    "mapId": 77,
    "fetched": 20,
    "inserted": 14,
    "skipped": 6,
    "budget": { "used": 1, "limit": 10, "remaining": 9 }
  }
}
```

`skipped` counts URLs/RAWG screenshots that already exist as a candidate
(dedup on `(source, external_id)`). `409 NO_RAWG_ID` if the game has no
`rawgId` and `imageUrls` wasn't provided. Audited as
`geo-agent.import_captures`.

### `GET /games/:gameId/maps`

Every candidate map fetched for a game, active or not — so an agent can
inspect what the ingestion pipeline found and pick the canonical one. Mirrors
the admin geo-fetch curation panel.

```json
{
  "success": true,
  "data": {
    "maps": [
      { "id": 77, "gameId": 512, "source": "fandom", "imageUrl": "https://…", "isSelected": true },
      { "id": 81, "gameId": 512, "source": "wand", "imageUrl": "https://…", "isSelected": false }
    ]
  }
}
```

### `POST /games/:gameId/maps/:mapId/select`

Scope: `geo-agent:curate`. Promote a candidate map to canonical for a game —
the fix for a wrong-game map (e.g. Uncharted 2 with a Lost Legacy map, or
Ocarina of Time with the 1986 original's map) once `GET /games/:id/maps`
shows the correct one. Enables the map first if it isn't already enabled, then
selects it; `selectedBy` is recorded as `apikey:<id>`. `404 MAP_NOT_FOUND` if
`mapId` doesn't belong to `gameId`. Audited as `geo-agent.select_map`.

### `POST /games/:gameId/maps/:mapId/reject`

Scope: `geo-agent:curate`. Disable a wrong-game or prop map. Reuses the same
`disableForGame` the admin panel uses — it **refuses to leave a game with zero
enabled maps** (`409 LAST_ENABLED`): select a replacement canonical map first
if this is the last enabled one. `404 NOT_FOUND` if `mapId` doesn't exist.
Audited as `geo-agent.reject_map`.

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

### `POST /candidates/:id/promote`

Scope: `geo-agent:promote`. **Confirm and promote** a capture's consensus pin to
canonical ground truth. This is the one agent write that *creates* ground truth,
and it is safe by construction: the agent supplies **no coordinates** and can
promote only where the crowd already earned it. The server re-runs consensus
over the candidate's pins and refuses unless it **qualifies** — the same
auto-promote gate the consensus worker uses: ≥5 accepted **human** pins
(`GEO_CONSENSUS_MIN_PINS_TO_PROMOTE`) and a tight enough cluster
(`confidence ≥ 0.5`). Agent pins are downweighted voters and excluded from that
human count (consensus v3), so no pile of machine pins can manufacture a
qualifying candidate — the agent merely pulls the trigger on a promotion the
crowd earned but that a threshold recompute (`[5, 10, 20, 50]`) may not have
fired for. Promotes via the consensus centroid (`promoted_via = 'consensus'`),
attributing `promoted_by` to `apikey:<id>` — the same primitive the admin
override uses.

The request takes **no body**.

```json
{
  "success": true,
  "data": {
    "meta": {
      "id": 4521,
      "canonicalX": 0.42,
      "canonicalY": 0.31,
      "confidence": 0.87,
      "promotedVia": "consensus"
    },
    "budget": { "used": 1, "limit": 20, "remaining": 19 }
  }
}
```

`404 CANDIDATE_NOT_FOUND` if no such capture. `409 ALREADY_PROMOTED` if it
already has a canonical pin. `409 NO_PINS` if the candidate has no pins yet.
`409 CONSENSUS_NOT_READY` if consensus doesn't qualify — the error `data` carries
`humanAcceptedCount`, `requiredHumanPins`, and `confidence` so an agent can see
how far off it is. Audited as `geo-agent.promote_candidate`.

## Error codes

| Code | HTTP | Meaning |
|------|------|---------|
| `AGENT_API_DISABLED` | 503 | `GEO_AGENT_API_ENABLED` is off |
| `AGENT_CURATE_DISABLED` | 503 | `GEO_AGENT_CURATE_ENABLED` is off (curate endpoints only) |
| `AGENT_PROMOTE_DISABLED` | 503 | `GEO_AGENT_PROMOTE_ENABLED` is off (promote endpoint only) |
| `UNAUTHORIZED` | 401 | Missing / malformed / invalid key |
| `INSUFFICIENT_SCOPE` | 403 | Key lacks the required geo-agent scope (or carries a non-agent scope) |
| `RATE_LIMITED` | 429 | Per-minute limit hit; see `Retry-After` |
| `BUDGET_EXHAUSTED` | 429 | Write budget hit; `Retry-After` = seconds to window reset |
| `CANDIDATE_NOT_FOUND` | 404 | No such capture candidate (propose / promote) |
| `ALREADY_PROMOTED` | 409 | Candidate already has a canonical pin (propose / promote) |
| `NO_PINS` | 409 | Candidate has no pins to compute consensus from (promote) |
| `CONSENSUS_NOT_READY` | 409 | Consensus doesn't yet qualify to promote (promote) |
| `VISION_DISABLED` | 403 | `agent_vision` proposals disabled pending the accuracy study |
| `KEY_PAUSED` | 403 | Key auto-paused: >60% of its recent proposals were rejected |
| `GAME_NOT_FOUND` | 404 | No such game (`gameId` on enroll) |
| `RAWG_LOOKUP_FAILED` | 400 | `rawgId` didn't resolve via RAWG, or `RAWG_API_KEY` isn't set |
| `NO_ACTIVE_MAP` | 409 | Game has no enabled map to attach captures to |
| `NO_RAWG_ID` | 409 | Game has no `rawgId` and `imageUrls` wasn't provided |
| `MAP_NOT_FOUND` | 404 | No such map for the game (select) |
| `NOT_FOUND` / `LAST_ENABLED` | 404 / 409 | Map reject target missing / would leave zero enabled maps |
| `VALIDATION_ERROR` | 400 | Bad `gameId` / `limit` / `sources` / pin / enroll / capture body |
| `INTERNAL_ERROR` | 500 | Server error |

## Audit

Admin key mints/revokes are written to `admin_audit_log`
(`agent_key.mint` / `agent_key.revoke`) with the acting admin, label, scopes.
Every write endpoint audits its action keyed by `apikey:<id>`:
`geo-agent.ingest`, `geo-agent.propose_pin`, `geo-agent.enroll_game`,
`geo-agent.import_captures`, `geo-agent.select_map`, `geo-agent.reject_map`,
`geo-agent.promote_candidate`.

## MCP wrapper

`@the-box/geo-agent-mcp` (in `packages/geo-agent-mcp/`) exposes every one of
these endpoints as an MCP tool for Claude Code. See its README for the tool
table and `mcpServers` config.
