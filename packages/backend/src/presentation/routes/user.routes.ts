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

// Get detailed game session information
router.get('/history/:sessionId', authMiddleware, async (req, res, next) => {
  try {
    const { sessionId } = req.params
    if (!sessionId || Array.isArray(sessionId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_SESSION_ID', message: 'Invalid session ID' },
      })
    }
    const data = await userService.getGameSessionDetails(sessionId, req.userId!)

    res.json({
      success: true,
      data,
    })
  } catch (error) {
    next(error)
  }
})

export default router
