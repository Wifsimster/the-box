import type { PublicStreamerProfile, PublicStreamerToday } from '@the-box/types'

// Sandbox streamer for the public API — slug `boxbot`.
//
// Integrators need something live to build a chat command / overlay against
// without waiting for a real player to start today's daily. `boxbot` is that
// target: a streamer whose session is always doing *something*.
//
// Design: this is a PURE FUNCTION OF THE CLOCK. There is no `boxbot` row in
// the `user` table, no `game_sessions` row, no replay worker. State is
// computed from `Date.now() % CYCLE_MS`. Consequences, all deliberate:
//   - Zero infrastructure. No migration, no BullMQ job, no Redis key.
//   - Zero blast radius. A synthetic user in the real game tables would
//     leak into `/leaderboard/*`, percentile math, and player counts. By
//     never touching those tables, the sandbox cannot contaminate them.
//   - Deterministic + trivially testable. `sandboxState(fixedTimestamp)`
//     is referentially transparent.
//
// The cycle: a 10-minute loop. Minutes 0–7 the session is `in_progress`
// with a climbing score; minutes 7–10 it sits `completed`; then it repeats.

export const SANDBOX_SLUG = 'boxbot'

const CYCLE_MS = 10 * 60 * 1_000 // full loop
const PLAY_MS = 7 * 60 * 1_000 // in_progress phase length
const TOTAL_SCREENSHOTS = 10
const SANDBOX_RANK = 3 // demo rank shown once the session completes

// Slugs a real user may never claim. `boxbot` MUST be here — the public
// routes short-circuit it to this simulation, so a DB user owning that
// slug would be permanently shadowed. The rest are reserved as hygiene
// (they read as system/path-like identifiers).
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  SANDBOX_SLUG,
  'admin',
  'api',
  'the-box',
  'thebox',
  'streamers',
  'webhooks',
])

export function isSandboxSlug(slug: string): boolean {
  return slug.toLowerCase() === SANDBOX_SLUG
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase())
}

export interface SandboxState {
  status: 'in_progress' | 'completed'
  score: number
  screenshotsDone: number
  rank: number | null
  tier: number
  startedAt: string
  completedAt: string | null
}

// Final score wobbles per cycle so an integrator watching across loops
// doesn't see the exact same number every 10 minutes — makes the demo
// read as "alive" rather than frozen.
function cycleFinalScore(cycleIndex: number): number {
  return 7_400 + (cycleIndex % 7) * 90
}

export function sandboxState(now: number = Date.now()): SandboxState {
  const t = now % CYCLE_MS
  const cycleStart = now - t
  const cycleIndex = Math.floor(cycleStart / CYCLE_MS)
  const finalScore = cycleFinalScore(cycleIndex)
  const startedAt = new Date(cycleStart).toISOString()

  if (t < PLAY_MS) {
    const progress = t / PLAY_MS // 0 .. <1
    // Climbs 0 → 9 during play; the 10th screenshot lands with completion.
    const screenshotsDone = Math.min(
      TOTAL_SCREENSHOTS - 1,
      Math.floor(progress * TOTAL_SCREENSHOTS),
    )
    const score = Math.round((finalScore / TOTAL_SCREENSHOTS) * screenshotsDone)
    return {
      status: 'in_progress',
      score,
      screenshotsDone,
      rank: null,
      tier: screenshotsDone < 5 ? 1 : 2,
      startedAt,
      completedAt: null,
    }
  }

  return {
    status: 'completed',
    score: finalScore,
    screenshotsDone: TOTAL_SCREENSHOTS,
    rank: SANDBOX_RANK,
    tier: 2,
    startedAt,
    completedAt: new Date(cycleStart + PLAY_MS).toISOString(),
  }
}

export function sandboxProfile(now: number = Date.now()): PublicStreamerProfile {
  const s = sandboxState(now)
  return {
    slug: SANDBOX_SLUG,
    displayName: 'BoxBot',
    avatarUrl: null,
    // Static demo stats — large enough to look like a seasoned player.
    currentStreak: 42,
    longestStreak: 88,
    totalScore: 318_400,
    gamesPlayed: 365,
    today: {
      score: s.score,
      rank: s.rank,
      completed: s.status === 'completed',
    },
  }
}

export function sandboxToday(now: number = Date.now()): PublicStreamerToday {
  const s = sandboxState(now)
  return {
    slug: SANDBOX_SLUG,
    status: s.status,
    session: {
      score: s.score,
      screenshotsDone: s.screenshotsDone,
      totalScreenshots: TOTAL_SCREENSHOTS,
      tier: s.tier,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      rank: s.rank,
      // Always false — the sandbox is explicitly not a ranked session.
      countsForLeaderboard: false,
    },
  }
}
