import { Router } from 'express'
import { z } from 'zod'
import { db } from '../../infrastructure/database/connection.js'
import { challengeRepository } from '../../infrastructure/repositories/challenge.repository.js'
import { leaderboardRepository } from '../../infrastructure/repositories/leaderboard.repository.js'
import { logger } from '../../infrastructure/logger/logger.js'
import {
  publicApiCors,
  publicApiRateLimit,
  optionalApiKey,
} from '../middleware/public-api.middleware.js'
import { validateQuery } from '../middleware/validation.middleware.js'
import type {
  LeaderboardEntry,
  MonthlyLeaderboardEntry,
  PublicChallengeToday,
  PublicLeaderboardEntry,
  PublicStreamerProfile,
  PublicStreamerToday,
} from '@the-box/types'

// Public, opt-in, key-authenticated read API for streamer integrations.
// Mounted at /api/public/v1. Deliberately separate from /api/* — no Better
// Auth middleware on this tree, wide-open CORS, in-memory rate-limit bucket.
//
// Hard rules enforced here:
//   1. A streamer is only visible if their `public_profile_enabled` flag is true.
//   2. Cross-account reads return the same data as anonymous reads — keys
//      identify YOU, never elevate access to someone else's data.
//   3. No screenshot bytes, no answers, no current-screenshot id leak.

const router = Router()

// Order matters: CORS must run first (it short-circuits OPTIONS),
// then the key-attachment step before rate-limit (so keyed callers
// get the keyed quota), then rate-limit.
router.use(publicApiCors)
router.use(optionalApiKey())
router.use(publicApiRateLimit)

const log = logger.child({ router: 'public-v1' })

// Mirrors the constants the game service uses internally. Hoisted here so
// chat overlays can show "scoring starts at 1000, decays at 2/sec" without
// us exposing a config endpoint.
const SCORING_CONFIG = { initialScore: 1000, decayRate: 2 } as const
const TOTAL_SCREENSHOTS = 10

const SLUG_RE = /^[a-z0-9_-]{3,32}$/

function todayDate(): string {
  return new Date().toISOString().split('T')[0]!
}

