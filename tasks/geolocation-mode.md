# PRD: Geolocation Game Mode ("GeoGuessr for Game Worlds")

## Introduction

This PRD introduces a new, **additive** game mode for The Box: players view a panoramic screenshot from a known video game world and pin its exact location on that game's in-world map. Scoring is distance-based, Socket.io-powered live leaderboards run in parallel to the existing daily challenge, and data is sourced automatically from public APIs where possible, with a gamified crowdsourcing loop filling in the missing coordinate data.

The existing "guess the game" mode is **not modified**. Geolocation ships as a parallel mode with its own routes, tables, services, workers, stores, leaderboards, and UI, sharing only auth/user/screenshot primitives.

## Goals

- Launch a defensible, ownable positioning: "GeoGuessr for game worlds"
- Ship as an additive bonus mode with zero behavioral or schema changes to the existing game
- Automate map + screenshot ingestion from public sources (Fandom MediaWiki, Steam, RAWG)
- Close the coordinate-data gap via an in-app crowdsourced pinning mini-game
- Reward crowdsourcers with existing hint tokens (never score multipliers) so the main leaderboard stays fair
- Pilot on a single flagship open-world title (Elden Ring) before scaling
- Validate with a retention + share-rate metric before promoting Geo to a headline feature

## User Stories

### US-001: Play a daily Geo challenge
**Description:** As a player, I want to view a panoramic screenshot and pin its location on the game's map, so that I can test how well I know the game world.

**Acceptance Criteria:**
- [ ] New route `/geo/daily` renders today's Geo challenge
- [ ] Panorama viewer (existing Three.js component) displays the target screenshot
- [ ] Side-by-side Leaflet map (L.CRS.Simple) displays the game's reference map
- [ ] Clicking on the map drops a pin; pin can be moved before submission
- [ ] Submit button sends pin `(x, y)` normalized to `[0..1]` map coords to `POST /api/geo/guess`
- [ ] Result screen shows the canonical location, the guess, the distance, and the score
- [ ] Existing `/game/daily` behavior is unchanged
- [ ] Typecheck passes
- [ ] E2E test mirrors `daily-game.spec.ts` structure

### US-002: See Geo-specific daily leaderboard
**Description:** As a player, I want a separate Geo leaderboard so my pinning skill is ranked independently from the screenshot-guessing leaderboard.

**Acceptance Criteria:**
- [ ] `/geo/leaderboard` renders daily + monthly Geo rankings
- [ ] Socket.io `/geo` namespace (or `geo:*` event prefix) emits live updates
- [ ] Existing `/leaderboard` routes and data are untouched
- [ ] Typecheck passes

### US-003: Catch up on missed Geo challenges
**Description:** As a player, I want to replay the last 7 days of Geo challenges for practice without affecting the leaderboard.

**Acceptance Criteria:**
- [ ] `/geo/history` lists the last 7 days' challenges
- [ ] Replays do not write to `geo_leaderboard_*`
- [ ] Typecheck passes

### US-004: Contribute coordinates via the pin mini-game
**Description:** As a player, I want to help tag untagged screenshots by placing a pin on the map, so that new content becomes playable and I earn rewards.

**Acceptance Criteria:**
- [ ] New route `/geo/contribute` presents an unlabeled screenshot + map
- [ ] Player drops a pin and submits
- [ ] Submission writes to `geo_pin_submission` with `(user_id, geo_screenshot_id, x, y)` (normalized)
- [ ] Unique `(user_id, geo_screenshot_id)` index prevents re-pinning the same screenshot
- [ ] Player sees a neutral "thanks — we'll let you know when this is reviewed" state (no score feedback on submit; prevents fishing)
- [ ] Gated: only unlocks after 3 days of completed daily-game activity
- [ ] Per-user hourly rate limit enforced
- [ ] Typecheck passes

### US-005: Earn rewards for accurate pins
**Description:** As a contributor, I want to receive hint tokens when my pins fall inside the consensus cluster for a screenshot.

**Acceptance Criteria:**
- [ ] `geo-consensus` BullMQ worker runs at pin-count thresholds (5, 10, 20, …)
- [ ] Pins beyond `2σ` of the centroid OR beyond `map.consensus_radius` are rejected (zero reward)
- [ ] Accepted pins in the consensus cluster enqueue `geo-reward` jobs
- [ ] Tight-radius pins grant `hint_publisher` / `hint_developer` via `inventoryRepository.addItems()`
- [ ] Every 10th accepted pin grants `+1 timer_extension`
- [ ] First ≥5 clustered pins promote the centroid to canonical in `geo_screenshot_meta`; tightest contributors are retro-rewarded
- [ ] Existing `game.service.ts` consumes these hint tokens identically to any other token (no edits to game.service.ts)
- [ ] Socket.io event `geo:contribution:rewarded` fires to the contributor
- [ ] Typecheck passes

