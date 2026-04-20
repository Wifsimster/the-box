import { Router } from 'express'
import { z } from 'zod'
import {
  geoGameService,
  geoContributorService,
  GeoGameError,
} from '../../domain/services/index.js'
import {
  geoPinRepository,
  geoContributorRepository,
  geoScreenshotRepository,
  geoChallengeRepository,
} from '../../infrastructure/repositories/index.js'
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware.js'
import { validateBody, validateParams, validateQuery } from '../middleware/validation.middleware.js'
import { routeLogger } from '../../infrastructure/logger/logger.js'
import { geoQueue } from '../../infrastructure/queue/queues.js'
import { emitGeoLeaderboardUpdate } from '../../infrastructure/socket/socket.js'

const log = routeLogger.child({ route: 'geo' })

const router = Router()

// ---------- Schemas ----------

const dateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
})

const periodSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, 'period must be YYYY-MM'),
})

const pointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
})

const guessBodySchema = z.object({
  challengeId: z.number().int().positive(),
  guess: pointSchema,
  durationMs: z.number().int().nonnegative().optional(),
})

const pinBodySchema = z.object({
  geoScreenshotCandidateId: z.number().int().positive(),
  pin: pointSchema,
})

const contributePickBodySchema = z.object({
  gameId: z.number().int().positive(),
})

const historyQuerySchema = z.object({
  days: z.coerce.number().int().positive().max(30).optional(),
})

// ---------- Daily challenge ----------

router.get('/daily/:date', optionalAuthMiddleware, validateParams(dateSchema), async (req, res, next) => {
  try {
    const { date } = req.params as unknown as { date: string }
    const view = await geoGameService.getDailyChallenge({ date, userId: req.userId })
    if (!view) {
      res.status(404).json({
        success: false,
        error: { code: 'NO_CHALLENGE', message: 'no geo challenge for this date' },
      })
      return
    }
    res.json({ success: true, data: view })
  } catch (err) {
    next(err)
  }
})

router.get('/history', optionalAuthMiddleware, validateQuery(historyQuerySchema), async (req, res, next) => {
  try {
    const { days = 7 } = req.query as unknown as { days?: number }
    const data = await geoChallengeRepository.listRecent(days)
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

// ---------- Guess ----------

router.post('/guess', authMiddleware, validateBody(guessBodySchema), async (req, res, next) => {
  try {
    const userId = req.userId!
    const { challengeId, guess, durationMs } = req.body as z.infer<typeof guessBodySchema>
    const result = await geoGameService.submitGuess({
      userId,
      challengeId,
      guess,
      durationMs,
    })

    // Best-effort realtime nudge; don't fail the request if the namespace is down.
    try {
      emitGeoLeaderboardUpdate({ challengeDate: new Date().toISOString().slice(0, 10) })
    } catch (e) {
      log.warn({ err: String(e) }, 'failed to emit geo leaderboard update')
    }

    res.json({ success: true, data: result })
  } catch (err) {
    if (err instanceof GeoGameError) {
      const status = err.code === 'ALREADY_GUESSED' ? 409 : err.code === 'INVALID_POINT' ? 400 : 404
      res.status(status).json({ success: false, error: { code: err.code, message: err.message } })
      return
    }
    next(err)
  }
})

// ---------- Leaderboards ----------

router.get('/leaderboard/monthly/:period', validateParams(periodSchema), async (req, res, next) => {
  try {
    const { period } = req.params as unknown as { period: string }
    const data = await geoGameService.getLeaderboardMonthly(period, 50)
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

router.get('/leaderboard/:date', validateParams(dateSchema), async (req, res, next) => {
  try {
    const { date } = req.params as unknown as { date: string }
    const data = await geoGameService.getLeaderboardDaily(date, 50)
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

// ---------- Crowdsourced contribution ----------

router.post(
  '/contribute/pick',
  authMiddleware,
  validateBody(contributePickBodySchema),
  async (req, res, next) => {
    try {
      const userId = req.userId!
      const { gameId } = req.body as z.infer<typeof contributePickBodySchema>
      const candidate = await geoGameService.pickContributionTarget({ gameId, userId })

      // Caller also needs the map metadata to render Leaflet properly.
      // Fetched via the repository rather than expanding the service API.
      const map = await geoScreenshotRepository.findCandidateById(candidate.id)
      res.json({ success: true, data: { candidate: map ?? candidate } })
    } catch (err) {
      if (err instanceof GeoGameError) {
        const status = err.code === 'CONTRIBUTE_RATE_LIMIT' ? 429 : 404
        res
          .status(status)
          .json({ success: false, error: { code: err.code, message: err.message } })
        return
      }
      next(err)
    }
  },
)

router.post(
  '/contribute/pin',
  authMiddleware,
  validateBody(pinBodySchema),
  async (req, res, next) => {
    try {
      const userId = req.userId!
      const { geoScreenshotCandidateId, pin } = req.body as z.infer<typeof pinBodySchema>

      const candidate = await geoScreenshotRepository.findCandidateById(geoScreenshotCandidateId)
      if (!candidate) {
        res.status(404).json({
          success: false,
          error: { code: 'CANDIDATE_NOT_FOUND', message: 'candidate not found' },
        })
        return
      }

      const stats = await geoContributorRepository.getStats(userId)
      if (stats?.shadowBanned) {
        // Silently accept to deny feedback to bad actors; don't store/bump stats.
        log.warn({ userId }, 'shadow-banned pin — silently dropped')
        res.json({ success: true, data: { received: true } })
        return
      }

      const submission = await geoPinRepository.submit({
        userId,
        geoScreenshotCandidateId,
        pin,
      })

      if (submission) {
        await geoScreenshotRepository.incrementPinCount(geoScreenshotCandidateId)
        // Enqueue consensus evaluation; the worker itself decides (based on
        // threshold gates) whether this pin count warrants a full pass.
        try {
          await geoQueue.add('evaluate-consensus', {
            kind: 'evaluate-consensus',
            geoScreenshotCandidateId,
          })
        } catch (e) {
          log.warn({ err: String(e) }, 'failed to enqueue geo consensus job')
        }
      }

      res.json({ success: true, data: { received: true } })
    } catch (err) {
      next(err)
    }
  },
)

// ---------- Contributor stats ----------

router.get('/contributor/me', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.userId!
    const [stats, thresholds] = await Promise.all([
      geoContributorRepository.getStats(userId),
      geoContributorRepository.listThresholds(),
    ])
    res.json({
      success: true,
      data: {
        stats: stats ?? {
          userId,
          tier: 'bronze' as const,
          totalSubmitted: 0,
          totalAccepted: 0,
          totalRejected: 0,
          accuracy: 0,
          shadowBanned: false,
        },
        thresholds,
        // Stateless convenience: what tier *would* this user have right now?
        // Useful for showing a "one more accepted pin to Silver!" hint client-side.
        computedTier: stats
          ? geoContributorService.pickTier(
              { totalAccepted: stats.totalAccepted, accuracy: stats.accuracy },
              thresholds,
            )
          : ('bronze' as const),
      },
    })
  } catch (err) {
    next(err)
  }
})

export default router
