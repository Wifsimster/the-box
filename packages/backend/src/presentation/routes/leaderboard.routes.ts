import { Router } from 'express'
import {
  leaderboardService,
  userService,
} from '../../composition/services.js'
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware.js'
import { userRepository } from '../../infrastructure/repositories/user.repository.js'
import { createCountryLeaderboardHandler } from './country-leaderboard.handler.js'

const router = Router()

router.get('/session/:sessionId', optionalAuthMiddleware, async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const { sessionId } = req.params

    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_SESSION_ID', message: 'Session ID is required' },
      })
      return
    }

    const data = await userService.getPublicGameSessionDetails(sessionId, req.userId)

    res.json({
      success: true,
      data,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'TODAY_CHALLENGE_NOT_COMPLETED') {
      res.status(403).json({
        success: false,
        error: {
          code: 'TODAY_CHALLENGE_NOT_COMPLETED',
          message: "Complete today's challenge to view other players' answers",
        },
      })
      return
    }
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: { code: 'SESSION_NOT_FOUND', message: 'Session not found or not completed' },
      })
      return
    }
    next(error)
  }
})

const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

router.get('/session/:sessionId/standing', authMiddleware, async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const { sessionId } = req.params
    if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_SESSION_ID', message: 'Session ID must be a UUID' },
      })
      return
    }

    const data = await leaderboardService.getSessionStanding(sessionId, req.userId!)
    if (!data) {
      res.status(404).json({
        success: false,
        error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' },
      })
      return
    }

    res.json({ success: true, data })
  } catch (error) {
    next(error)
  }
})

router.get('/today', async (_req, res, next) => {
  try {
    const data = await leaderboardService.getTodayLeaderboard()

    res.json({
      success: true,
      data,
    })
  } catch (error) {
    next(error)
  }
})

router.get('/today/count', async (_req, res, next) => {
  try {
    const data = await leaderboardService.getTodayPlayerCount()
    res.set('Cache-Control', 'public, max-age=60')
    res.json({ success: true, data })
  } catch (error) {
    next(error)
  }
})

router.get('/today/percentile', async (req, res, next) => {
  try {
    const scoreParam = req.query.score as string | undefined

    if (!scoreParam || isNaN(Number(scoreParam))) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_SCORE', message: 'Score query parameter is required and must be a number' },
      })
      return
    }

    const score = Number(scoreParam)
    const data = await leaderboardService.getTodayPercentile(score)

    res.json({
      success: true,
      data,
    })
  } catch (error) {
    next(error)
  }
})

router.get(
  '/monthly/:year/:month/countries',
  optionalAuthMiddleware,
  createCountryLeaderboardHandler({
    getMonthlyCountryLeaderboard: (year, month, viewer) =>
      leaderboardService.getMonthlyCountryLeaderboard(year, month, viewer),
    findViewerCountry: async (userId) => (await userRepository.findById(userId))?.country ?? null,
  })
)

router.get('/monthly/:year/:month', async (req, res, next) => {
  try {
    const { year, month } = req.params

    const yearNum = Number(year)
    if (!/^\d{4}$/.test(year!) || yearNum < 2020 || yearNum > 2100) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_YEAR', message: 'Invalid year. Must be a 4-digit year between 2020 and 2100' },
      })
      return
    }

    const monthNum = Number(month)
    if (!/^\d{1,2}$/.test(month!) || monthNum < 1 || monthNum > 12) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_MONTH', message: 'Invalid month. Must be between 1 and 12' },
      })
      return
    }

    const data = await leaderboardService.getMonthlyLeaderboard(yearNum, monthNum)

    res.json({
      success: true,
      data,
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes('future months')) {
      res.status(400).json({
        success: false,
        error: { code: 'FUTURE_MONTH', message: error.message },
      })
      return
    }
    next(error)
  }
})

router.get('/:date', async (req, res, next) => {
  try {
    const { date } = req.params

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date!)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_DATE', message: 'Invalid date format. Use YYYY-MM-DD' },
      })
      return
    }

    const data = await leaderboardService.getLeaderboardByDate(date!)

    res.json({
      success: true,
      data,
    })
  } catch (error) {
    next(error)
  }
})

export default router