// One-line chat formatter used by both the profile endpoint's `?format=chat`
// path and (eventually) the webhook delivery body. Keeps shapes consistent.
function chatLine(profile: PublicStreamerProfile, opts: { emoji: boolean }): string {
  const prefix = opts.emoji ? '🎮 ' : ''
  const today = profile.today
  const todayStr = today
    ? `Today: ${today.score.toLocaleString()} pts${today.rank ? ` (#${today.rank})` : ''}`
    : `Today: not played yet`
  return `${prefix}@${profile.displayName} · ${todayStr} · Streak: ${profile.currentStreak}d`
}

// ─────────────────────────────────────────────────────────────────────
// GET /api/public/v1/challenge/today
// ─────────────────────────────────────────────────────────────────────
router.get('/challenge/today', async (_req, res, next) => {
  try {
    const date = todayDate()
    const challenge = await challengeRepository.findByDate(date)
    if (!challenge) {
      res.status(404).json({
        success: false,
        error: { code: 'NO_CHALLENGE', message: 'No challenge available today' },
      })
      return
    }
    const data: PublicChallengeToday = {
      date: challenge.challenge_date,
      totalScreenshots: TOTAL_SCREENSHOTS,
      scoringConfig: { ...SCORING_CONFIG },
    }
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// GET /api/public/v1/streamers/:slug
//
// Supports `?format=chat&emoji=0` for one-line Nightbot-friendly output.
// ─────────────────────────────────────────────────────────────────────

const profileQuerySchema = z.object({
  format: z.enum(['json', 'chat']).optional(),
  emoji: z.enum(['0', '1']).optional(),
})

interface PublicStreamerRow {
  id: string
  public_slug: string
  display_name: string | null
  username: string | null
  avatar_url: string | null
  current_streak: number
  longest_streak: number
  total_score: number
}

async function findPublicStreamer(slug: string): Promise<PublicStreamerRow | null> {
  const row = await db('user')
    .where('public_slug', slug)
    .andWhere('public_profile_enabled', true)
    .select<PublicStreamerRow>(
      'id',
      'public_slug',
      'display_name',
      'username',
      'avatar_url',
      'current_streak',
      'longest_streak',
      'total_score'
    )
    .first()
  return row ?? null
}

async function buildStreamerProfile(row: PublicStreamerRow): Promise<PublicStreamerProfile> {
  const date = todayDate()
  const challenge = await challengeRepository.findByDate(date)

  const gamesPlayedRow = await db('game_sessions')
    .where('user_id', row.id)
    .andWhere('is_completed', true)
    .andWhere('is_catch_up', false)
    .count<{ count: string }[]>('id as count')
    .first()

  let today: PublicStreamerProfile['today'] = null
  if (challenge) {
    const session = await db('game_sessions')
      .where('user_id', row.id)
      .andWhere('daily_challenge_id', challenge.id)
      .andWhere('is_catch_up', false)
      .select<{
        total_score: number
        is_completed: boolean
      }>('total_score', 'is_completed')
      .first()

    if (session) {
      // Rank is only meaningful when the session is finished — partial
      // scores ride the leaderboard once completed_at is set, never before.
      let rank: number | null = null
      if (session.is_completed) {
        const higher = await db('game_sessions')
          .join('user', 'game_sessions.user_id', 'user.id')
          .where('daily_challenge_id', challenge.id)
          .andWhere('is_completed', true)
          .andWhere('is_catch_up', false)
          .whereRaw('"user"."isAnonymous" = ?', [false])
          .andWhere('total_score', '>', session.total_score)
          .count<{ count: string }[]>('game_sessions.id as count')
          .first()
        rank = Number(higher?.count ?? 0) + 1
      }
      today = {
        score: session.total_score,
        rank,
        completed: session.is_completed,
      }
    }
  }

  return {
    slug: row.public_slug,
    displayName: row.display_name ?? row.username ?? row.public_slug,
    avatarUrl: row.avatar_url,
    currentStreak: row.current_streak ?? 0,
    longestStreak: row.longest_streak ?? 0,
    totalScore: row.total_score ?? 0,
    gamesPlayed: Number(gamesPlayedRow?.count ?? 0),
    today,
  }
}

router.get(
  '/streamers/:slug',
  validateQuery(profileQuerySchema),
  async (req, res, next) => {
    try {
      const rawSlug = req.params['slug']
      const slug = (typeof rawSlug === 'string' ? rawSlug : '').toLowerCase()
      if (!SLUG_RE.test(slug)) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_SLUG', message: 'Slug must be 3-32 chars [a-z0-9_-]' },
        })
        return
      }
      const row = await findPublicStreamer(slug)
      if (!row) {
        res.status(404).json({
          success: false,
          error: { code: 'STREAMER_NOT_FOUND' },
        })
        return
      }
      const profile = await buildStreamerProfile(row)

      const query = req.query as z.infer<typeof profileQuerySchema>
      if (query.format === 'chat') {
        // Plain text body — Nightbot-friendly. We don't wrap in the envelope
        // because $(urlfetch json …) expects raw text here, and a JSON
        // string would arrive double-quoted in chat.
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.setHeader('Cache-Control', 'public, max-age=30')
        res.send(chatLine(profile, { emoji: query.emoji !== '0' }))
        return
      }

      res.json({ success: true, data: profile })
    } catch (err) {
      next(err)
    }
  }
)

// ─────────────────────────────────────────────────────────────────────
// GET /api/public/v1/streamers/:slug/today
//
// Today-only state for an OBS overlay. No spoilers — we expose the count
// of screenshots already scored, never the id of the current screenshot.
// ─────────────────────────────────────────────────────────────────────
router.get('/streamers/:slug/today', async (req, res, next) => {
  try {
    const rawSlug = req.params['slug']
    const slug = (typeof rawSlug === 'string' ? rawSlug : '').toLowerCase()
    if (!SLUG_RE.test(slug)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_SLUG' },
      })
      return
    }
    const row = await findPublicStreamer(slug)
    if (!row) {
      res.status(404).json({ success: false, error: { code: 'STREAMER_NOT_FOUND' } })
      return
    }
    const date = todayDate()
    const challenge = await challengeRepository.findByDate(date)
    if (!challenge) {
      res.json({
        success: true,
        data: { slug, status: 'not_started', session: null } satisfies PublicStreamerToday,
      })
      return
    }

    const session = await db('game_sessions')
      .where('user_id', row.id)
      .andWhere('daily_challenge_id', challenge.id)
      .andWhere('is_catch_up', false)
      .select<{
        id: string
        total_score: number
        current_tier: number
        is_completed: boolean
        started_at: Date
        completed_at: Date | null
      }>('id', 'total_score', 'current_tier', 'is_completed', 'started_at', 'completed_at')
      .first()

    if (!session) {
      res.json({
        success: true,
        data: { slug, status: 'not_started', session: null } satisfies PublicStreamerToday,
      })
      return
    }

    // screenshotsDone = sum of correct answers across tier_sessions for this
    // game_session. Bounded by TOTAL_SCREENSHOTS.
    const tierAgg = await db('tier_sessions')
      .where('game_session_id', session.id)
      .sum<{ sum: string | null }[]>('correct_answers as sum')
      .first()
    const screenshotsDone = Math.min(TOTAL_SCREENSHOTS, Number(tierAgg?.sum ?? 0))

    let rank: number | null = null
    if (session.is_completed) {
      const higher = await db('game_sessions')
        .join('user', 'game_sessions.user_id', 'user.id')
        .where('daily_challenge_id', challenge.id)
        .andWhere('is_completed', true)
        .andWhere('is_catch_up', false)
        .whereRaw('"user"."isAnonymous" = ?', [false])
        .andWhere('total_score', '>', session.total_score)
        .count<{ count: string }[]>('game_sessions.id as count')
        .first()
      rank = Number(higher?.count ?? 0) + 1
    }

    const data: PublicStreamerToday = {
      slug,
      status: session.is_completed ? 'completed' : 'in_progress',
      session: {
        score: session.total_score,
        screenshotsDone,
        totalScreenshots: TOTAL_SCREENSHOTS,
        tier: session.current_tier,
        startedAt: session.started_at.toISOString(),
        completedAt: session.completed_at?.toISOString() ?? null,
        rank,
        countsForLeaderboard: true,
      },
    }
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// GET /api/public/v1/leaderboard/daily?date=YYYY-MM-DD&limit=N
// ─────────────────────────────────────────────────────────────────────
const dailyQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(10),
})

