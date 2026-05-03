# PRD: New Powerups (`hint_developer`, `hint_genre`, `second_chance`) + `PowerupTray`

## Introduction

The current powerup catalog has exactly two items: `hint_year` and `hint_publisher`. Three new powerups are added to deepen the strategy without changing the core "everyone plays the same screenshot" social contract.

Two powerups were **explicitly rejected** in the meeting and must NOT be added in v1: `freeze_timer` and `skip`. They break the daily-comparison integrity that is The Box's social hook.

The game screen is already crowded (3 hint buttons + viewer + input + timer + submit). Per Leo's constraint, all hints get consolidated into a `PowerupTray` bottom sheet. `second_chance` does not get a button — it auto-prompts via a modal after a wrong guess, where the player can choose to spend one for a retry with a score-cap penalty.

## Goals

- Add 3 new powerups using only `user_inventory` seed data + game-flow logic — zero new tables
- Consolidate hints into a clean `PowerupTray` so the game screen survives mobile
- Preserve the daily-puzzle social contract (no skipping, no time manipulation)

## User Stories

### US-001: New powerup item keys
**Description:** As a backend engineer, I want three new powerup `item_key` values seeded so they can flow through inventory.

**Acceptance Criteria:**
- [ ] `hint_developer` — reveals the game's developer (one-line text)
- [ ] `hint_genre` — reveals the game's primary genre tag(s)
- [ ] `second_chance` — allows a re-guess after a wrong answer, with score capped at 70% of remaining max
- [ ] All three are `item_type='powerup'`
- [ ] Seed migration adds them to `inventory_items` (or equivalent catalog table; if no catalog table exists, the seed is i18n + icon mapping only)

### US-002: Powerup tray UI
**Description:** As a mobile player, I want one consolidated tray for all powerups so the game screen isn't a wall of buttons.

**Acceptance Criteria:**
- [ ] New `PowerupTray.tsx` bottom sheet on `Game.tsx`, opened by a single "Indices" button replacing the current 3 hint buttons
- [ ] Tray groups powerups by category: **Indices** (hint_year, hint_publisher, hint_developer, hint_genre) and **Vie** (second_chance)
- [ ] Each row shows: icon, name (i18n), tooltip ("Révèle l'année de sortie"), quantity owned, "Utiliser" button (disabled if 0)
- [ ] On use, tray closes and hint chip appears in the existing hint-display zone above the input
- [ ] Mobile: bottom sheet uses existing `useKeyboardHeight` hook to avoid keyboard collision
- [ ] Desktop: tray opens as a side popover anchored to the "Indices" button
- [ ] i18n keys under `public/locales/{fr,en}/game.json` (~18 new strings)

### US-003: Hint resolvers
**Description:** As a backend engineer, I want hint values resolved server-side so the client cannot fabricate hints.

**Acceptance Criteria:**
- [ ] `POST /api/game/hint` endpoint accepts `{ challengeId, slot, hintType: 'developer' | 'genre' }`
- [ ] Validates user has ≥ 1 of the corresponding `item_key` in `user_inventory`
- [ ] Decrements inventory atomically (existing `inventory.repository.ts` pattern)
- [ ] Returns the resolved hint string sourced from the game record
- [ ] Existing `hint_year` / `hint_publisher` paths refactored to share the same endpoint shape (NICE-to-have, not blocking)
- [ ] Server-side audit: hint usage logged to existing scoring/session record so leaderboard scoring can apply hint penalties consistently

### US-004: Second-chance modal
**Description:** As a player who guessed wrong, I want a one-tap option to spend a `second_chance` and retry, so I'm rewarded for owning the powerup without pre-game friction.

