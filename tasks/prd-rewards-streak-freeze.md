# PRD: Streak Freeze

## Introduction

Daily-login streaks today work like every other game's streaks: miss a day, lose your progress, start over at 1. This is the **sunk-cost trap** Dr. Nour flagged in the meeting — the streak becomes a punishment-avoidance mechanic instead of a celebration of habit. Adults with real-life schedules (the casual French audience) drop off after the first painful reset and never come back.

Duolingo solved this with the streak freeze: an item that auto-consumes if you miss a day, preserving the streak. Per the meeting's ethics constraint, **the streak freeze is auto-granted, never sold**. Selling it rebuilds the trap.

This is the only NEW pick that emerged in round 2 (proposed by Dr. Nour, acknowledged by the room).

## Goals

- Defuse the streak-loss sunk-cost trap so the streak system rewards genuine love instead of guilt
- Auto-grant 1-2 freezes per month so missing a day is forgivable but not free
- Use only existing inventory infrastructure — zero new tables

## User Stories

### US-001: New `streak_freeze` powerup item key
**Description:** As a backend engineer, I want a `streak_freeze` item key in inventory so freezes can be granted, stored, and consumed.

**Acceptance Criteria:**
- [ ] New `item_type='powerup'`, `item_key='streak_freeze'` in catalog seed
- [ ] Stackable in `user_inventory` like other powerups
- [ ] Cap inventory at 2 freezes simultaneously per user (enforced in `rewards.service.grant()` for this item_key — soft cap, excess grants are no-op'd with a logged event)

### US-002: Auto-grant cadence
**Description:** As a player, I want freezes to appear automatically so I never feel I have to "earn the right" to miss a day.

**Acceptance Criteria:**
- [ ] BullMQ repeatable job `streak-freeze-grant` running on the 1st of each month at 06:00 UTC
- [ ] Grants 1× `streak_freeze` to every user with `last_seen_at >= now() - interval '60 days'` (active-ish)
- [ ] Idempotent via `reward_grants.source_ref = 'streak_freeze:YYYY-MM'`
- [ ] Lands in `RewardsInbox` as a card: "Une protection de série pour ce mois-ci."
- [ ] Cap: do not grant if user already has ≥ 2 freezes

### US-003: Auto-consume on missed day
**Description:** As a player who missed a day, I want my freeze to auto-consume so my streak survives without my intervention.

**Acceptance Criteria:**
- [ ] On daily-login service evaluation: when a user logs in and would otherwise reset their streak (`last_login_at < now() - interval '1 day' - tolerance`), check inventory for ≥ 1 `streak_freeze`
- [ ] If yes: decrement by 1, preserve `current_streak`, log `streak_freeze_consumed` event with the missed date
- [ ] Player sees a card in their `RewardsInbox` (not a blocking modal): "Ta série a été protégée hier — il te reste N protection(s)."
- [ ] If multiple consecutive missed days but only 1 freeze: consume 1 to cover 1 day, then reset the streak normally for the remaining gap (one freeze = one day, period)
- [ ] If player has 0 freezes: existing reset behavior is unchanged

### US-004: Profile visibility
**Description:** As a player, I want to see my freeze count in the profile so I can plan my breaks.

**Acceptance Criteria:**
- [ ] Streak component on `Profile.tsx` shows: "Série: X jours" + small snowflake icon "× N" indicating freezes available
- [ ] Hovering/tapping the snowflake explains: "Une protection est consommée automatiquement si tu manques un jour."
- [ ] No countdown, no urgency cue, no "use it before…" language

### US-005: NEVER for sale
**Description:** As a product team, I want a hard rule that streak freezes are never purchasable, so we don't recreate the sunk-cost trap.

**Acceptance Criteria:**
- [ ] `streak_freeze` is excluded from any future shop catalog (CI grep test or explicit exclusion list)
- [ ] If a future "shop" PRD lands, it must explicitly exclude `streak_freeze` in the SKU allowlist
- [ ] Documented in `docs/game-flow.md` as an architectural rule

## Functional Requirements

- FR-1: Seed migration `YYYYMMDD_streak_freeze.ts` adds the new item_key + (optional) catalog entry
- FR-2: New BullMQ job `streak-freeze-grant.worker.ts` under `packages/backend/src/infrastructure/queue/workers/`
- FR-3: `daily-login.service.ts` extension: `evaluateStreakWithFreeze(userId, now)` checks inventory before reset
- FR-4: `Profile.tsx` extension to render freeze count beside streak
- FR-5: All grants flow through `rewardsService.grant()` for inbox surfacing (depends on `prd-rewards-infrastructure.md`)
- FR-6: `docs/game-flow.md` documents the auto-consume rule + non-purchasable invariant

## Non-Goals

- No purchasable freezes — ever
- No "premium" tier with more freezes
- No retroactive freeze application on already-broken streaks (one chance, then reset)
- No streak-restore via emergency claim (would re-introduce loss-aversion guilt)
- No social-share / streak-flex feature in v1

## Design Considerations

- Snowflake icon `Snowflake` from Lucide
- Freeze count rendered inline with streak count, never as a separate "streak insurance" sub-component
- Color: cool blue tint (distinct from the warm orange of streaks themselves) so the meaning is glanceable
- Auto-consume notification: the card in `RewardsInbox` is informational only — no "Réclamer" button (already happened, just keeping the player informed)

## Technical Considerations

- Streak evaluation runs in `daily-login.service.ts` — currently triggered on first login of the day. The freeze check inserts BEFORE the streak-reset branch
- "Tolerance" for what counts as a missed day: leave existing TZ logic alone; this PRD does not change streak-day boundaries
- Concurrency: if a player logs in twice in the same second on two devices, only one freeze should consume — guarded by a transaction + `SELECT FOR UPDATE` on the user row, or by atomic decrement in `inventory.repository.ts`
- Edge case: user with 0 logins for 30+ days returns. They consume 1 freeze for the immediately-prior day, then reset. Don't loop-consume across the entire gap

## Success Metrics

- Streak-reset rate decreases by ≥ 20% in the 4 weeks following launch (treatment: any user with ≥ 1 freeze available)
- D14 retention of users who consume at least 1 freeze ≥ +5pp vs users who reset without consuming (correlation signal — these players were going to churn at reset)
- Zero support tickets matching "my streak should have been protected"

## Open Questions

- Should the first freeze of a player's life be granted on registration (immediate forgiveness)? Default: no, grant on the next monthly cron — keeps the cadence simple
- Should the 2-freeze cap be visible in the UI or hidden? Default: visible — knowing the cap reduces anxiety about "wasting" excess grants
- Should reactivation chest include a freeze? Yes (already proposed in `prd-rewards-reactivation-chest.md`) — gives a returning player immediate insulation
