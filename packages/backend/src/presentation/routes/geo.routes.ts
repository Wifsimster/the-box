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
  // Required for multi-map games; optional for single-map (the service
  // auto-resolves to the only enabled map). Validated server-side
  // against the challenge's game.
  geoMapId: z.number().int().positive().optional(),
  guess: pointSchema,
  durationMs: z.number().int().nonnegative().optional(),
})

const skipBodySchema = z.object({
  challengeId: z.number().int().positive(),
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

// ---- Free-play schemas (unranked, all-games-all-maps browser) ----

const gameIdParamSchema = z.object({
  gameId: z.coerce.number().int().positive(),
})

const freePlayPickBodySchema = z.object({
  gameId: z.number().int().positive(),
  geoMapId: z.number().int().positive().optional(),
})

const freePlayGuessBodySchema = z.object({
  metaId: z.number().int().positive(),
  geoMapId: z.number().int().positive(),
  guess: pointSchema,
})

// ---------- Current / daily challenge ----------

// Slow-rollout entrypoint: returns whichever challenge is currently flagged
// `is_current = true`. Used by the public /geo page; admins control rollout
// by manually releasing the next challenge instead of relying on a midnight
// cron. Falls through to 404 NO_CHALLENGE when no row is flagged so the
// frontend can render a "coming soon" state.
router.get('/current', optionalAuthMiddleware, async (req, res, next) => {
  try {
    const view = await geoGameService.getCurrentChallenge({ userId: req.userId })
    if (!view) {
      res.status(404).json({
        success: false,
        error: { code: 'NO_CHALLENGE', message: 'no geo challenge is currently released' },
      })
      return
    }
    res.json({ success: true, data: view })
  } catch (err) {
    next(err)
  }
})

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
    const data = await geoChallengeRepository.listRecentWithStatus(days, req.userId)
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

// ---------- Guess ----------

router.post('/guess', authMiddleware, validateBody(guessBodySchema), async (req, res, next) => {
  try {
    const userId = req.userId!
    const { challengeId, geoMapId, guess, durationMs } = req.body as z.infer<typeof guessBodySchema>
    const result = await geoGameService.submitGuess({
      userId,
      challengeId,
      geoMapId,
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
      const status =
        err.code === 'ALREADY_GUESSED'
          ? 409
          : err.code === 'INVALID_POINT' || err.code === 'INVALID_MAP'
            ? 400
            : 404
      res.status(status).json({ success: false, error: { code: err.code, message: err.message } })
      return
    }
    next(err)
  }
})

// "I don't recognize this game" — locks the daily slot but doesn't
// score and doesn't touch the leaderboard tables. No socket emit
// because there's no leaderboard delta to push.
router.post('/skip', authMiddleware, validateBody(skipBodySchema), async (req, res, next) => {
  try {
    const userId = req.userId!
    const { challengeId } = req.body as z.infer<typeof skipBodySchema>
    await geoGameService.submitSkip({ userId, challengeId })
    res.json({ success: true, data: { skipped: true } })
  } catch (err) {
    if (err instanceof GeoGameError) {
      const status = err.code === 'ALREADY_GUESSED' ? 409 : 404
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

// ---------- Free-play (unranked, all-games-all-maps browser) ----------

// Public catalog: every game with at least one promoted screenshot, plus
// per-game map and screenshot counts so the picker can render badges
// without an N+1. Aggressively cacheable — content rotates only when an
// admin promotes a new screenshot or enables a map.
router.get('/games', async (_req, res, next) => {
  try {
    const games = await geoScreenshotRepository.listPlayableGames()
    res.set('Cache-Control', 'public, max-age=300')
    res.json({ success: true, data: games })
  } catch (err) {
    next(err)
  }
})

// Public per-game map list: enabled (playable) maps only. Deliberately
// reuses `listEnabledByGameId` so any admin enable/disable flips
// propagate immediately to the free-play picker.
router.get(
  '/games/:gameId/maps',
  validateParams(gameIdParamSchema),
  async (req, res, next) => {
    try {
      const { gameId } = req.params as unknown as { gameId: number }
      const maps = await geoMapRepository.listEnabledByGameId(gameId)
      res.set('Cache-Control', 'public, max-age=60')
      res.json({ success: true, data: maps })
    } catch (err) {
      next(err)
    }
  },
)

// Pick a random playable screenshot for a (game, optional map) pair.
// Public — auth not required for browsing/practicing. Returns 404 when
// the game has no promoted screenshots (or none for the chosen map) so
// the UI can render an empty state instead of a generic error.
router.post(
  '/free-play/random',
  validateBody(freePlayPickBodySchema),
  async (req, res, next) => {
    try {
      const { gameId, geoMapId } = req.body as z.infer<typeof freePlayPickBodySchema>
      const view = await geoGameService.pickFreePlayScreenshot({ gameId, geoMapId })
      if (!view) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NO_FREE_PLAY_CANDIDATE',
            message: 'no playable screenshot for this game/map',
          },
        })
        return
      }
      res.json({ success: true, data: view })
    } catch (err) {
      if (err instanceof GeoGameError) {
        const status = err.code === 'INVALID_MAP' ? 400 : 404
        res.status(status).json({
          success: false,
          error: { code: err.code, message: err.message },
        })
        return
      }
      next(err)
    }
  },
)

// Score a free-play guess. Public — anonymous players get the score reveal
// without leaderboard credit. No daily/monthly upserts, no socket emit:
// free-play is strictly practice.
router.post(
  '/free-play/guess',
  validateBody(freePlayGuessBodySchema),
  async (req, res, next) => {
    try {
      const { metaId, geoMapId, guess } = req.body as z.infer<
        typeof freePlayGuessBodySchema
      >
      const result = await geoGameService.scoreFreePlayGuess({
        metaId,
        geoMapId,
        guess,
      })
      res.json({ success: true, data: result })
    } catch (err) {
      if (err instanceof GeoGameError) {
        const status =
          err.code === 'INVALID_POINT' || err.code === 'INVALID_MAP' ? 400 : 404
        res.status(status).json({
          success: false,
          error: { code: err.code, message: err.message },
        })
        return
      }
      next(err)
    }
  },
)

export default router
