import { Router } from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { gameService, GameError } from '../../domain/services/index.js'
import { billingService } from '../../domain/services/billing.service.js'
import { challengeRepository, gameRepository, screenshotRepository } from '../../infrastructure/repositories/index.js'
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware.js'
import { createRateLimiter } from '../middleware/rate-limit.middleware.js'
import { emitAchievementUnlocked } from '../../infrastructure/socket/socket.js'

// Public preview is cheap to compute but the image endpoint streams
// raw files — tighter cap for the image route, more forgiving for the
// JSON endpoint that pages may call on every homepage view.
const previewMetaLimiter = createRateLimiter({ windowMs: 60_000, max: 60 })
const previewImageLimiter = createRateLimiter({ windowMs: 60_000, max: 30 })

const router = Router()

// Get uploads path for serving screenshot images
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadsPath = path.resolve(__dirname, '..', '..', '..', '..', '..', 'uploads')

// Map a stored `/uploads/...` URL to an absolute file path, refusing any
// value whose resolved path escapes the uploads directory. imageUrl comes
// from the DB (admin-managed), but a crafted `/uploads/../...` value must
// not turn either image route into an arbitrary-file read.
function resolveUploadFilePath(imageUrl: string): string | null {
  const relativePath = imageUrl.replace('/uploads/', '')
  const filePath = path.resolve(uploadsPath, relativePath)
  if (filePath !== uploadsPath && !filePath.startsWith(uploadsPath + path.sep)) {
    return null
  }
  return filePath
}

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

    const filePath = resolveUploadFilePath(preview.imageUrl)
    if (!filePath) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Screenshot not found' },
      })
      return
    }

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

// Allowed extensions for the image proxy. The Content-Type header is set
// from the extension (verified, not sniffed) and any other extension is
// rejected outright — closes the SVG-XSS path where a malicious upload
// could execute JavaScript on the same origin as the auth cookie.
const IMAGE_EXTENSION_CONTENT_TYPE: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

// Serve screenshot image by ID. Two safety nets beyond the auth middleware:
//   1. The user must have (or have had) a game session for a challenge
//      that includes this screenshot — without it, any logged-in user
//      could enumerate every screenshot in the catalogue, including
//      future challenges (see New-1 in the readiness review).
//   2. The Content-Type is derived from a known-good extension and we
//      add `X-Content-Type-Options: nosniff` so browsers don't second-
//      guess us if a stray SVG ever lands in the screenshots tree.
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

    const userId = req.userId
    if (!userId) {
      // authMiddleware should have rejected, but be explicit so the
      // ownership check below never reads `undefined`.
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } })
      return
    }
    const canAccess = await screenshotRepository.userCanAccessScreenshot(userId, screenshotId)
    if (!canAccess) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Screenshot not found' },
      })
      return
    }

    const ext = path.extname(screenshot.imageUrl).toLowerCase()
    const contentType = IMAGE_EXTENSION_CONTENT_TYPE[ext]
    if (!contentType) {
      res.status(415).json({
        success: false,
        error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Unsupported screenshot format' },
      })
      return
    }

    // Convert /uploads/screenshots/... to absolute file path
    const filePath = resolveUploadFilePath(screenshot.imageUrl)
    if (!filePath) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Screenshot not found' },
      })
      return
    }

    res.sendFile(filePath, {
      maxAge: '1d',
      headers: {
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
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
    const { sessionId, position, prefetch } = req.query

    if (!sessionId || !position) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'sessionId and position required' },
      })
      return
    }

    // Carousel/background warming uses prefetch=1 so the round-timer
    // stamp stays on the position the user is actually playing.
    const isPrefetch = prefetch === '1' || prefetch === 'true'

    const data = await gameService.getScreenshot(
      sessionId as string,
      parseInt(position as string, 10),
      req.userId!,
      isPrefetch
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

    // Push the unlock to the user's /notifications socket so the toast
    // lands immediately, even before the results page mounts.
    if (data.newlyEarnedAchievements?.length) {
      emitAchievementUnlocked(req.userId!, data.newlyEarnedAchievements)
    }

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

// Reveal one more letter of the masked title for a position. Server-
// authoritative: returns only the recomputed masked string, never the
// title. Gated server-side (one wrong guess first), capped per title, and
// inventory-gated on the ranked daily (402 NO_INVENTORY → upsell). The
// score penalty is locked in at reveal time and deducted by submitGuess.
// Rate-limited: reveals are at most 2 per screenshot, so a burst beyond
// this is automation, not play.
const revealLetterLimiter = createRateLimiter({ windowMs: 60_000, max: 20 })
router.post('/reveal-letter', authMiddleware, revealLetterLimiter, async (req, res, next) => {
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

    // Premium only changes the score cost in catch-up sessions (free
    // letters off the leaderboard) — same scoping as the metadata hints.
    const isPremium = await billingService.isPremium(req.userId!)

    const data = await gameService.revealLetter({
      tierSessionId,
      position,
      userId: req.userId!,
      isPremium,
    })

    res.json({ success: true, data })
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

    // Forfeit can still cross achievement thresholds; the EndGame response
    // body doesn't drive a toast, so the socket push is the only cue here.
    if (data.newlyEarnedAchievements?.length) {
      emitAchievementUnlocked(req.userId!, data.newlyEarnedAchievements)
    }

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
