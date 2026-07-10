import { Router } from 'express'
import { z } from 'zod'
import { db } from '../../infrastructure/database/connection.js'
import { challengeRepository } from '../../infrastructure/repositories/challenge.repository.js'
import { leaderboardRepository } from '../../infrastructure/repositories/leaderboard.repository.js'
import { geoGamersSeasonRepository } from '../../infrastructure/repositories/geogamers-season.repository.js'
import { createGeoGamersSeasonService } from '../../domain/services/geogamers-season.service.js'
import { serviceLogger } from '../../infrastructure/logger/logger.js'
import {
  webhookRepository,
} from '../../infrastructure/repositories/webhook.repository.js'
import { validateWebhookUrl } from '../../domain/services/webhook-signer.service.js'
import {
  isSandboxSlug,
  sandboxProfile,
  sandboxToday,
} from '../../domain/services/sandbox.service.js'
import { env } from '../../config/env.js'
import { logger } from '../../infrastructure/logger/logger.js'
import {
  publicApiCors,
  publicApiRateLimit,
  optionalApiKey,
  requireApiKey,
} from '../middleware/public-api.middleware.js'
import { validateBody, validateParams, validateQuery } from '../middleware/validation.middleware.js'
import { setupSseChannel } from './public-sse.js'
import type {
  ApiKeyScope,
  LeaderboardEntry,
  MonthlyLeaderboardEntry,
  PublicChallengeToday,
  PublicEventType,
  PublicLeaderboardEntry,
  PublicStreamerProfile,
  PublicStreamerToday,
  WebhookCreated,
  WebhookSummary,
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

// Constructed locally (not from the services barrel) so this route module —
// and public-api-spec.test.ts which introspects it — never transitively
// imports queues.ts (whose eager QueueEvents would open a Redis connection and
// hang the test process). The season service only needs its repository.
const geoGamersSeasonService = createGeoGamersSeasonService({
  logger: serviceLogger,
  ranking: geoGamersSeasonRepository,
})

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
      const rank: number | null = session.is_completed
        ? await leaderboardRepository.rankForScore(challenge.id, session.total_score)
        : null
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
      const query = req.query as z.infer<typeof profileQuerySchema>

      // Sandbox streamer — clock-driven simulation, never a DB lookup.
      // Lets integrators build against a live target without waiting for
      // a real player. See sandbox.service.ts.
      const profile = isSandboxSlug(slug)
        ? sandboxProfile()
        : await (async () => {
            const row = await findPublicStreamer(slug)
            return row ? buildStreamerProfile(row) : null
          })()

      if (!profile) {
        res.status(404).json({
          success: false,
          error: { code: 'STREAMER_NOT_FOUND' },
        })
        return
      }
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

    // Sandbox streamer — clock-driven simulation (see sandbox.service.ts).
    if (isSandboxSlug(slug)) {
      res.json({ success: true, data: sandboxToday() })
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

    const rank: number | null = session.is_completed
      ? await leaderboardRepository.rankForScore(challenge.id, session.total_score)
      : null

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

// GET /api/public/v1/geogamers/season — read-only GeoGamers season standings
// for overlays/bots. Returns an empty list when the feature is disabled so
// integrators can poll unconditionally. Public-safe: exposes rank, display
// name, and public slug (only for opted-in public profiles), never user ids.
const geogamersSeasonQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
})

router.get(
  '/geogamers/season',
  validateQuery(geogamersSeasonQuerySchema),
  async (req, res, next) => {
    try {
      if (env.GEOGAMERS_ENABLED !== 'true') {
        res.json({ success: true, data: { month: null, standings: [] } })
        return
      }
      const { limit } = req.query as unknown as z.infer<typeof geogamersSeasonQuerySchema>
      const month = geoGamersSeasonService.currentMonth()
      const standings = await geoGamersSeasonService.standings(month, limit)

      const userIds = standings.map((s) => s.userId)
      const slugRows = userIds.length
        ? await db('user')
            .whereIn('id', userIds)
            .andWhere('public_profile_enabled', true)
            .select<Array<{ id: string; public_slug: string | null }>>('id', 'public_slug')
        : []
      const slugById = new Map(slugRows.map((r) => [r.id, r.public_slug]))

      res.json({
        success: true,
        data: {
          month,
          standings: standings.map((s) => ({
            rank: s.rank,
            slug: slugById.get(s.userId) ?? null,
            displayName: s.username,
            seasonScore: s.seasonScore,
            daysPlayed: s.daysPlayed,
            provisional: s.provisional,
          })),
        },
      })
    } catch (err) {
      next(err)
    }
  },
)