router.get('/leaderboard/daily', validateQuery(dailyQuerySchema), async (req, res, next) => {
  try {
    const { date, limit } = req.query as unknown as z.infer<typeof dailyQuerySchema>
    const targetDate = date ?? todayDate()
    const challenge = await challengeRepository.findByDate(targetDate)
    if (!challenge) {
      res.json({ success: true, data: [] as PublicLeaderboardEntry[] })
      return
    }
    const entries = await leaderboardRepository.findByChallenge(challenge.id, limit)

    // Join slug for each user_id that has one — slugs are the public id we
    // want to surface, but we still fall back to display_name.
    const userIds = entries.map((e: LeaderboardEntry) => e.userId)
    const slugRows = userIds.length
      ? await db('user')
          .whereIn('id', userIds)
          .andWhere('public_profile_enabled', true)
          .select<Array<{ id: string; public_slug: string | null }>>('id', 'public_slug')
      : []
    const slugById = new Map(slugRows.map((r) => [r.id, r.public_slug]))

    const data: PublicLeaderboardEntry[] = entries.map((e: LeaderboardEntry) => ({
      rank: e.rank,
      slug: slugById.get(e.userId) ?? null,
      displayName: e.displayName,
      avatarUrl: e.avatarUrl ?? null,
      totalScore: e.totalScore,
      completedAt: e.completedAt,
    }))
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// GET /api/public/v1/leaderboard/monthly?month=YYYY-MM&limit=N
// ─────────────────────────────────────────────────────────────────────
const monthlyQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(10),
})

router.get('/leaderboard/monthly', validateQuery(monthlyQuerySchema), async (req, res, next) => {
  try {
    const { month, limit } = req.query as unknown as z.infer<typeof monthlyQuerySchema>
    const now = new Date()
    const [yearStr, monthStr] = (month ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`).split('-')
    const year = Number(yearStr)
    const m = Number(monthStr)

    const entries = await leaderboardRepository.findByMonth(year, m, limit)

    const userIds = entries.map((e: MonthlyLeaderboardEntry) => e.userId)
    const slugRows = userIds.length
      ? await db('user')
          .whereIn('id', userIds)
          .andWhere('public_profile_enabled', true)
          .select<Array<{ id: string; public_slug: string | null }>>('id', 'public_slug')
      : []
    const slugById = new Map(slugRows.map((r) => [r.id, r.public_slug]))

    const data: PublicLeaderboardEntry[] = entries.map((e: MonthlyLeaderboardEntry) => ({
      rank: e.rank,
      slug: slugById.get(e.userId) ?? null,
      displayName: e.displayName,
      avatarUrl: e.avatarUrl ?? null,
      totalScore: e.totalScore,
      gamesPlayed: e.gamesPlayed,
    }))
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

void log // M2 (SSE, webhooks) will use this; keep the child logger ready.

export default router
