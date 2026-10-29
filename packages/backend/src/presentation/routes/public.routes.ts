import { Router } from 'express'
import { z } from 'zod'
import { publicProfileRepository } from '../../infrastructure/repositories/public-profile.repository.js'
import type { PublicStreamerRecord } from '../../domain/ports/public-profile.js'
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

const geoGamersSeasonService = createGeoGamersSeasonService({
  logger: serviceLogger,
  ranking: geoGamersSeasonRepository,
})

const router = Router()

router.use(publicApiCors)
router.use(optionalApiKey())
router.use(publicApiRateLimit)

const log = logger.child({ router: 'public-v1' })

const SCORING_CONFIG = { initialScore: 1000, decayRate: 2 } as const
const TOTAL_SCREENSHOTS = 10

const SLUG_RE = /^[a-z0-9_-]{3,32}$/

function todayDate(): string {
  return new Date().toISOString().split('T')[0]!
}

function chatLine(profile: PublicStreamerProfile, opts: { emoji: boolean }): string {
  const prefix = opts.emoji ? '🎮 ' : ''
  const today = profile.today
  const todayStr = today
    ? `Today: ${today.score.toLocaleString()} pts${today.rank ? ` (#${today.rank})` : ''}`
    : `Today: not played yet`
  return `${prefix}@${profile.displayName} · ${todayStr} · Streak: ${profile.currentStreak}d`
}

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

const profileQuerySchema = z.object({
  format: z.enum(['json', 'chat']).optional(),
  emoji: z.enum(['0', '1']).optional(),
})

async function buildStreamerProfile(row: PublicStreamerRecord): Promise<PublicStreamerProfile> {
  const date = todayDate()
  const challenge = await challengeRepository.findByDate(date)

  const gamesPlayed = Number(await publicProfileRepository.countRankedSessions(row.id))

  let today: PublicStreamerProfile['today'] = null
  if (challenge) {
    const session = await publicProfileRepository.findDailySession(row.id, challenge.id)

    if (session) {
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
    gamesPlayed,
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

      const profile = isSandboxSlug(slug)
        ? sandboxProfile()
        : await (async () => {
            const row = await publicProfileRepository.findBySlug(slug)
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

    if (isSandboxSlug(slug)) {
      res.json({ success: true, data: sandboxToday() })
      return
    }

    const row = await publicProfileRepository.findBySlug(slug)
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

    const session = await publicProfileRepository.findDailySession(row.id, challenge.id)

    if (!session) {
      res.json({
        success: true,
        data: { slug, status: 'not_started', session: null } satisfies PublicStreamerToday,
      })
      return
    }

    const correctAnswers = await publicProfileRepository.countCorrectAnswers(session.id)
    const screenshotsDone = Math.min(TOTAL_SCREENSHOTS, Number(correctAnswers))

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

    const userIds = entries.map((e: LeaderboardEntry) => e.userId)
    const slugById = await publicProfileRepository.findPublicSlugs(userIds)

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
    const slugById = await publicProfileRepository.findPublicSlugs(userIds)

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
      const slugById = await publicProfileRepository.findPublicSlugs(userIds)

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

      const validation = validateWebhookUrl(body.url, env.API_URL)
      if (!validation.ok) {
        res.status(400).json({
          success: false,
          error: { code: validation.code ?? 'INVALID_URL', message: 'URL rejected by SSRF guard' },
        })
        return
      }

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