### US-006: See my contributor status on my profile
**Description:** As a contributor, I want a Crowdsourcer badge and tier on my profile reflecting my accepted-pin accuracy.

**Acceptance Criteria:**
- [ ] New `components/profile/GeoContributorCard.tsx` renders on `pages/Profile.tsx` alongside existing cards
- [ ] Card shows tier (Bronze / Silver / Gold / Diamond), total accepted pins, accuracy %, and lifetime rewards
- [ ] Tier thresholds read from `geo_contributor_tier_threshold` (tunable)
- [ ] Tier-up emits `geo:contributor:tier_up` → toast + card refresh
- [ ] Existing profile code and stats are unchanged
- [ ] Typecheck passes

### US-007: Admin reviews low-confidence pins
**Description:** As an admin, I want a panel to manually override or accept pins where consensus is weak, so I can unlock edge-case screenshots.

**Acceptance Criteria:**
- [ ] New admin panel lists `geo_screenshot_candidate` rows with pin distributions
- [ ] Admin can set a canonical `(x, y)` manually, promoting to `geo_screenshot_meta`
- [ ] Existing admin panels are unmodified
- [ ] Typecheck passes

## Functional Requirements

### Additive architecture (hard constraint)

- FR-1: All Geo routes mount under `/api/geo/*`; no existing route is edited
- FR-2: All Geo tables are prefixed `geo_*`; **no columns added to existing tables**
- FR-3: New Geo repositories live in `src/infrastructure/repositories/geo-*.repository.ts`
- FR-4: New domain services: `geo-game.service.ts`, `geo-scoring.service.ts`, `geo-map.service.ts`, `geo-reward.service.ts`, `geo-consensus.service.ts`
- FR-5: New frontend pages: `/geo`, `/geo/daily`, `/geo/history`, `/geo/contribute`, `/geo/leaderboard`
- FR-6: New Zustand slice `geoStore`; existing `gameStore` is unmodified
- FR-7: New components under `components/geo/`; shared `components/ui/` primitives reused read-only
- FR-8: Shared read-only dependencies limited to: Better Auth, `user` table/service, `screenshot` table/repo, `@the-box/types`
- FR-9: Feature flag `VITE_GEO_ENABLED` gates all Geo UI; when `false`, the app behaves exactly as today

### Data model (new tables only)

- FR-10: `geo_map` — `(id, game_id FK, source, source_url, image_url, width_px, height_px, consensus_radius, license, attribution, created_at)`
- FR-11: `geo_screenshot_meta` — `(id, screenshot_id FK UNIQUE, geo_map_id FK, canonical_x, canonical_y, confidence, promoted_at)`
- FR-12: `geo_screenshot_candidate` — unlabeled ingested screenshots awaiting pins
- FR-13: `geo_challenge` — `(id, date, geo_screenshot_meta_id FK, tier)`
- FR-14: `geo_guess` — `(id, user_id FK, geo_challenge_id FK, x, y, distance, score, created_at)`
- FR-15: `geo_leaderboard_daily`, `geo_leaderboard_monthly` — parallel to existing leaderboard tables
- FR-16: `geo_pin_submission` — `(id, user_id FK, geo_screenshot_id FK, x, y, status, reviewed_at)` with UNIQUE `(user_id, geo_screenshot_id)`
- FR-17: `geo_contributor_stats` — `(user_id PK, tier, total_submitted, total_accepted, accuracy, shadow_banned, updated_at)`
- FR-18: `geo_contributor_tier_threshold` — tunable tier cutoffs
- FR-19: Migration filename: `20260419_add_geolocation_mode.ts`

### Automated ingestion

