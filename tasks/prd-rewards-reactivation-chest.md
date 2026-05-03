# PRD: Reactivation Chest

## Introduction

Players who stop playing for ≥ 7 days currently receive zero re-engagement signal beyond a generic email (if Resend is configured). This PRD adds a warm, opt-out "welcome back" chest that grants powerups when an inactive user returns.

Critical framing constraint from the design meeting: **invitation, not guilt.** No streak-shaming, no countdown, no loss-aversion language. The reward unlocks on completing one round, not on logging in — re-entry is earned through the activity itself, which is autonomy-supportive and gives Sarah a clean conversion event for the hold-out test.

## Goals

- Lift D30 of the engaged-cohort by reactivating users who churned at D7-D21
- Validate via 10% hold-out cohort with measurable kill criteria
- Ship in S effort using existing BullMQ + Resend infrastructure

## User Stories

### US-001: Detect inactive users
**Description:** As a backend engineer, I want a daily BullMQ job that flags users inactive ≥ 7 days for the next-login reward.

**Acceptance Criteria:**
- [ ] New BullMQ repeatable job `reactivation-scan` running daily at 03:00 UTC
- [ ] Scans `users.last_seen_at < now() - interval '7 days'` AND no existing `reward_grants` row with `source = 'reactivation'` and `source_ref = current ISO week`
- [ ] For each match, calls `rewardsService.grant({ userId, source: 'reactivation', sourceRef: 'reactivation:YYYY-Wxx', items: [...] })` — pre-stages the chest, idempotent
- [ ] Hold-out: 10% of eligible users (deterministic by `hash(user_id) % 10 === 0`) are flagged in `reactivation_holdouts(user_id, week)` and NOT granted; tracked for measurement only
- [ ] Job logs structured Pino events for monitoring

### US-002: Reactivation email
**Description:** As an inactive user, I want a warm email when I'm flagged, so I'm invited (not guilted) to come back.

**Acceptance Criteria:**
- [ ] If `RESEND_API_KEY` is configured, the same job sends one email per flagged user (skip hold-out)
- [ ] Subject (FR): `Le screenshot du jour t'attend` (NEVER "Tu vas perdre ta série", "Plus que X heures", "Reviens vite!")
- [ ] Subject (EN): `Today's screenshot is waiting`
- [ ] Body uses the **ban-list** from the meeting:
  - Banned verbs: *perdre, manquer, rater, oublier* (FR); *miss, lose, forget* (EN)
  - Banned patterns: countdown timers, exclamation-mark stacking, red CTAs, streak-shaming
  - Allowed tone: declarative invitation, neutral curiosity ("De nouveaux jeux ont rejoint la collection")
- [ ] One email per ISO week max — guarded via `reward_grants.source_ref` uniqueness
- [ ] Unsubscribe link in footer respects existing user comms preferences

### US-003: Claim on play
**Description:** As a returning user, I want my chest to unlock after completing one daily challenge, not just on login — so the reward earns its keep.

**Acceptance Criteria:**
- [ ] On login, `RewardsInbox` shows the staged reactivation card with copy: "Bon retour. Joue un screenshot pour ouvrir ton coffre."
- [ ] Card is in a `pending_unlock` state — claim button is disabled until the user submits at least one guess on the current daily challenge
- [ ] On first guess submission post-reactivation, backend marks the grant as `unlockable` and emits `reward:granted` (or unlocks the existing card)
- [ ] Player can then claim via the standard `RewardsInbox` flow — receives 1× hint_developer, 1× second_chance, 1× streak_freeze (provisional contents — see Open Questions)

### US-004: Hold-out measurement
**Description:** As a PM, I want a 10% hold-out cohort tracked separately so I can validate D30 lift.

**Acceptance Criteria:**
- [ ] Hold-out users get the email (warm subject) but NO chest
- [ ] Event tracking: `reactivation_email_sent`, `reactivation_chest_staged`, `reactivation_chest_unlocked`, `reactivation_chest_claimed`, with `cohort: 'treatment' | 'holdout'` property
- [ ] Admin dashboard query exposes weekly conversion: emailed → returned-to-app → completed-1-guess → claimed
- [ ] **Kill criterion:** if treatment-vs-holdout D30 lift < 3pp after 6 weeks, feature is flagged for revision

## Functional Requirements

- FR-1: New BullMQ queue `reactivation` with worker `reactivation.worker.ts` under `packages/backend/src/infrastructure/queue/workers/`
- FR-2: New table `reactivation_holdouts(user_id, week, created_at)` with PK `(user_id, week)`
- FR-3: Email template under `packages/backend/src/infrastructure/email/templates/reactivation.{fr,en}.{html,txt}.ts` (or equivalent template path matching existing Resend setup)
- FR-4: ESLint rule or CI grep against the FR ban-list in committed email copy (best-effort guard)
- FR-5: Reactivation grant uses `rewards.service.grant()` from `prd-rewards-infrastructure.md` — depends on it shipping first
- FR-6: New `pending_unlock` state on `reward_grants` (could be a `state text` column or derived from `claimed_at` + a separate `unlocked_at`) — design decision: add `unlocked_at timestamptz nullable`; claim is gated on `unlocked_at IS NOT NULL`
- FR-7: `users.last_seen_at` must be updated on every authenticated request (verify it's already wired in auth middleware; add if missing)

## Non-Goals

- No push notifications — email and in-app only
- No SMS, no third-party retargeting
- No multiple reactivation tiers (7d, 30d, 90d) in v1 — single 7d trigger
- No personalized chest contents based on player history — fixed loadout in v1
- No "your friends are playing" social bait

## Design Considerations

- Email visual: dark theme matches the app, neon purple gradient on the CTA button only, no urgency cues
- CTA button text: `Voir le screenshot` (FR), `See today's screenshot` (EN) — descriptive, not imperative
- Inbox card: `RotateCcw` icon, copy "Bon retour. Joue un screenshot pour ouvrir ton coffre."
- After unlock, copy switches to "Coffre prêt — réclame ta récompense"
- No red, no orange, no "ALERT" iconography anywhere

## Technical Considerations

- `last_seen_at` column likely needs to exist on `users`; verify and add via migration if not
- ISO week math: use existing date utility or `date-fns` `getISOWeek`
- Hold-out hash must be stable across weeks (a user is always treatment or always holdout for THIS feature) — hash on `user_id` only, NOT on `user_id + week`
- Email rate-limiting: respect Resend's per-second limits via BullMQ concurrency
- If `RESEND_API_KEY` is missing, the job should still stage chests but skip email (log warning)

## Success Metrics

- Treatment cohort D30 lift ≥ 3pp vs hold-out after 6 weeks (kill criterion)
- Reactivation chest claim rate ≥ 25% of staged chests within 14 days
- Zero copy-violation reports (post-launch QA grep on email send corpus)
- Job runs daily without failure for 4 consecutive weeks

## Open Questions

- Chest contents: 1× hint_developer + 1× second_chance + 1× streak_freeze is the proposal — confirm with game designer once those item_keys exist (depends on `prd-rewards-new-powerups.md` and `prd-rewards-streak-freeze.md`)
- Should we exclude users who never completed onboarding (registered but never played)? Default: yes, exclude `total_games_played === 0`
- Re-trigger cadence: if a user reactivates then churns again, when do they get another chest? Default: every 4 weeks max (`source_ref` includes month-anchored cooldown)
