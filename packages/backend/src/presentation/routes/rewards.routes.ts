import { Router } from 'express'
import { z } from 'zod'
import { rewardsService } from '../../domain/services/index.js'
import { authMiddleware } from '../middleware/auth.middleware.js'
import { validateParams } from '../middleware/validation.middleware.js'

const router = Router()

const idParamSchema = z.object({
  id: z.string().uuid('reward id must be a uuid'),
})

/**
 * GET /api/rewards/unclaimed
 * Returns the user's unclaimed reward grants ordered newest-first. Powers
 * the RewardsInbox drawer; clients reconcile here on socket reconnect.
 */
router.get('/unclaimed', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.userId!
    const grants = await rewardsService.listUnclaimed(userId, 50)
    res.json({ success: true, data: grants })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/rewards/:id/claim
 * Marks a reward grant as claimed. Idempotent: re-claim returns 200 with
 * the current state. A staged-but-not-yet-unlocked grant (reactivation
 * waiting for first guess) is rejected with `NOT_UNLOCKED` so the client
 * can render the pending state.
 */
router.post(
  '/:id/claim',
  authMiddleware,
  validateParams(idParamSchema),
  async (req, res, next) => {
    try {
      const userId = req.userId!
      const { id } = req.params as z.infer<typeof idParamSchema>

      const grant = await rewardsService.claim(id, userId)
      if (!grant) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'reward grant not found' },
        })
        return
      }
      if (grant.unlockedAt === null) {
        res.status(409).json({
          success: false,
          error: {
            code: 'NOT_UNLOCKED',
            message: 'reward is not yet unlockable',
          },
          data: grant,
        })
        return
      }
      res.json({ success: true, data: grant })
    } catch (error) {
      next(error)
    }
  }
)

export default router
