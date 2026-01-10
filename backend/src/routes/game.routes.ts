import { Router } from 'express'
import { db } from '../config/database.js'
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.js'

const router = Router()

// Get today's challenge
router.get('/today', optionalAuthMiddleware, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0]!

    // Find today's challenge with tiers
    const challenge = await db('daily_challenges')
      .where('challenge_date', today)
      .first()

    if (!challenge) {
      return res.json({
        success: true,
        data: {
          challengeId: null,
          date: today,
          tiers: [],
          hasPlayed: false,
          userSession: null,
        },
      })
    }

    // Get tiers for this challenge
    const tiers = await db('tiers')
      .where('daily_challenge_id', challenge.id)
      .orderBy('tier_number', 'asc')

    // Check if user has played today
    let userSession = null
    if (req.userId) {
      const session = await db('game_sessions')
        .where('user_id', req.userId)
        .andWhere('daily_challenge_id', challenge.id)
        .first()

      if (session) {
        userSession = {
          sessionId: session.id,
          currentTier: session.current_tier,
          currentPosition: session.current_position,
          isCompleted: session.is_completed,
          totalScore: session.total_score,
        }
      }
    }

    res.json({
      success: true,
      data: {
        challengeId: challenge.id,
        date: challenge.challenge_date,
        tiers: tiers.map(t => ({
          tierNumber: t.tier_number,
          name: t.name,
          screenshotCount: 18,
        })),
        hasPlayed: !!userSession,
        userSession,
      },
    })
  } catch (error) {
    throw error
  }
})

// Start a tier session
router.post('/start/:tierId', authMiddleware, async (req, res) => {
  try {
    const tierId = parseInt(req.params.tierId as string, 10)

    // Get tier info with daily challenge
    const tier = await db('tiers')
      .where('tiers.id', tierId)
      .first()

    if (!tier) {
      return res.status(404).json({
        success: false,
        error: { code: 'TIER_NOT_FOUND', message: 'Tier not found' },
      })
    }

    // Create or get game session
    let gameSession = await db('game_sessions')
      .where('user_id', req.userId!)
      .andWhere('daily_challenge_id', tier.daily_challenge_id)
      .first()

    if (!gameSession) {
      const [newSession] = await db('game_sessions')
        .insert({
          user_id: req.userId!,
          daily_challenge_id: tier.daily_challenge_id,
          current_tier: tier.tier_number,
        })
        .returning('*')
      gameSession = newSession
    }

    // Create tier session
    const [tierSession] = await db('tier_sessions')
      .insert({
        game_session_id: gameSession.id,
        tier_id: tier.id,
      })
      .returning('*')

    res.json({
      success: true,
      data: {
        sessionId: gameSession.id,
        tierSessionId: tierSession.id,
        tierNumber: tier.tier_number,
        tierName: tier.name,
        timeLimit: tier.time_limit_seconds,
        totalScreenshots: 18,
      },
    })
  } catch (error) {
    throw error
  }
})

// Get current screenshot
router.get('/screenshot', authMiddleware, async (req, res) => {
  try {
    const { sessionId, position } = req.query

    if (!sessionId || !position) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'sessionId and position required' },
      })
    }

    // Get game session
    const session = await db('game_sessions')
      .where('id', sessionId as string)
      .andWhere('user_id', req.userId!)
      .first()

    if (!session) {
      return res.status(404).json({
        success: false,
        error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' },
      })
    }

    // Get current tier
    const tier = await db('tiers')
      .where('daily_challenge_id', session.daily_challenge_id)
      .andWhere('tier_number', session.current_tier)
      .first()

    if (!tier) {
      return res.status(404).json({
        success: false,
        error: { code: 'TIER_NOT_FOUND', message: 'Tier not found' },
      })
    }

    // Get screenshot for this position with join
    const tierScreenshot = await db('tier_screenshots')
      .join('screenshots', 'tier_screenshots.screenshot_id', 'screenshots.id')
      .where('tier_screenshots.tier_id', tier.id)
      .andWhere('tier_screenshots.position', parseInt(position as string, 10))
      .select(
        'tier_screenshots.position',
        'tier_screenshots.bonus_multiplier',
        'screenshots.id as screenshot_id',
        'screenshots.image_url',
        'screenshots.haov',
        'screenshots.vaov'
      )
      .first()

    if (!tierScreenshot) {
      return res.status(404).json({
        success: false,
        error: { code: 'SCREENSHOT_NOT_FOUND', message: 'Screenshot not found' },
      })
    }

    res.json({
      success: true,
      data: {
        position: tierScreenshot.position,
        imageUrl: tierScreenshot.image_url,
        haov: tierScreenshot.haov,
        vaov: tierScreenshot.vaov,
        timeLimit: tier.time_limit_seconds,
        bonusMultiplier: parseFloat(tierScreenshot.bonus_multiplier),
      },
    })
  } catch (error) {
    throw error
  }
})

