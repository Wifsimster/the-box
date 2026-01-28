import { Router } from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { gameService, GameError } from '../../domain/services/index.js'
import { gameRepository, screenshotRepository } from '../../infrastructure/repositories/index.js'
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware.js'

const router = Router()

// Get uploads path for serving screenshot images
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadsPath = path.resolve(__dirname, '..', '..', '..', '..', '..', 'uploads')

// Serve screenshot image by ID (proxy to hide actual file path)
router.get('/image/:screenshotId', authMiddleware, async (req, res, next) => {
  try {
    const screenshotId = parseInt(req.params['screenshotId'] as string, 10)

    if (isNaN(screenshotId)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Invalid screenshot ID' },
      })
      return
    }

    const screenshot = await screenshotRepository.findById(screenshotId)
    if (!screenshot) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Screenshot not found' },
      })
      return
    }

    // Convert /uploads/screenshots/... to absolute file path
    const relativePath = screenshot.imageUrl.replace('/uploads/', '')
    const filePath = path.join(uploadsPath, relativePath)

    // Send the file with appropriate cache headers
    res.sendFile(filePath, {
      maxAge: '1d', // Cache for 1 day
      headers: {
        'Content-Type': 'image/jpeg',
      },
    }, (err) => {
      if (err) {
        next(err)
      }
    })
  } catch (error) {
    next(error)
  }
})

// Get today's challenge (or challenge by date if date query param is provided)
router.get('/today', optionalAuthMiddleware, async (req, res, next) => {
  try {
    const date = req.query.date as string | undefined
    const data = await gameService.getTodayChallenge(req.userId, date)

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
      req.userId!,
      req.user?.role === 'admin'
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
    const { tierSessionId, screenshotId, position, gameId, guessText, roundTimeTakenMs, powerUpUsed } = req.body

    const data = await gameService.submitGuess({
      tierSessionId,
      screenshotId,
      position,
      gameId,
      guessText,
      roundTimeTakenMs: roundTimeTakenMs || 0, // Fallback for backward compatibility
      userId: req.userId!,
      powerUpUsed,
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

// End game early (forfeit)
router.post('/end', authMiddleware, async (req, res, next) => {
  try {
    const { sessionId } = req.body

    if (!sessionId) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'sessionId required' },
      })
      return
    }

    const data = await gameService.endGame(sessionId, req.userId!)

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
