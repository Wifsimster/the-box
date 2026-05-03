# PRD: Account Milestones

## Introduction

The Box has ~50 achievements across speed, accuracy, score, streak, genre, completion, competitive — including 22 beginner-tier achievements. What's missing is **mastery-anchored milestones** that mark sustained engagement: "100 guesses", "500 guesses", "1 year of play", "100 daily challenges completed". These are competence markers tied to the player's accumulated mastery, not to a calendar.

Per the meeting (Dr. Nour): milestones are SDT-clean — pure competence + relatedness signaling, no FOMO, no deadline. They piggyback the existing achievement infrastructure and are essentially a new `criteria_type` plus seed data.

## Goals

- Add 6-8 long-tail mastery milestones that fire over months/years of play
- Reuse the existing achievement evaluation pipeline (no new evaluator)
- Surface in `RewardsInbox` as a celebration card, in addition to the existing achievement toast

## User Stories

### US-001: Define milestone criteria type
**Description:** As a backend engineer, I want a `milestone` criteria type in the achievement service so milestones evaluate alongside other achievements.

**Acceptance Criteria:**
- [ ] New `criteria_type='milestone'` accepted by `achievement.service.ts`
- [ ] `progressMax` semantics reused (e.g. `100` for "100 guesses")
- [ ] Counter source per milestone defined in `criteria_value`: `total_guesses`, `total_correct_guesses`, `total_daily_completed`, `account_age_days`
- [ ] Evaluation hook fires from existing checkpoints in game.service (post-guess) and daily-login.service (post-login for `account_age_days`)

### US-002: Seed initial milestones
**Description:** As a player, I want to be celebrated for sustained play, so my history feels meaningful.

**Acceptance Criteria:** seed migration creates these milestones (FR labels first):
- [ ] **Premier centenaire** — 100 total guesses, 25 pts, beginner tier
- [ ] **Demi-millier** — 500 total guesses, 75 pts
- [ ] **Mille fois** — 1000 total guesses, 150 pts
- [ ] **Encyclopédie vivante II** — 250 correct guesses, 100 pts
- [ ] **Cent défis** — 100 daily challenges completed (not catch-up), 200 pts
- [ ] **Un an avec nous** — 365 days since registration, 300 pts, hidden until unlocked
- [ ] **Deux ans avec nous** — 730 days, 500 pts, hidden
- [ ] **Sphinx** — 50 perfect-score sessions (2000 pts), 250 pts, hidden
- [ ] All seeded with `is_beginner: false` (except first centenaire), placed under category `mastery` (new category — extend the enum/string list)

### US-003: Grant flow integrates with rewards inbox
**Description:** As a player, I want a milestone unlock to land in my `RewardsInbox` as a celebration card AND fire a toast in-session if unlocked during play.

**Acceptance Criteria:**
- [ ] On milestone unlock during play: existing achievement toast fires (in-session signal)
- [ ] On milestone unlock outside play (e.g., `account_age_days` evaluated on login): `rewardsService.grant({ source: 'milestone', sourceRef: 'milestone:<criteria_id>', items: [...] })` is called and a card lands in `RewardsInbox`
- [ ] Milestone reward payload: achievement points (existing) + 1 cosmetic title token (e.g. `title:century`) for select tiers — see vague 2 cosmetics PRD
- [ ] Idempotent on `(user_id, criteria_id)` — already enforced by existing `user_achievements` unique index; the grant goes through the new `reward_grants` table for inbox surfacing only

### US-004: Account-age scheduled check
**Description:** As a backend engineer, I want a daily BullMQ job that evaluates account-age milestones for active users.

**Acceptance Criteria:**
- [ ] BullMQ repeatable job `milestone-account-age` running daily at 04:00 UTC
- [ ] Scans `users.created_at` and finds users who crossed a milestone day (`365`, `730`) since last run
- [ ] Calls the achievement evaluator with `criteria_type='milestone'`, source `account_age_days`
- [ ] Idempotent via existing `user_achievements` constraint + `reward_grants.source_ref`

## Functional Requirements

- FR-1: Migration `YYYYMMDD_milestone_achievements.ts` adds the 8 seeded milestones
- FR-2: `achievement.service.ts` extension to evaluate `milestone` criteria_type — pure addition, no breaking change
- FR-3: New BullMQ job `milestone-account-age.worker.ts`
- FR-4: All milestone unlocks call `rewardsService.grant()` so they appear in `RewardsInbox` (depends on `prd-rewards-infrastructure.md`)
- FR-5: Existing `AchievementCard` reused for the inbox milestone card — no new component required

## Non-Goals

- No "milestone shop" — milestones are signal, not currency
- No daily/weekly milestones — these belong in achievements; milestones are long-tail only
- No social-share modal on milestone unlock in v1 (defer)
- No anniversary email (reactivation owns the email channel)
- No multi-tier "1 year, 2 years, 3 years…" treadmill beyond the seeded set; future tiers added as needed

## Design Considerations

- Inbox card: gold/amber accent (distinct from rest), `Trophy` icon
- Copy in FR: declarative — "Tu as atteint 100 défis quotidiens. Bravo." NOT "Tu as débloqué…!"
- Hidden milestones (`is_hidden=true`) appear in profile only after unlock (existing pattern)

## Technical Considerations

- New `category='mastery'` may require enum extension or string-list update — confirm current category storage in `achievement.repository.ts`
- For perfect-score milestones (`Sphinx`), counter must be incremented in `game.service.ts` at session-end when score === 2000
- Account-age computation must be DST-safe — use UTC day arithmetic
- Existing `user_achievements.unlocked_at` is the source of truth for "did this fire" — `reward_grants` is purely the surface mechanism

## Success Metrics

- ≥ 60% of players who reach 100 guesses claim the corresponding milestone within 24h
- D7→D30 conversion rate for users who unlock at least one milestone ≥ +5pp vs non-unlockers (correlation, not causation — separate from reactivation A/B)
- Zero duplicate milestone grants in 4 weeks of operation

## Open Questions

- Should `total_guesses` exclude catch-up mode? Defaulting to "include all" — catch-up is real play
- Should milestone titles be unique cosmetic items granted via `prd-rewards-cosmetics` (vague 2)? Soft yes — design vague-2 catalog with ~3 milestone-locked titles
- Is there a max-tier milestone we should NOT add (to avoid implying infinite grind)? Default: cap at 1000 guesses + 2 years — anything beyond would feel like a treadmill
