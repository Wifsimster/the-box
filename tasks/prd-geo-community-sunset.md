# PRD: Geo Community Sunset & Agent-First Content Sourcing

## Introduction

The community geo surface (Geo Free Play + Geo Contribute) exists to build the
dataset GeoGamers runs on: screenshot ↔ map-coordinate pairs, promoted to
canonical ground truth by crowd consensus. Since issue #331/#345 shipped, the
same dataset can be built by an LLM agent over MCP: the Geo Agent API
(`docs/geo-agent-api.md`) can enroll games, trigger ingestion, top up captures,
curate maps, and — with `geo-agent:promote-override` — assert canonical pins
directly, with no crowd involved.

This PRD answers "can we remove the geo feature and go straight to GeoGamers?"
and ships the first step: a sunset switch.

**What cannot be removed** (GeoGamers hard dependencies):

- Tables `geo_screenshot_meta`, `geo_screenshot_candidate`, `geo_maps` — every
  GeoGamers challenge joins them.
- The ingestion pipeline (map/capture importers, metadata resolver, geo-fetch
  admin panel) — it is how maps and candidates exist at all.
- `geo-scoring.service` (GeoGamers phase 2 reuses its decay curve) and the
  Leaflet map components under `components/geo/` (GeoGamers pages import them).
- The Geo Agent API + `@the-box/geo-agent-mcp` — the replacement sourcing path.

**What is community-only** (candidates for sunset):

- `/api/geo` routes: free-play pick/guess, contribute pick/pin, contributor
  stats, playable-games catalog.
- `GeoPlayPage`, `GeoContributePage`, `geoStore`, `geoFreePlayStore`.
- Contributor progression (`geo-contributor.service`, tiers, shadow-ban),
  first-pin/accuracy rewards (`geo-reward.service`).
- The crowd half of `geo-consensus.service` (the ≥5-human-pins promote gate).

## Goals

- Allow a deployment to turn off the community surface without code changes,
  losing nothing GeoGamers needs.
- Keep the default behavior identical (flag defaults on) — no product decision
  is forced by this PR.
- Document the agent-first bootstrap runbook so GeoGamers can launch without
  waiting for crowd consensus.
- Defer physical deletion until the agent pipeline has proven itself in
  production (phase 2, separate PR).

## Non-Goals

- Deleting any code, table, or migration in this phase.
- Changing GeoGamers eligibility rules or consensus math.
- Turning the flag off anywhere — that is an ops decision.

## What shipped in this PR (phase 1 — the switch)

- `GEO_COMMUNITY_ENABLED` (default `true`). When `false`:
  - `/api/geo` is not mounted; requests get the JSON 404
    (`NOT_FOUND`), which the frontend geo client maps to a localized
    `GEO_COMMUNITY_DISABLED` message on the Geo pages.
  - `GET /api/features` (new, public, cacheable) reports
    `{ geoCommunity, geogamers }`; the frontend hides the Geo nav entry, the
    home-page mode card, and the home hero's Geo CTA.
- The geo data layer is untouched: ingestion workers, consensus worker (agent
  pin proposals still feed it), admin geo-fetch, the agent API, and GeoGamers
  all run regardless of the flag.

## Agent-first bootstrap runbook (GeoGamers launch without the crowd)

Preconditions: an admin-minted geo-agent key with the needed scopes
(Admin → Géo → Clés agent), `RAWG_API_KEY` set, and the MCP server
(`@the-box/geo-agent-mcp`) configured against prod.

1. Flip the surface on: `GEO_AGENT_API_ENABLED=true`, then per stage
   `GEO_AGENT_CURATE_ENABLED=true` and (deliberately last)
   `GEO_AGENT_PROMOTE_OVERRIDE_ENABLED=true`.
2. `GET /health` → `starved`/`eligibleGames` tells the agent how far from
   `GEOGAMERS_MIN_ELIGIBLE_GAMES` (default 10) the pool is.
3. Per missing game: `POST /games` (enroll by `rawgId`) → `POST /games/:id/ingest`
   → inspect `GET /games/:id/maps`, `select`/`reject`/upload a manual map →
   `POST /games/:id/captures` for geolocatable stills.
4. Ground truth: prefer `POST /candidates/:id/pins` multi-pass proposals
   (`visionPass` 0–2) so the consensus math cross-checks locations; use
   `POST /candidates/:id/promote-override` (budget: 5/day/key) only for
   captures the agent can localize against a structured source (e.g. a wiki
   marker), never from vision alone while `GEO_AGENT_VISION_ENABLED` is off.
5. Verify with `GET /api/admin/geogamers/health`, create the first challenge
   via the admin card, set `GEOGAMERS_ENABLED=true`, launch at a month
   boundary.

Quality bar before trusting vision pins at scale: `npm run eval:geo-vision`
must clear ≥40% of predictions within the map's consensus radius and median
normalized error < 0.1 on ≥50 known-truth metas.

## Phase 2 (separate PR, only after agent sourcing is proven)

Once the flag has been `false` in production for a full season with no content
starvation and no bad-pin incidents:

- Delete `GeoPlayPage`, `GeoContributePage`, `geoStore`, `geoFreePlayStore`,
  the `/geo` and `/geo/contribute` routes, and `lib/api/geo.ts`.
- Delete the community endpoints from `geo.routes.ts` (or the file) and
  `geo-contributor.service` / `geo-reward.service` + their repositories.
- Keep `geo-consensus.service` — repurposed as the multi-pass agent-pin
  validation harness (centroid + σ-rejection over `visionPass` voters).
- Keep `geo_pins` (agent pins land there) and every `geo_*` content table.
- Re-point the `/share/geo-run` OG route or retire it with the pages.
- Drop the `geo-play`/`geo-contribute` e2e specs; add an agent-sourcing smoke
  test against a seeded DB instead.

## Risks

- **Wrong canonical pins with no crowd to catch them.** Mitigation: prefer
  consensus-validated multi-pass proposals over overrides; keep
  `promoted_via = 'agent_override'` metas filterable and reversible; keep the
  override budget tight.
- **Losing a retention loop.** Contribute/free-play engagement should be
  measured before phase 2 deletes them; the flag makes an A/B or staged
  rollout trivial.
- **Source licensing.** Agent-sourced locations lean on wiki/MapGenie-style
  references; keep the provenance rules from `docs/geo-mode.md` (prefer
  Wikidata/CC sources, identify the crawler, respect rate limits).