**Acceptance Criteria:**
- [ ] After a wrong guess, IF the player has ≥ 1 `second_chance` in inventory AND has not yet used one this challenge slot, a modal appears: "Tu veux retenter ? Score plafonné à 70 %."
- [ ] Modal options: "Retenter (-1 vie)" (primary) / "Passer" (secondary)
- [ ] On retry: `game.service.ts` updates the active session to allow exactly one re-guess on this slot, with a `scoreCap = 0.7 * remainingMaxScore` flag stored on the session record
- [ ] On success during retry: score is capped at `scoreCap`
- [ ] On failure during retry: slot is marked failed normally
- [ ] Max one `second_chance` per challenge slot per session (enforced server-side)
- [ ] Modal is dismissable; dismissal does NOT consume the powerup

### US-005: Daily-login + reactivation drops
**Description:** As a player, I want occasional drops of the new powerups via existing reward streams.

**Acceptance Criteria:**
- [ ] `daily_login_rewards` seed updated: day 4 swaps "2× hint_year" for "1× hint_year + 1× hint_developer"; day 7 legendary chest gains "+1× hint_genre + 1× second_chance"
- [ ] Reactivation chest contents updated in `prd-rewards-reactivation-chest.md` to include 1× hint_developer + 1× second_chance (+1× streak_freeze from its own PRD)
- [ ] Referral rewards extended (referrer +1× hint_genre, referee +1× hint_developer) — minor balance tweak

## Functional Requirements

- FR-1: Seed migration `YYYYMMDD_new_powerups.ts` adds catalog entries + updates `daily_login_rewards` cycle
- FR-2: `packages/frontend/src/components/game/PowerupTray.tsx`, `PowerupRow.tsx`
- FR-3: `packages/frontend/src/components/game/SecondChanceModal.tsx`
- FR-4: `packages/backend/src/domain/services/game.service.ts` — extend with `requestHint`, `requestSecondChance`, score-cap math
- FR-5: `packages/backend/src/presentation/routes/game.routes.ts` — `/api/game/hint`, `/api/game/second-chance` (or fold under existing routes consistently)
- FR-6: `@the-box/types/src/index.ts` — extend `PowerupKey` union with the three new values
- FR-7: Existing 3 hint buttons removed from `Game.tsx`; replaced by single "Indices" trigger

## Non-Goals

- No `freeze_timer` powerup (rejected — breaks shared-time social contract)
- No `skip` powerup (rejected — kills the core loop)
- No pre-game powerup loadout selector (rejected — friction wall for casual audience; revisit only if data shows value)
- No powerup trading or gifting between users
- No buying powerups — they are earned only via daily login, referral, milestones, reactivation

## Design Considerations

- "Indices" button: visually distinct from submit, neon purple, badge counter showing total powerups owned
- Tray opens with Framer Motion slide-up
- `second_chance` icon: `Heart` or `RotateCcw`; modal copy is invitational, not loss-framed
- Score-cap visual: when retry is active, the "max score" indicator shows the capped value with a clear "70 %" sub-label

## Technical Considerations

- Score-cap math lives in `domain/services/scoring.service.ts` so it stays testable
- Server-side enforcement of "max one second_chance per slot" via a flag on the active session record (e.g., `second_chance_used_at`)
- `useGameGuess` hook updated to detect wrong guess + inventory > 0 + slot not yet retried → trigger modal
- Race condition: if the server processes a retry guess while the modal is opening, the second guess uses the same retry token — atomic via session record state machine
- Existing hint-usage events on the session record are extended with `hint_type` enum

## Success Metrics

- Powerup-tray usage rate ≥ 30% of sessions within 4 weeks (kill criterion: tray adoption)
- `second_chance` usage rate ≥ 15% of wrong-guess events when player owns the powerup
- Average session score distribution widens by ≥ 3% std-dev for new players (more strategic variation)
- No regression in mobile session-completion rate (kill criterion: tray UX)

## Open Questions

- Should `hint_genre` reveal one tag or all tags? Default: primary tag only (most discriminative, least info-leak)
- `second_chance` score cap — 70% is the proposal; A/B between 60% / 70% / 80% if data suggests caprate is too generous
- Should the tray show locked (0-quantity) powerups grayed-out as discoverability, or hide them? Default: show them grayed with "Comment l'obtenir ?" tooltip linking to daily-login
