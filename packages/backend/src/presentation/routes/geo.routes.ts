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
  geoMapRepository,
  sessionRepository,
} from '../../infrastructure/repositories/index.js'
import { authMiddleware } from '../middleware/auth.middleware.js'
import { validateBody, validateParams } from '../middleware/validation.middleware.js'
import { routeLogger } from '../../infrastructure/logger/logger.js'
import { geoQueue } from '../../infrastructure/queue/queues.js'

const log = routeLogger.child({ route: 'geo' })

const router = Router()

// ---------- Schemas ----------

const pointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
})

const pinBodySchema = z.object({
  geoScreenshotCandidateId: z.number().int().positive(),
  pin: pointSchema,
})

const contributePickBodySchema = z.object({
  gameId: z.number().int().positive(),
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

router.get('/games', async (_req, res, next) => {
  try {
    const games = await geoScreenshotRepository.listPlayableGames()
    res.set('Cache-Control', 'public, max-age=300')
    res.json({ success: true, data: games })
  } catch (err) {
    next(err)
  }
})

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
