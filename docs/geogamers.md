# GeoGamers Mode

"GeoGuessr for video games" — a daily challenge that fuses the two existing
modes: **identify the game** from a screenshot (classic mode's skill) then
**pin where it was captured** on that game's map (geo mode's skill). Inspired by
Red Bull GeoGamers. Tracking issue: #325.

Ships **dark** behind `GEOGAMERS_ENABLED`; the API 404s and the daily scheduler
doesn't register until it's turned on.

## The daily run

One challenge per UTC day. A run walks two phases then terminates:

1. **identify** — the player names the hidden game (fuzzy-matched, reusing the
   classic `fuzzy-match.service`). Up to **3 attempts**, scored **100 / 66 / 33
   / 0** by the attempt that lands. No hints — the ranked run is deliberately
   hint-free (the game identity *is* the puzzle, so metadata hints would be far
   too strong). Near-miss proximity feedback on the player's own guess only.
2. **locate** — the game + its maps are revealed; the player drops a pin.
   Scored **0–100** by precision, reusing geo mode's exponential-decay curve
   (`GEO_SCORE_DECAY`) rescaled from 2000 → 100. Wrong-map picks are floored to
   ~0, same rule as geo mode.
3. **done** — both phases scored. **Daily max = 200.**

### Joker

A once-per-**season** "swap panorama" re-roll (account only, no premium second
one). Allowed only in the identify phase before any attempt is spent — it
replaces the puzzle, it is not a retry. Enforced by the `geogamers_joker`
composite primary key `(user_id, season_month)`.

### Anonymous play & claim-on-signup

Guests (logged-out / anonymous sessions) play **today's actual run unranked**,
see their score and a **ghost rank** ("you'd be #N today"). Signing up in the
same browser session **claims** that one day's score into the season — it does
NOT grant a fresh attempt (the anonymous run *is* the ranked score), which
closes the "scout in incognito then replay ranked" hole. A timing-plausibility
floor (`GEOGAMERS_MIN_RUN_SECONDS`) rejects impossibly fast runs at claim time.
All season mechanics stay account-only.

### Anti-leak

Game/map identity is never serialized before phase 1 resolves — the run view is
built from an explicit whitelist, never by spreading the run row. The screenshot
is served through an **opaque proxy** (`GET /api/geogamers/image/:runToken`) that
streams the source server-side, so the client never sees an asset path that
could carry a game slug.

## Season & ranking

Season = **calendar month**. A player's **season score = sum of daily totals
minus their 3 worst days**, but only once they've played **≥ 10 days**
(`provisional` until then, raw total stands). Fully **separate** from the
classic/geo leaderboards — no points cross modes; cross-mode links are
recognition-only (planned achievements/badges).

The ranking lives in `geogamers-season.repository` (a windowed SQL CTE) behind a
reusable `SeasonRanking` port, so future modes plug into the same payout loop.

At month close the **payout worker** (`geogamers-season-payout-logic`, 1st @
00:35 UTC) grants a season-frame cosmetic to eligible **non-provisional** top
finishers, idempotent via the `reward_grants` unique `(userId, sourceRef =
geogamers_payout:season:YYYY-MM)`. Full first-attempt-correct anomaly screening
+ admin review is a documented follow-up; the days-played floor is the enforced
integrity gate today.

## Content pipeline

A challenge needs a geo screenshot with a **consensus/admin canonical pin**, an
active map, and an active game — and one that has **never** been a GeoGamers
challenge before. The daily scheduler (`geogamers-challenge-logic`, 00:05 UTC):

- **gates** on `GEOGAMERS_MIN_ELIGIBLE_GAMES` distinct eligible games (a
  "guess the game" round is meaningless with too small a pool) — skips + warns
  when starved;
- applies a per-game **cooldown** (`GEOGAMERS_GAME_COOLDOWN_DAYS`) so the same
  game isn't reused too soon;
- is idempotent per date and sets the new challenge current in a transaction
  (partial-unique `is_current`).

## Schema