// ─────────────────────────────────────────────────────────────────────
// M2 — SSE live channel
// ─────────────────────────────────────────────────────────────────────
//
// GET /api/public/v1/streamers/:slug/live?key=tb_pk_…
//
// SSE is one-way push from server → browser, ideal for OBS browser
// sources. `EventSource` can't set headers, so the key arrives as a
// query param — the request-logging middleware redacts it.
//
// The actual stream loop, polling cadence, heartbeat, and connection
// budget all live in public-sse.ts so this file stays readable. We
// require an API key on this path so the per-key concurrent-connection
// cap (3) has something to attach to.
router.get(
  '/streamers/:slug/live',
  requireApiKey({ allowQueryParam: true }),
  async (req, res) => {
    const rawSlug = req.params['slug']
    const slug = (typeof rawSlug === 'string' ? rawSlug : '').toLowerCase()
    if (!SLUG_RE.test(slug)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_SLUG' } })
      return
    }
    await setupSseChannel(req, res, { slug, log })
  },
)

// ─────────────────────────────────────────────────────────────────────
// M2 — Webhooks
//
// Three endpoints, all key-authed against the OWNER's data:
//   POST   /webhooks         register
//   GET    /webhooks         list own webhooks
//   DELETE /webhooks/:id     revoke
//
// Cross-account access is explicitly impossible — `req.userId` (set by
// the key) is the only id we ever look up by. Holding a key for user A
// never grants visibility into user B's webhooks.
// ─────────────────────────────────────────────────────────────────────

function hasScope(scopes: ApiKeyScope[] | undefined, want: ApiKeyScope): boolean {
  return Array.isArray(scopes) && scopes.includes(want)
}

const ALLOWED_EVENTS: PublicEventType[] = [
  'session.started',
  'session.completed',
  'screenshot.scored',
  'rank.changed',
]

const createWebhookSchema = z.object({
  url: z.string().url().max(2048),
  label: z.string().trim().min(1).max(64),
  events: z
    .array(z.enum(ALLOWED_EVENTS as [PublicEventType, ...PublicEventType[]]))
    .max(16)
    // Empty array means "all events" — semantically distinct from "no events"
    // (which would be a useless registration).
    .default([]),
})

router.post(
  '/webhooks',
  requireApiKey(),
  validateBody(createWebhookSchema),
  async (req, res, next) => {
    try {
      if (!hasScope(req.apiKey?.scopes, 'webhooks:self')) {
        res.status(403).json({ success: false, error: { code: 'INSUFFICIENT_SCOPE' } })
        return
      }
      const userId = req.userId!
      const body = req.body as z.infer<typeof createWebhookSchema>

      // SSRF guard at register time. The delivery worker re-checks DNS
      // on every send so DNS rebinding can't sneak past this.
      const validation = validateWebhookUrl(body.url, env.API_URL)
      if (!validation.ok) {
        res.status(400).json({
          success: false,
          error: { code: validation.code ?? 'INVALID_URL', message: 'URL rejected by SSRF guard' },
        })
        return
      }

      // Cap concurrent active webhooks per user. 10 is generous (multi-bot
      // setups stay well under) and stops a compromised session from
      // creating an unbounded fleet.
      const existing = await webhookRepository.findByUser(userId)
      if (existing.filter((w) => w.is_active).length >= 10) {
        res.status(400).json({
          success: false,
          error: { code: 'TOO_MANY_WEBHOOKS', message: 'Revoke an existing webhook first' },
        })
        return
      }

      const { row, secret } = await webhookRepository.create({
        userId,
        url: body.url,
        label: body.label,
        events: body.events,
      })

      // The signing secret is encrypted at rest by webhookRepository.create
      // (AES-256-GCM) — the delivery worker decrypts it per send. Returned
      // here once, in plaintext, and never again.
      const payload: WebhookCreated = {
        ...webhookRepository.mapWebhook(row),
        secret,
      }
      res.status(201).json({ success: true, data: payload })
    } catch (err) {
      next(err)
    }
  },
)

router.get('/webhooks', requireApiKey(), async (req, res, next) => {
  try {
    if (!hasScope(req.apiKey?.scopes, 'webhooks:self')) {
      res.status(403).json({ success: false, error: { code: 'INSUFFICIENT_SCOPE' } })
      return
    }
    const rows = await webhookRepository.findByUser(req.userId!)
    const data: WebhookSummary[] = rows.map(webhookRepository.mapWebhook)
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

const webhookIdParams = z.object({ id: z.coerce.number().int().positive() })

router.delete(
  '/webhooks/:id',
  requireApiKey(),
  validateParams(webhookIdParams),
  async (req, res, next) => {
    try {
      if (!hasScope(req.apiKey?.scopes, 'webhooks:self')) {
        res.status(403).json({ success: false, error: { code: 'INSUFFICIENT_SCOPE' } })
        return
      }
      const userId = req.userId!
      const { id } = req.params as unknown as z.infer<typeof webhookIdParams>
      const owned = await webhookRepository.findOwnedById(userId, id)
      if (!owned) {
        res.status(404).json({ success: false, error: { code: 'WEBHOOK_NOT_FOUND' } })
        return
      }
      const ok = await webhookRepository.revoke(id, userId)
      if (!ok) {
        res.status(409).json({ success: false, error: { code: 'ALREADY_REVOKED' } })
        return
      }
      res.json({ success: true, data: { ok: true } })
    } catch (err) {
      next(err)
    }
  },
)

export default router
