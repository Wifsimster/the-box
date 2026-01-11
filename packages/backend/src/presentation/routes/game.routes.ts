import { Router } from 'express'
import { gameService, GameError } from '../../domain/services/index.js'
import { gameRepository } from '../../infrastructure/repositories/index.js'
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware.js'

const router = Router()

// Get today's challenge
router.get('/today', optionalAuthMiddleware, async (req, res, next) => {
  try {
    const data = await gameService.getTodayChallenge(req.userId)

    res.json({
      success: true,
      data,
    })
  } catch (error) {
    next(error)
  }
})

// Start a challenge session
router.post('/start/:challengeId', authMiddleware, async (req, res, next) => {
  try {
    const challengeId = parseInt(req.params['challengeId'] as string, 10)
    const data = await gameService.startChallenge(challengeId, req.userId!)

    res.json({
      success: true,
      data,
    })
  } catch (error) {
    if (error instanceof GameError) {
      res.status(error.statusCode).json({
        success: false,
        error: { code: error.code, message: error.message },
      })
      return
    }
    next(error)
  }
})

// Get current screenshot
router.get('/screenshot', authMiddleware, async (req, res, next) => {
  try {
    const { sessionId, position } = req.query

    if (!sessionId || !position) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'sessionId and position required' },
      })
      return
    }

    const data = await gameService.getScreenshot(
      sessionId as string,
      parseInt(position as string, 10),
      req.userId!
    )

    res.json({
      success: true,
      data,
    })
  } catch (error) {
    if (error instanceof GameError) {
      res.status(error.statusCode).json({
        success: false,
        error: { code: error.code, message: error.message },
      })
      return
    }
    next(error)
  }
})

// Submit a guess
router.post('/guess', authMiddleware, async (req, res, next) => {
  try {
    const { tierSessionId, screenshotId, position, gameId, guessText, sessionElapsedMs } = req.body

    const data = await gameService.submitGuess({
      tierSessionId,
      screenshotId,
      position,
      gameId,
      guessText,
      sessionElapsedMs,
      userId: req.userId!,
    })

    res.json({
      success: true,
      data,
    })
  } catch (error) {
    if (error instanceof GameError) {
      res.status(error.statusCode).json({
        success: false,
        error: { code: error.code, message: error.message },
      })
      return
    }
    next(error)
  }
})

// Search games (autocomplete)
router.get('/games/search', async (req, res, next) => {
  try {
    const { q } = req.query

    if (!q || typeof q !== 'string' || q.length < 2) {
      res.json({
        success: true,
        data: { games: [] },
      })
      return
    }

    const games = await gameRepository.search(q)

    res.json({
      success: true,
      data: { games },
    })
  } catch (error) {
    next(error)
  }
})

export default router