| Table | Purpose |
|---|---|
| `geogamers_challenge` | one per UTC day; partial-unique `is_current` |
| `geogamers_run` | one row per user\|guest per challenge. No hint columns. Nullable `user_id` + `run_token` + claim columns; nullable `geo_screenshot_meta_id` overrides the challenge meta on a joker re-roll |
| `geogamers_joker` | once-per-season ledger (composite PK) |
| `geogamers_season` | month-close finalization + frozen standings snapshot |

## API (`/api/geogamers`, mounted only when enabled)

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /run` | optional | start or resume today's run |
| `GET /run/:runToken` | optional | fetch a run (reload) |
| `POST /run/guess-game` | optional | phase 1 attempt |
| `POST /run/guess-location` | optional | phase 2 pin |
| `POST /run/joker` | required | re-roll (once/season) |
| `POST /run/claim` | required | claim a completed guest run into the account |
| `GET /image/:runToken` | optional | opaque screenshot proxy |
| `GET /season` | optional | top 100 standings + player count |
| `GET /season/me` | required | own standing + per-day breakdown |

## Realtime

`geogamers:season:updated` broadcasts finalized/updated top standings on the
`/geo` namespace (see `docs/realtime.md`).

## Public API

`GET /api/public/v1/geogamers/season?limit=N` (key-authenticated, same tree as
the streamer kit) returns current-month standings for overlays/bots:
`{ month, standings: [{ rank, slug, displayName, seasonScore, daysPlayed,
provisional }] }`. Public-safe (no user ids; slug only for opted-in public
profiles). Returns an empty list when the feature is disabled so integrators
can poll unconditionally. Documented in `docs/public-api.openapi.yaml`.

## Web push

A "today's panorama is live" notification (`type: geogamers_daily`) fans out to
active, non-anonymous subscribers on the day's first challenge creation.

## Party mode (1–4 players)

A casual, **unranked** variant: 1–4 players in a private lobby play the same
server-seeded round sequence (3/5/10 rounds), each on their own screen, with a
synchronized reveal between rounds and a live scoreboard. Draws from the same
eligible pool as the daily (which excludes every screenshot ever used as a
challenge), so it never touches the season and can't scout the ranked daily.
Guests may join.

State is ephemeral (Redis, 2h TTL). Play runs over the Socket.io
`/geogamers-party` namespace; the pure state machine (`geogamers-party.service`)
is the source of truth and is fully unit-tested. Views are spectator-safe — the
game identity and canonical pin are withheld until a player resolves phase 1 or
the round reveals. Screenshots stream through a party image proxy. Frontend:
`GeoGamersPartyPage` (route `/:lang/geogamers/party`).

## Config

| Var | Default | Purpose |
|---|---|---|
| `GEOGAMERS_ENABLED` | `false` | mount routes + register the scheduler |
| `GEOGAMERS_MIN_ELIGIBLE_GAMES` | `10` | content gate for challenge creation |
| `GEOGAMERS_GAME_COOLDOWN_DAYS` | `14` | per-game reuse cooldown |

## Status

Implemented: Phase 0 (types + schema), Phase 1 (backend core — scoring,
orchestration, repos, worker, routes), Phase 2 (frontend play flow), Phase 3
(season ranking + standings API + payout worker + socket broadcast +
leaderboard season tab + recognition-only achievements — `geogamers_first_run`,
`geogamers_perfect_day`, awarded on ranked completion).

Plus: daily web-push fan-out, a read-only public-API season endpoint, and an
admin content-health panel (`GET /api/admin/geogamers/health` + a Géo-tab card
that flags content starvation before a day silently skips).

Plus Phase 4 party mode (1–4 player lobbies).

Follow-ups (tracked on #325): public-API SSE / outbound webhooks for GeoGamers
events, admin anomaly-review (first-attempt-correct screening at payout), more
cross-mode achievements (season top-10, dual-podium), immersive panoramas
(Phase 5). Party mode's live multiplayer path (Redis + Socket.io + multiple
clients) still needs end-to-end verification in a real environment.
