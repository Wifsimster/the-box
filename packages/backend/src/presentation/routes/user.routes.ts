import { Router } from 'express'
import { userService } from '../../domain/services/index.js'
import { authMiddleware } from '../middleware/auth.middleware.js'

const router = Router()

// Get user's daily game history
router.get('/history', authMiddleware, async (req, res, next) => {
  try {
    const data = await userService.getGameHistory(req.userId!)

    res.json({
      success: true,
      data,
    })
  } catch (error) {
    next(error)
  }
})

export default router