// Submit a guess
router.post('/guess', authMiddleware, async (req, res) => {
  try {
    const { tierSessionId, screenshotId, position, gameId, guessText, timeTakenMs } = req.body

    // Get tier session with game session and tier
    const tierSession = await db('tier_sessions')
      .join('game_sessions', 'tier_sessions.game_session_id', 'game_sessions.id')
      .join('tiers', 'tier_sessions.tier_id', 'tiers.id')
      .where('tier_sessions.id', tierSessionId)
      .select(
        'tier_sessions.*',
        'game_sessions.user_id',
        'game_sessions.total_score as game_total_score',
        'game_sessions.id as game_session_id',
        'tiers.tier_number',
        'tiers.time_limit_seconds'
      )
      .first()

    if (!tierSession || tierSession.user_id !== req.userId) {
      return res.status(404).json({
        success: false,
        error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' },
      })
    }

    // Get screenshot and correct game
    const screenshot = await db('screenshots')
      .join('games', 'screenshots.game_id', 'games.id')
      .where('screenshots.id', screenshotId)
      .select(
        'screenshots.game_id',
        'games.id as game_id',
        'games.name as game_name',
        'games.cover_image_url'
      )
      .first()

    if (!screenshot) {
      return res.status(404).json({
        success: false,
        error: { code: 'SCREENSHOT_NOT_FOUND', message: 'Screenshot not found' },
      })
    }

    // Check if correct
    const isCorrect = gameId === screenshot.game_id

    // Calculate score
    let scoreEarned = 0
    if (isCorrect) {
      const baseScore = 100
      const timeRatio = timeTakenMs / (tierSession.time_limit_seconds * 1000)
      let timeBonus = 0
      if (timeRatio < 0.25) timeBonus = 100
      else if (timeRatio < 0.75) timeBonus = Math.round(100 * (1 - (timeRatio - 0.25) / 0.5))
      scoreEarned = baseScore + timeBonus
    }

    // Save guess
    await db('guesses').insert({
      tier_session_id: tierSessionId,
      screenshot_id: screenshotId,
      position,
      guessed_game_id: gameId,
      guessed_text: guessText,
      is_correct: isCorrect,
      time_taken_ms: timeTakenMs,
      score_earned: scoreEarned,
    })

    // Update tier session
    await db('tier_sessions')
      .where('id', tierSessionId)
      .update({
        score: tierSession.score + scoreEarned,
        correct_answers: tierSession.correct_answers + (isCorrect ? 1 : 0),
      })

    // Update game session
    const newTotalScore = tierSession.game_total_score + scoreEarned
    const isTierCompleted = position >= 18
    const isCompleted = isTierCompleted && tierSession.tier_number >= 3

    await db('game_sessions')
      .where('id', tierSession.game_session_id)
      .update({
        total_score: newTotalScore,
        current_position: isTierCompleted ? 1 : position + 1,
        current_tier: isTierCompleted ? tierSession.tier_number + 1 : tierSession.tier_number,
        is_completed: isCompleted,
        completed_at: isCompleted ? new Date() : undefined,
      })

    res.json({
      success: true,
      data: {
        isCorrect,
        correctGame: {
          id: screenshot.game_id,
          name: screenshot.game_name,
          coverImageUrl: screenshot.cover_image_url,
        },
        scoreEarned,
        totalScore: newTotalScore,
        nextPosition: isTierCompleted ? null : position + 1,
        isCompleted,
        isTierCompleted,
      },
    })
  } catch (error) {
    throw error
  }
})

// Search games (autocomplete)
router.get('/games/search', async (req, res) => {
  try {
    const { q } = req.query

    if (!q || typeof q !== 'string' || q.length < 2) {
      return res.json({
        success: true,
        data: { games: [] },
      })
    }

    // Simple search with ILIKE for PostgreSQL
    const results = await db('games')
      .whereILike('name', `%${q}%`)
      .orderBy('name', 'desc')
      .limit(10)

    res.json({
      success: true,
      data: {
        games: results.map(g => ({
          id: g.id,
          name: g.name,
          releaseYear: g.release_year,
          coverImageUrl: g.cover_image_url,
        })),
      },
    })
  } catch (error) {
    throw error
  }
})

export default router
