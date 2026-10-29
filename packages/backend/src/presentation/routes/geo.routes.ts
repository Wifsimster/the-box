import { Router } from 'express'
import { z } from 'zod'
import {
  GeoGameError,
  GEO_CONTRIBUTE_MIN_DAYS_PLAYED,
} from '../../domain/services/index.js'
import {
  geoGameService,
  geoContributorService,
} from '../../composition/services.js'
import {
  geoPinRepository,
  geoContributorRepository,
  geoScreenshotRepository,
  geoMapRepository,
  inventoryRepository,
  sessionRepository,
} from '../../infrastructure/repositories/index.js'
import {
  authMiddleware,
  optionalAuthMiddleware,
} from '../middleware/auth.middleware.js'
import { validateBody, validateParams } from '../middleware/validation.middleware.js'
import { createRateLimiter } from '../middleware/rate-limit.middleware.js'
import { routeLogger } from '../../infrastructure/logger/logger.js'
import { geoQueue } from '../../infrastructure/queue/queues.js'
import { emitGeoRewarded } from '../../infrastructure/socket/socket.js'

const FIRST_PIN_REWARD = {
  itemType: 'powerup' as const,
  itemKey: 'hint_letter' as const,
  quantity: 1,
}

const log = routeLogger.child({ route: 'geo' })

const router = Router()

const pointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
})

const confidenceSchema = z
  .union([z.literal(1), z.literal(2), z.literal(3)])
  .optional()

const pinBodySchema = z.object({
  geoScreenshotCandidateId: z.number().int().positive(),
  pin: pointSchema,
  confidence: confidenceSchema,
})

const contributePickBodySchema = z.object({
  gameId: z.number().int().positive(),
})

const gameIdParamSchema = z.object({
  gameId: z.coerce.number().int().positive(),
})

const freePlayPickBodySchema = z.object({
  gameId: z.number().int().positive(),
  geoMapId: z.number().int().positive().optional(),
  excludeMetaIds: z.array(z.number().int().positive()).max(1000).optional(),
})

const freePlayGuessBodySchema = z.object({
  metaId: z.number().int().positive(),
  geoMapId: z.number().int().positive(),
  guess: pointSchema,
})

router.post(
  '/contribute/pick',
  authMiddleware,
  validateBody(contributePickBodySchema),
  async (req, res, next) => {
    try {
      const userId = req.userId!
      const isAnonymous = req.isGuest === true
      const { gameId } = req.body as z.infer<typeof contributePickBodySchema>
      const candidate = await geoGameService.pickContributionTarget({
        gameId,
        userId,
        isAnonymous,
      })
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
      const isAnonymous = req.isGuest === true
      const { geoScreenshotCandidateId, pin, confidence } = req.body as z.infer<typeof pinBodySchema>

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
        log.warn({ userId }, 'shadow-banned pin — silently dropped')
        res.json({ success: true, data: { received: true } })
        return
      }

      const submission = await geoPinRepository.submit({
        userId,
        geoScreenshotCandidateId,
        pin,
        confidence,
        isAnonymous,
      })

      if (submission) {
        const newPinCount =
          await geoScreenshotRepository.incrementPinCount(geoScreenshotCandidateId)

        if (newPinCount === 1) {
          try {
            await inventoryRepository.addItems(
              userId,
              FIRST_PIN_REWARD.itemType,
              FIRST_PIN_REWARD.itemKey,
              FIRST_PIN_REWARD.quantity,
            )
            emitGeoRewarded({
              userId,
              geoScreenshotCandidateId,
              items: [FIRST_PIN_REWARD],
            })
          } catch (e) {
            log.warn({ err: String(e), userId }, 'failed to grant first-pin reward')
          }
        }

        try {
          await geoQueue.add('evaluate-consensus', {
            kind: 'evaluate-consensus',
            geoScreenshotCandidateId,
            pinCountAtEnqueue: newPinCount,
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

const freePlayPickLimiter = createRateLimiter({ windowMs: 60_000, max: 60 })
const freePlayGuessLimiter = createRateLimiter({ windowMs: 60_000, max: 30 })
const freePlayCatalogLimiter = createRateLimiter({ windowMs: 60_000, max: 120 })

router.get(
  '/games',
  optionalAuthMiddleware,
  freePlayCatalogLimiter,
  async (_req, res, next) => {
    try {
      const games = await geoScreenshotRepository.listPlayableGames()
      res.set('Cache-Control', 'public, max-age=300')
      res.json({ success: true, data: games })
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/stats/today',
  optionalAuthMiddleware,
  freePlayCatalogLimiter,
  async (_req, res, next) => {
    try {
      const totalPinsToday = await geoPinRepository.countSinceUtcMidnight()
      res.set('Cache-Control', 'public, max-age=30')
      res.json({ success: true, data: { totalPinsToday } })
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/games/:gameId/maps',
  optionalAuthMiddleware,
  freePlayCatalogLimiter,
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
  authMiddleware,
  freePlayPickLimiter,
  validateBody(freePlayPickBodySchema),
  async (req, res, next) => {
    try {
      const { gameId, geoMapId, excludeMetaIds } = req.body as z.infer<
        typeof freePlayPickBodySchema
      >
      const view = await geoGameService.pickFreePlayScreenshot({
        gameId,
        geoMapId,
        excludeMetaIds,
      })
      if (!view) {
        if (excludeMetaIds && excludeMetaIds.length > 0) {
          const fallback = await geoGameService.pickFreePlayScreenshot({
            gameId,
            geoMapId,
          })
          if (fallback) {
            res.status(409).json({
              success: false,
              error: {
                code: 'ALL_PLAYED',
                message: 'all available screenshots have been played',
              },
            })
            return
          }
        }
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
  authMiddleware,
  freePlayGuessLimiter,
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
