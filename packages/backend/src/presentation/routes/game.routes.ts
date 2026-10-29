import { Router } from 'express'
import type { Request } from 'express'
import { z } from 'zod'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  GameError,
} from '../../domain/services/index.js'
import {
  gameService,
} from '../../composition/services.js'
import {
  billingService,
} from '../../composition/services.js'
import { challengeRepository, gameRepository, screenshotRepository } from '../../infrastructure/repositories/index.js'
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware.js'
import { createRateLimiter } from '../middleware/rate-limit.middleware.js'
import { validateBody } from '../middleware/validation.middleware.js'
import { emitAchievementUnlocked } from '../../infrastructure/socket/socket.js'
import { resolveUploadRelativePath, sendUploadFile } from './upload-file.js'
import { maybeCaptureDescription } from '../../composition/describe-capture.js'
import { logger } from '../../infrastructure/logger/logger.js'

const previewMetaLimiter = createRateLimiter({ windowMs: 60_000, max: 60 })
const previewImageLimiter = createRateLimiter({ windowMs: 60_000, max: 30 })

const guessUserKey = (req: Request): string => req.userId ?? req.ip ?? 'unknown'
const guessLimiter = createRateLimiter({ windowMs: 60_000, max: 60, key: guessUserKey })

const router = Router()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadsPath = path.resolve(__dirname, '..', '..', '..', '..', '..', 'uploads')

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

    const relativePath = resolveUploadRelativePath(uploadsPath, preview.imageUrl)
    if (!relativePath) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Screenshot not found' },
      })
      return
    }

    sendUploadFile(
      res,
      uploadsPath,
      relativePath,
      { maxAge: '10m', headers: { 'Content-Type': 'image/jpeg' } },
      next
    )
  } catch (error) {
    next(error)
  }
})

const IMAGE_EXTENSION_CONTENT_TYPE: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

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

    const relativePath = resolveUploadRelativePath(uploadsPath, screenshot.imageUrl)
    if (!relativePath) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Screenshot not found' },
      })
      return
    }

    sendUploadFile(
      res,
      uploadsPath,
      relativePath,
      {
        maxAge: '1d',
        headers: {
          'Content-Type': contentType,
          'X-Content-Type-Options': 'nosniff',
        },
      },
      next
    )
  } catch (error) {
    next(error)
  }
})

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

router.post('/start/:challengeId', authMiddleware, async (req, res, next) => {
  try {
    const challengeId = parseInt(req.params['challengeId'] as string, 10)
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

const MAX_GUESS_LENGTH = 200
const guessBody = z.object({
  tierSessionId: z.string().min(1).max(100),
  screenshotId: z.number().int(),
  position: z.number().int().nonnegative(),
  gameId: z.number().int().nullable().optional().default(null),
  guessText: z.string().max(MAX_GUESS_LENGTH),
  roundTimeTakenMs: z.number().nonnegative().optional().default(0),
})

router.post('/guess', authMiddleware, guessLimiter, validateBody(guessBody), async (req, res, next) => {
  try {
    const { tierSessionId, screenshotId, position, gameId, guessText, roundTimeTakenMs } =
      req.body as z.infer<typeof guessBody>

    const data = await gameService.submitGuess({
      tierSessionId,
      screenshotId,
      position,
      gameId,
      guessText,
      roundTimeTakenMs,
      userId: req.userId!,
    })

    if (data.newlyEarnedAchievements?.length) {
      emitAchievementUnlocked(req.userId!, data.newlyEarnedAchievements)
    }

    res.json({
      success: true,
      data,
    })

    if (!data.isCorrect) {
      maybeCaptureDescription({
        userId: req.userId!,
        isGuest: req.isGuest ?? false,
        tierSessionId,
        position,
        screenshotId,
        guessText,
        locale: /^en\b/i.test(req.headers['accept-language'] ?? '') ? 'en' : 'fr',
      }).catch((err: unknown) => {
        logger.warn({ err: err instanceof Error ? err.message : String(err), position }, 'describe-guess capture not enqueued')
      })
    }
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
