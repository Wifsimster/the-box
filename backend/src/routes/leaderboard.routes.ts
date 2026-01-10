import { Router } from 'express'
import { db } from '../config/database.js'

const router = Router()

// Get today's leaderboard
router.get('/today', async (_req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0]!

    // Find today's challenge
    const challenge = await db('daily_challenges')
      .where('challenge_date', today)
      .first()

    if (!challenge) {
      return res.json({
        success: true,
        data: {
          date: today,
          entries: [],
        },
      })
    }

    // Get completed sessions for today with user info
    const sessions = await db('game_sessions')
      .join('users', 'game_sessions.user_id', 'users.id')
      .where('game_sessions.daily_challenge_id', challenge.id)
      .andWhere('game_sessions.is_completed', true)
      .orderBy('game_sessions.total_score', 'desc')
      .limit(100)
      .select(
        'game_sessions.user_id',
        'game_sessions.total_score',
        'game_sessions.completed_at',
        'users.username',
        'users.display_name',
        'users.avatar_url'
      )

    const entries = sessions.map((session, index) => ({
      rank: index + 1,
      userId: session.user_id,
      username: session.username,
      displayName: session.display_name,
      avatarUrl: session.avatar_url,
      totalScore: session.total_score,
      completedAt: session.completed_at,
    }))

    res.json({
      success: true,
      data: {
        date: today,
        challengeId: challenge.id,
        entries,
      },
    })
  } catch (error) {
    throw error
  }
})

// Get leaderboard for specific date
router.get('/:date', async (req, res) => {
  try {
    const { date } = req.params

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_DATE', message: 'Invalid date format. Use YYYY-MM-DD' },
      })
    }

    // Find challenge for date
    const challenge = await db('daily_challenges')
      .where('challenge_date', date)
      .first()

    if (!challenge) {
      return res.json({
        success: true,
        data: {
          date,
          entries: [],
        },
      })
    }

    // Get completed sessions with user info
    const sessions = await db('game_sessions')
      .join('users', 'game_sessions.user_id', 'users.id')
      .where('game_sessions.daily_challenge_id', challenge.id)
      .andWhere('game_sessions.is_completed', true)
      .orderBy('game_sessions.total_score', 'desc')
      .limit(100)
      .select(
        'game_sessions.user_id',
        'game_sessions.total_score',
        'game_sessions.completed_at',
        'users.username',
        'users.display_name',
        'users.avatar_url'
      )

    const entries = sessions.map((session, index) => ({
      rank: index + 1,
      userId: session.user_id,
      username: session.username,
      displayName: session.display_name,
      avatarUrl: session.avatar_url,
      totalScore: session.total_score,
      completedAt: session.completed_at,
    }))

    res.json({
      success: true,
      data: {
        date,
        challengeId: challenge.id,
        entries,
      },
    })
  } catch (error) {
    throw error
  }
})

export default router
