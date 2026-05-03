import { Router } from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { gameService, GameError } from '../../domain/services/index.js'
import { billingService } from '../../domain/services/billing.service.js'
import { challengeRepository, gameRepository, screenshotRepository } from '../../infrastructure/repositories/index.js'
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware.js'
import { createRateLimiter } from '../middleware/rate-limit.middleware.js'

// Public preview is cheap to compute but the image endpoint streams
// raw files — tighter cap for the image route, more forgiving for the
// JSON endpoint that pages may call on every homepage view.
const previewMetaLimiter = createRateLimiter({ windowMs: 60_000, max: 60 })
const previewImageLimiter = createRateLimiter({ windowMs: 60_000, max: 30 })

const router = Router()

// Get uploads path for serving screenshot images
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadsPath = path.resolve(__dirname, '..', '..', '..', '..', '..', 'uploads')

// Resolve today's first easy-tier screenshot. Shared by the public
// preview endpoints so anonymous visitors can glimpse the challenge
// before signing up without gaining access to the rest of the set.
async function findTodayPreviewScreenshot(): Promise<{
  challengeDate: string
  imageUrl: string
  screenshotId: number
} | null> {
  const today = new Date().toISOString().split('T')[0]!
  const challenge = await challengeRepository.findByDate(today)
  if (!challenge) return null

  const tier = await challengeRepository.findTierByNumber(challenge.id, 1)
  if (!tier) return null

  const entry = await challengeRepository.findScreenshotAtPosition(tier.id, 1)
  if (!entry) return null

  return {
    challengeDate: challenge.challenge_date,
    imageUrl: entry.image_url,
    screenshotId: entry.screenshot_id,
  }
}

// Public preview endpoint for the landing page teaser. Exposes only
// today's first screenshot — never the answer, never subsequent shots.
router.get('/preview', previewMetaLimiter, async (_req, res, next) => {
  try {
    const preview = await findTodayPreviewScreenshot()
    if (!preview) {
      res.status(404).json({
        success: false,
        error: { code: 'NO_CHALLENGE', message: 'No challenge available today' },
      })
      return
    }

    res.json({
      success: true,
      data: {
        challengeDate: preview.challengeDate,
        imageUrl: '/api/game/preview/image',
      },
    })
  } catch (error) {
    next(error)
  }
})

// Public image stream paired with GET /preview. Serves exactly one file
// (today's first screenshot), bypassing the auth-gated /image/:id route
// so anonymous visitors can see the teaser inline.
router.get('/preview/image', previewImageLimiter, async (_req, res, next) => {
  try {
    const preview = await findTodayPreviewScreenshot()
    if (!preview) {
      res.status(404).json({
        success: false,
        error: { code: 'NO_CHALLENGE', message: 'No challenge available today' },
      })
      return
    }

    const relativePath = preview.imageUrl.replace('/uploads/', '')
    const filePath = path.join(uploadsPath, relativePath)

    res.sendFile(
      filePath,
      {
        maxAge: '10m',
        headers: { 'Content-Type': 'image/jpeg' },
      },
      (err) => {
        if (err) next(err)
      }
    )
  } catch (error) {
    next(error)
  }
})

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
    // Premium status flips two things in startChallenge: the catch-up
    // window expands to PREMIUM_CATCH_UP_DAYS, and an old free attempt
    // returns 402 PREMIUM_REQUIRED_FOR_OLD_CATCHUP instead of a generic
    // 400 so the frontend can surface the upsell instead of a dead end.
    const isPremium = await billingService.isPremium(req.userId!)
    const data = await gameService.startChallenge(challengeId, req.userId!, isPremium)

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
    const { tierSessionId, screenshotId, position, gameId, guessText, roundTimeTakenMs, powerUpUsed } = req.body

    // Premium status only changes hint accounting in catch-up sessions
    // (see game.service: premium + is_catch_up → free hint, no penalty).
    // The flag is checked once here so the service stays sync-friendly.
    const isPremium = await billingService.isPremium(req.userId!)

    const data = await gameService.submitGuess({
      tierSessionId,
      screenshotId,
      position,
      gameId,
      guessText,
      roundTimeTakenMs: roundTimeTakenMs || 0, // Fallback for backward compatibility
      userId: req.userId!,
      powerUpUsed,
      isPremium,
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

// Activate the second-chance powerup for a specific position. Decrements
// inventory and inserts a position_second_chances row atomically. The next
// correct guess on (tier_session_id, position) will have its score floor
// clamped to 70. See game.service.activateSecondChance for the contract.
router.post('/second-chance', authMiddleware, async (req, res, next) => {
  try {
    const { tierSessionId, position } = req.body ?? {}

    if (typeof tierSessionId !== 'string' || typeof position !== 'number') {
      res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMS',
          message: 'tierSessionId (string) and position (number) required',
        },
      })
      return
    }

    const result = await gameService.activateSecondChance({
      tierSessionId,
      position,
      userId: req.userId!,
    })

    if (!result.ok) {
      const status =
        result.reason === 'SESSION_NOT_FOUND'
          ? 404
          : result.reason === 'NO_INVENTORY'
            ? 402
            : 409
      res.status(status).json({
        success: false,
        error: { code: result.reason, message: `second-chance: ${result.reason}` },
      })
      return
    }

    res.json({ success: true, data: { activated: true } })
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