- FR-20: Map ingestion is layered into **four tiers**, tried in priority order per
  curated game by the recurring `geo-ingest-tick` worker. The first tier with
  a usable source wins; failures tombstone per-tier (exponential backoff) and
  cascade to the next tier on the following tick:
    - **Tier 1 — Registry (`source = 'registry'`)**: a curated JSON file
      (`packages/backend/data/geo-map-registry.json`) maps `game.slug` to a
      permissively-licensed image URL (typically `raw.githubusercontent.com`
      pointing into an MIT/GPL/CC-licensed Leaflet repo). Worker:
      `geo-registry-import-logic.ts`. Each entry declares `license`,
      `attribution`, `sourceUrl`, and a `commercialUseOk` flag so legal can
      filter NC entries out of any commercial tier.
    - **Tier 2 — Fandom Interactive Maps (`source = 'fandom'`)**: structured
      `getmap` JSON via the wiki's MediaWiki API. Worker:
      `geo-fandom-import-logic.ts`. Stores `wikiMapName` + `wikiRevisionId`
      for change detection. Defaults to CC-BY-SA-3.0 with explicit attribution
      back to the wiki page.
    - **Tier 3 — Wikidata P242 (`source = 'wikidata'`)**: the `P242` (locator
      map image) statement on the game's Q-item is dereferenced through
      Wikimedia Commons `imageinfo`, yielding a properly-licensed image URL
      with declared license metadata. Worker:
      `geo-wikidata-import-logic.ts`. Sparse coverage but bulletproof
      provenance.
    - **Tier 4 — Admin manual upload (`source = 'manual'`)**: last-resort
      route (`POST /api/admin/geo/maps/manual`) for games with no machine
      source. Admin supplies a stable image URL plus declared license,
      attribution, and dimensions; the worker layer is bypassed entirely.
      Manual uploads also clear all per-tier tombstones for the game so the
      auto-pipeline doesn't keep retrying.
- FR-20a: Sources explicitly excluded: IGN, MapGenie, Nexus Mods, Fextralife
  interactive tile scraping, Reddit bulk scraping (ToS / DMCA / Cloudflare
  anti-bot risk).
- FR-20b: Each `geo_map` row preserves source provenance (`source`,
  `source_url`, `attribution`, `license`, `wiki_map_name`, `wiki_revision_id`)
  so a DMCA takedown or licence audit can be answered per-row.
- FR-21: New BullMQ worker `geo-screenshot-import` pulls screenshots from
  Steam Web API (appid) and RAWG; writes to `geo_screenshot_candidate`.
- FR-22: New BullMQ worker `geo-coordinate-extract` (optimistic): OCR /
  minimap detection; any low-confidence hits go to the review queue (**never
  auto-published**).
- FR-23: New BullMQ worker `geo-publish` promotes reviewed/consensus-verified
  candidates to `geo_screenshot_meta`.
- FR-24: New BullMQ worker `geo-consensus` computes centroid + σ on
  `geo_pin_submission` per screenshot at thresholds (5, 10, 20, 50).
- FR-25: New BullMQ worker `geo-reward` grants tokens via
  `inventoryRepository.addItems()` and achievements via
  `achievementRepository.grant()`.
- FR-26: Existing workers (`import`, `sync`, `daily-challenge`, `cleanup`)
  are untouched.

### Scoring

- FR-28: `geo-scoring.service.ts` computes Euclidean pixel distance between guess and canonical, normalized by map diagonal
- FR-29: Score = `round(SCORE_MAX * exp(-DECAY * normalized_distance))` with `SCORE_MAX` and `DECAY` in `config/`
- FR-30: Scoring formula version stored in `geo_guess.score_version` for fairness across future retunes
- FR-31: Geo scores never influence the existing game leaderboard and vice versa

### Rewards (tokens only)

- FR-32: `geo-reward.service.ts` is the **only** writer of Geo-sourced rewards
- FR-33: Reward types are limited to existing inventory `item_key`s: `hint_year`, `hint_publisher`, `hint_developer`, `timer_extension`
- FR-34: **No** multipliers, persistent time bonuses, currency, or score-affecting rewards are ever issued by Geo
- FR-35: Rejected pins yield zero rewards (no participation bribe)
- FR-36: Anti-abuse: rolling 7-day rejection ratio > 60% flags `geo_contributor_stats.shadow_banned = true`; shadow-banned pins are stored but excluded from consensus and rewards

### Realtime

- FR-37: New Socket.io namespace `/geo` (or prefix `geo:*`) emits: `geo:leaderboard:update`, `geo:contribution:accepted`, `geo:contribution:rewarded`, `geo:contributor:tier_up`
- FR-38: Events are documented in `docs/realtime.md` under a new Geo section
- FR-39: Existing Socket.io events and clients remain unchanged

### Frontend

- FR-40: Leaflet (with `L.CRS.Simple`) for the map canvas; panorama stays in the existing Three.js component — **canvases are separate**
- FR-41: Leaflet added as a frontend-only dependency; bundle impact budgeted at ≤ 50 KB gz
- FR-42: New i18n namespace `public/locales/{fr,en}/geo.json`; no edits to existing locale files
- FR-43: `useGeoGame` hook handles submit + result flow, mirroring `useGameGuess` but in an isolated module
- FR-44: `GeoContributorCard` is inserted into `pages/Profile.tsx` as a new block; existing cards and layout are unchanged

