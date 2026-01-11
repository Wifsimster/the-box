import { Router } from 'express'
import { leaderboardService } from '../../domain/services/index.js'

const router = Router()

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
