import { Router } from 'express'
import { z } from 'zod'
import {
  rewardsService,
} from '../../composition/services.js'
import { authMiddleware } from '../middleware/auth.middleware.js'
import { validateParams } from '../middleware/validation.middleware.js'

const router = Router()

const idParamSchema = z.object({
  id: z.string().uuid('reward id must be a uuid'),
})

router.get('/unclaimed', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.userId!
    const grants = await rewardsService.listUnclaimed(userId, 50)
    res.json({ success: true, data: grants })
  } catch (error) {
    next(error)
  }
})

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