## Non-Goals

- No modifications to the existing "guess the game" mode, scoring, hints, leaderboard, or profile cards
- No shared leaderboard between Geo and the existing game
- No merging of Geo rewards into anything other than existing hint tokens
- No scraping of IGN, MapGenie, Nexus Mods, or other non-licensed sources
- No launch on Nintendo IP (reserved for a later phase once licensing is reviewed)
- No multi-game launch — Elden Ring only at MVP
- No mobile-optimized pinning UX at MVP (desktop-first; mobile acceptable but not polished)
- No auto-publish of machine-extracted coordinates

## Design Considerations

- Dark gaming theme, purple/pink gradient accents, matching the existing UI
- Pinning map uses a neutral dark tile style so game maps (often vivid) read clearly
- Contributor tier badges: Bronze / Silver / Gold / Diamond with distinct gradients
- Result screen visualizes guess vs. canonical with a connecting line on the map (share-ready)
- Share card generator for social: "I pinned the exact rock in Blackreach" — shareable PNG of the map reveal
- Toast notifications for `geo:contribution:rewarded` use the existing notification system

## Technical Considerations

- **Pilot title:** Elden Ring (Steam appid `1245620`, Fextralife Fandom map). Fallback: GTA V (appid `271590`)
- **Minimum seed to open mode:** ≥ 50 coordinate-tagged screenshots for the pilot game before `VITE_GEO_ENABLED` flips on in production
- **Coordinate normalization:** all `(x, y)` stored as `float` in `[0..1]` of map dimensions to survive map asset re-ups
- **Consensus algorithm versioning:** `geo_screenshot_meta.consensus_version` so we can re-run retroactively when tuning
- **License tracking:** every `geo_map` row stores `license` + `attribution`; surfaced in a new legal page section
- **IP safety:** no Nintendo titles at launch; admin-gated takedown flow for any DMCA request
- **Rate limits:** pin submission capped per user per hour via existing middleware pattern
- **Testing:** new E2E spec `geo-daily.spec.ts` mirroring `daily-game.spec.ts`; new unit tests for `geo-scoring.service.ts` and `geo-consensus.service.ts`
- **Flag rollback:** setting `VITE_GEO_ENABLED=false` must fully hide the mode with no dangling references on any existing page

## Success Metrics

- **Primary:** D7 retention of players who try Geo ≥ 2× baseline D7
- **Share rate:** ≥ 15% of completed Geo challenges result in a share-card export
- **Content flywheel:** ≥ 200 new coordinate-tagged screenshots via crowdsourcing within 30 days of launch
- **Fairness guardrail:** zero measurable change to the existing game's leaderboard score distribution (the null hypothesis must hold)
- **Reward hygiene:** < 5% of contributors flagged as `shadow_banned` within 30 days

## Rollout Plan

1. **Phase 0 — Infra (1 sprint):** migrations, repositories, services, feature flag off. No UI exposed.
2. **Phase 1 — Admin tooling:** map calibration + screenshot review panels. Admins seed ≥ 50 Elden Ring screenshots manually.
3. **Phase 2 — Ingestion workers:** `geo-map-import` + `geo-screenshot-import` run against Elden Ring. Candidates land in review queue.
4. **Phase 3 — Contribute flow behind flag:** crowdsourcing UI live for internal testers; consensus + reward workers enabled.
5. **Phase 4 — Public launch (flag on):** `/geo/daily` + leaderboard + profile badge public for Elden Ring only.
6. **Phase 5 — Measure:** 4-week metrics review against Success Metrics before adding a second game.

## Open Questions

- ~~Which Fandom wiki map do we license by default for Elden Ring — the Fextralife interactive map asset, or do we commission a clean vector redraw for IP safety?~~ **Resolved (2026-04-25)**: neither. Tier 1 registry uses `elpwc/EldenRingOnlineMap` (MIT) for the pilot. A commissioned redraw is only triggered if/when we promote Geo to a paid commercial tier, since the upstream is itself a derivative of FromSoft assets.
- Should the Geo daily challenge share a single "daily streak" with the main game, or maintain an independent Geo streak?
- Do we want a one-shot "explain my score" debug view on the result screen to build player trust in the distance formula?
- Should contributor rewards (hint tokens) be redeemable **only** in Geo mode, or in the main game too? (Default proposed: usable in both — tokens are fungible — but flag this for fairness review.)
- Do we need a per-game leaderboard split (Elden Ring leaderboard vs. global Geo leaderboard) at MVP, or only once a second game ships?
