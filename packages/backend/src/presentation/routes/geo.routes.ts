import { Router } from 'express'
import { z } from 'zod'
import {
  geoGameService,
  geoContributorService,
  GeoGameError,
  GEO_CONTRIBUTE_MIN_DAYS_PLAYED,
} from '../../domain/services/index.js'
import {
  geoPinRepository,
  geoContributorRepository,
  geoScreenshotRepository,
  geoChallengeRepository,
  geoMapRepository,
  sessionRepository,
  screenshotReportRepository,
} from '../../infrastructure/repositories/index.js'
import type { ScreenshotReportReason } from '@the-box/types'
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware.js'
import { validateBody, validateParams, validateQuery } from '../middleware/validation.middleware.js'
import { routeLogger } from '../../infrastructure/logger/logger.js'
import { geoQueue } from '../../infrastructure/queue/queues.js'
import { emitGeoLeaderboardUpdate } from '../../infrastructure/socket/socket.js'

const SCREENSHOT_REPORT_REASONS = [
  'wrong_game',
  'low_quality',
  'not_recognizable',
  'inappropriate',
  'other',
] as const satisfies readonly ScreenshotReportReason[]

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

const reportBodySchema = z
  .object({
    geoScreenshotCandidateId: z.number().int().positive().optional(),
    screenshotId: z.number().int().positive().optional(),
    reason: z.enum(SCREENSHOT_REPORT_REASONS),
    details: z.string().trim().max(500).optional(),
  })
  .refine(
    (v) => Boolean(v.geoScreenshotCandidateId) !== Boolean(v.screenshotId),
    'exactly one of geoScreenshotCandidateId or screenshotId is required',
  )

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
      const map = await geoMapRepository.findById(candidate.geoMapId)
      if (!map) {
        res.status(404).json({
          success: false,
          error: { code: 'MAP_NOT_FOUND', message: 'map for candidate not found' },
        })
        return
      }
      res.json({ success: true, data: { candidate, map } })
    } catch (err) {
      if (err instanceof GeoGameError) {
        const status =
          err.code === 'CONTRIBUTE_RATE_LIMIT'
            ? 429
            : err.code === 'CONTRIBUTE_NOT_UNLOCKED'
              ? 403
              : 404
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

// ---------- Report capture as ineligible ----------

// User-facing eligibility flag. Once N distinct users hit this endpoint for
// the same target the repository auto-deactivates it so it stops appearing in
// any game mode (geo + daily). Idempotent per (user, target) thanks to the
// partial unique indexes on screenshot_reports.
router.post('/report', authMiddleware, validateBody(reportBodySchema), async (req, res, next) => {
  try {
    const userId = req.userId!
    const body = req.body as z.infer<typeof reportBodySchema>

    // Validate that the target actually exists; otherwise we'd be inserting
    // orphaned rows (or, worse, creating phantom thresholds that admins can't
    // un-do without exploring the table by hand).
    if (body.geoScreenshotCandidateId != null) {
      const candidate = await geoScreenshotRepository.findCandidateById(
        body.geoScreenshotCandidateId,
      )
      if (!candidate) {
        res.status(404).json({
          success: false,
          error: { code: 'CANDIDATE_NOT_FOUND', message: 'capture not found' },
        })
        return
      }
    }

    const outcome = await screenshotReportRepository.submit({
      userId,
      reason: body.reason,
      details: body.details,
      screenshotId: body.screenshotId,
      geoScreenshotCandidateId: body.geoScreenshotCandidateId,
    })

    res.json({
      success: true,
      data: {
        received: true,
        deactivated: outcome.deactivated,
        reportCount: outcome.reportCount,
      },
    })
  } catch (err) {
    next(err)
  }
})

// ---------- Contributor stats ----------

router.get('/contributor/me', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.userId!
    const [stats, thresholds, daysPlayed] = await Promise.all([
      geoContributorRepository.getStats(userId),
      geoContributorRepository.listThresholds(),
      sessionRepository.countDistinctDaysPlayed(userId),
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
        // Unlock progress (FR-24) so the UI can show a friendly countdown
        // instead of waiting for the server to 403 on pick.
        unlock: {
          daysPlayed,
          minRequired: GEO_CONTRIBUTE_MIN_DAYS_PLAYED,
          unlocked: daysPlayed >= GEO_CONTRIBUTE_MIN_DAYS_PLAYED,
        },
      },
    })
  } catch (err) {
    next(err)
  }
})

export default router
