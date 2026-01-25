import { Router } from 'express'
import { leaderboardService, userService } from '../../domain/services/index.js'

const router = Router()

// Get public session details (for viewing other players' answers)
router.get('/session/:sessionId', async (req, res, next) => {
  try {
    const { sessionId } = req.params

    if (!sessionId) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_SESSION_ID', message: 'Session ID is required' },
      })
      return
    }

    const data = await userService.getPublicGameSessionDetails(sessionId)

    res.json({
      success: true,
      data,
    })
  } catch (error) {
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

// Get today's leaderboard
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

// Get percentile ranking for a score on today's challenge
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

// Get monthly leaderboard - MUST be before /:date to prevent pattern conflict
router.get('/monthly/:year/:month', async (req, res, next) => {
  try {
    const { year, month } = req.params

    // Validate year (4 digits, reasonable range)
    const yearNum = Number(year)
    if (!/^\d{4}$/.test(year!) || yearNum < 2020 || yearNum > 2100) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_YEAR', message: 'Invalid year. Must be a 4-digit year between 2020 and 2100' },
      })
      return
    }

    // Validate month (1-12)
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

// Get leaderboard for specific date
router.get('/:date', async (req, res, next) => {
  try {
    const { date } = req.params

    // Validate date format
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
