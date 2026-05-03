# PRD: Rewards Infrastructure (`reward_grants` + `RewardsInbox`)

## Introduction

Architectural pre-requisite for the rewards expansion (vague 1). Today, rewards are granted ad-hoc: daily-login writes to `user_inventory`, achievements toast on unlock, the ambassador badge is granted from referral. This is fine at small scale but breaks once we add 4 new reward streams (reactivation, milestones, new powerups, streak freeze) plus future streams (leaderboard payouts, cosmetics).

Two problems to solve before any new reward ships:

1. **Idempotency**: BullMQ workers retry. Without a unique-grant guard, a retried `reactivation:2026-W18` job double-grants the chest.
2. **Notification saturation**: 50 achievements already toast. Adding 4+ streams will create UI noise that cannibalizes salience. We need a single user-facing "rewards inbox".

This PRD blocks every other vague-1 PRD.

## Goals

- Provide a single idempotent grant path used by all reward sources (daily-login, achievement, reactivation, milestone, payout, cosmetic, streak-freeze).
- Provide a single UI surface (`RewardsInbox`) for asynchronous reward notifications, leaving toasts for in-session events only.
- Avoid migrations to `users.total_score` semantics — payouts and chests grant items, not points.

## User Stories

### US-001: Grant idempotency
**Description:** As a backend engineer, I want every reward grant to be idempotent on `(source, source_ref)`, so that BullMQ retries cannot double-grant.

**Acceptance Criteria:**
- [ ] New table `reward_grants(id uuid pk, user_id uuid fk, source text, source_ref text, payload jsonb, granted_at timestamptz)` with `UNIQUE (user_id, source, source_ref)`
- [ ] New domain helper `rewardsService.grant({ userId, source, sourceRef, items })` that:
  - opens a transaction
  - inserts into `reward_grants` (returns no-op if conflict)
  - upserts each item into `user_inventory`
  - emits `reward:granted` over Socket.io to room `user:${userId}` AFTER commit
- [ ] BullMQ workers calling `grant()` twice for the same `source_ref` produce exactly one inventory delta and one socket emit
- [ ] Migration date-prefixed `YYYYMMDD_reward_grants.ts` per project convention
- [ ] Typecheck passes (`npm run build`)
- [ ] Unit tests for the helper covering idempotency + transaction rollback

### US-002: Socket event for grants
**Description:** As a frontend engineer, I want one consistent `reward:granted` Socket.io event so I can update UI without polling.

**Acceptance Criteria:**
- [ ] Event name: `reward:granted`
- [ ] Payload: `{ rewardId: uuid, source: 'reactivation' | 'milestone' | 'powerup_drop' | 'streak_freeze' | 'daily_login' | 'leaderboard_payout' | 'cosmetic_unlock', items: Array<{ itemType, itemKey, quantity }>, grantedAt: ISO8601 }`
- [ ] Emitted to private room `user:${userId}` only — never broadcast
- [ ] Emit happens AFTER db commit (transactional outbox-lite acceptable: emit in `try` after commit, reconcile on next login if missed)
- [ ] Type added to `@the-box/types/src/index.ts`, types package rebuilt

### US-003: Rewards inbox surface
**Description:** As a player, I want a single bell icon in the header that collects asynchronous rewards, so I'm not interrupted by 5 toasts on login.

**Acceptance Criteria:**
- [ ] New `RewardsInbox` drawer component triggered by a bell icon in `Header.tsx`, beside the existing daily-login badge
- [ ] Numeric badge on the bell shows count of unclaimed rewards
- [ ] Drawer lists reward cards stacked by `grantedAt` desc, grouped by source
- [ ] Each card has its own "Réclamer" CTA that calls `POST /api/rewards/:rewardId/claim`
- [ ] After claim: card shows confetti micro-animation (Framer Motion), then disappears on next drawer open
- [ ] In-session triggers (achievement unlock during a guess) keep their existing toast — only async rewards go into the inbox
- [ ] DailyLoginModal continues to auto-open for the actual daily login; everything else queues silently in the inbox
- [ ] Mobile: drawer is full-height, dismissable via swipe-down
- [ ] i18n keys under `public/locales/{fr,en}/rewards.json`

