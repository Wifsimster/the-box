import type { PublicStreamerProfile, PublicStreamerToday } from '@the-box/types'

export const SANDBOX_SLUG = 'boxbot'

const CYCLE_MS = 10 * 60 * 1_000
const PLAY_MS = 7 * 60 * 1_000
const TOTAL_SCREENSHOTS = 10
const SANDBOX_RANK = 3

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
    const progress = t / PLAY_MS
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
      countsForLeaderboard: false,
    },
  }
}
