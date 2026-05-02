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

// Granted to the user who places the very first pin on a candidate. Sized
// to match the smallest accuracy reward (1σ hit) so discovery is encouraged
// without dwarfing the consensus-based grants that follow.
const FIRST_PIN_REWARD = {
  itemType: 'powerup' as const,
  itemKey: 'hint_year' as const,
  quantity: 1,
}

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
  // Client-tracked list of meta IDs the user has already played. The
  // server filters them out so a single session never sees the same
  // screenshot twice. Capped to keep the WHERE NOT IN payload bounded.
  excludeMetaIds: z.array(z.number().int().positive()).max(1000).optional(),
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
      // Anonymous guest sessions can authenticate but should not consume
      // the moderation pool — without this gate, a fresh guest spins up a
      // session and can immediately pull a contribution candidate.
      if (req.isGuest) {
        res.status(403).json({
          success: false,
          error: {
            code: 'CONTRIBUTE_GUEST_FORBIDDEN',
            message: 'sign up to contribute to the geo dataset',
          },
        })
        return
      }
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
      if (req.isGuest) {
        res.status(403).json({
          success: false,
          error: {
            code: 'CONTRIBUTE_GUEST_FORBIDDEN',
            message: 'sign up to contribute to the geo dataset',
          },
        })
        return
      }
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
        const newPinCount =
          await geoScreenshotRepository.incrementPinCount(geoScreenshotCandidateId)

        // First-pin reward: the increment is atomic, so exactly one
        // submitter ever sees newPinCount === 1 per candidate.
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

        // Enqueue consensus evaluation; carry the post-increment pin count
        // in the payload so the worker can gate threshold checks on the
        // value at submit-time. Without this, two near-simultaneous pins
        // can both step past a threshold (e.g. 9 → 10 → 11) and the worker
        // re-reads pin_count = 11 for both, never evaluating at 10.
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

// Rate limits for the free-play endpoints. Without these, an unauthenticated
// scraper can systematically extract every promoted answer (canonical
// coordinates) by submitting one fake guess per screenshot. Per-IP keying
// because these routes use optionalAuthMiddleware (anon access is allowed
// for browsing but bounded). Numbers chosen to be generous for legit play
// but tight enough that bulk extraction is impractical.
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
  optionalAuthMiddleware,
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
        // If the exclusion list ate the only remaining candidates,
        // surface a distinct code so the UI can offer "reset history"
        // instead of the generic empty-catalog message.
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
  optionalAuthMiddleware,
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