### US-004: Claim endpoint
**Description:** As a backend engineer, I want a single claim endpoint regardless of reward source.

**Acceptance Criteria:**
- [ ] `POST /api/rewards/:rewardId/claim` endpoint, session-authenticated
- [ ] Validates `reward_grants.user_id === session user`
- [ ] Marks `reward_grants.claimed_at = now()` (new column)
- [ ] Idempotent: re-claim is a no-op returning 200 with current state
- [ ] Returns the reward payload + updated inventory snapshot
- [ ] Zod validation, request logged

## Functional Requirements

- FR-1: Migration `YYYYMMDD_reward_grants.ts` creates `reward_grants` table per US-001 + adds `claimed_at timestamptz` nullable
- FR-2: `packages/backend/src/domain/services/rewards.service.ts` exposes `grant()`, `claim()`, `listUnclaimed(userId)`
- FR-3: `packages/backend/src/infrastructure/repositories/reward.repository.ts` handles SQL through Knex/Kysely
- FR-4: `packages/backend/src/presentation/routes/rewards.routes.ts` mounts `/api/rewards/*` (list, claim)
- FR-5: `packages/frontend/src/components/rewards/RewardsInbox.tsx`, `RewardCard.tsx`
- FR-6: `packages/frontend/src/stores/rewardsStore.ts` (Zustand) holds unclaimed list + claim action, listens to `reward:granted` socket
- FR-7: `Header.tsx` mounts the bell icon + drawer trigger
- FR-8: All reward types extend a discriminated union in `@the-box/types/src/index.ts`

## Non-Goals

- No `points_ledger` table. We are not shipping XP shop or XP multipliers in vague 1, so no transactional ledger on `total_score` is required. Revisit if/when a shop returns to the roadmap.
- No reward expiry in v1 (claimed-or-not, no time-bomb). Defer.
- No bulk claim-all button in v1 — encourage card-level engagement.
- No email notifications from the inbox itself — reactivation has its own email path (see separate PRD).

## Design Considerations

- Bell icon: Lucide `Bell` with neon-purple badge dot when unclaimed > 0
- Drawer: dark-gaming theme, purple/pink accents, matches existing `DailyLoginModal` styling
- Card: icon (per source) + title + subtitle + "Réclamer" button
- Confetti on claim: reuse Framer Motion patterns from achievement toast
- Source icons: `RotateCcw` (reactivation), `Trophy` (milestone), `Wand2` (powerup_drop), `Snowflake` (streak_freeze), `Calendar` (daily_login), `Crown` (leaderboard_payout), `Palette` (cosmetic_unlock)

## Technical Considerations

- `source_ref` is a string keyed by reward type:
  - `reactivation:YYYY-Wxx` (ISO week)
  - `milestone:games_played_100`
  - `powerup_drop:daily_login_day_3` (already covered by daily-login but normalized)
  - `streak_freeze:YYYY-MM` (one per month max)
- Socket reconnection: on connect, frontend calls `GET /api/rewards/unclaimed` to reconcile any emit missed during disconnect
- Migration is forward-only; no rollback for the `reward_grants` table (data is grant history)
- Existing daily-login grants can stay on their current path; only NEW streams are required to use `rewardsService.grant()`. Migration of daily-login to the new path is optional cleanup, not required

## Success Metrics

- Zero double-grant incidents in BullMQ retry logs over the first 4 weeks
- `RewardsInbox` claim rate ≥ 70% within 7 days of grant (claim is the engagement signal)
- No support tickets matching "I didn't get my reward" attributable to this layer
- Notification-fatigue regression: daily-login modal session abandon rate stays within ±2pp of baseline

## Open Questions

- Should inbox auto-claim trivial rewards (e.g., 50-point chest) on first inbox open, leaving only "interesting" rewards as cards? Default: no, claim is the engagement event.
- Do we surface `reward_grants` history in the user profile (an "all rewards earned" timeline)? Default: not in v1, can add later from existing data.
