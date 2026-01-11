import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'

const log = repoLogger.child({ repository: 'session' })

export interface GameSessionRow {
  id: string
  user_id: string
  daily_challenge_id: number
  current_tier: number
  current_position: number
  total_score: number
  is_completed: boolean
  started_at: Date
  completed_at: Date | null
}

export interface TierSessionRow {
  id: string
  game_session_id: string
  tier_id: number
  score: number
  correct_answers: number
  is_completed: boolean
  started_at: Date
  completed_at: Date | null
}

export interface TierSessionWithContext extends TierSessionRow {
  user_id: string
  game_total_score: number
  tier_number: number
  time_limit_seconds: number
}

export const sessionRepository = {
  async findGameSession(userId: string, challengeId: number): Promise<GameSessionRow | null> {
    log.debug({ userId, challengeId }, 'findGameSession')
    const row = await db('game_sessions')
      .where('user_id', userId)
      .andWhere('daily_challenge_id', challengeId)
      .first<GameSessionRow>()
    log.debug({ userId, challengeId, found: !!row }, 'findGameSession result')
    return row ?? null
  },

  async findGameSessionById(sessionId: string, userId: string): Promise<GameSessionRow | null> {
    log.debug({ sessionId, userId }, 'findGameSessionById')
    const row = await db('game_sessions')
      .where('id', sessionId)
      .andWhere('user_id', userId)
      .first<GameSessionRow>()
    log.debug({ sessionId, found: !!row }, 'findGameSessionById result')
    return row ?? null
  },

  async createGameSession(data: {
    userId: string
    dailyChallengeId: number
  }): Promise<GameSessionRow> {
    log.info({ userId: data.userId, challengeId: data.dailyChallengeId }, 'createGameSession')
    const [row] = await db('game_sessions')
      .insert({
        user_id: data.userId,
        daily_challenge_id: data.dailyChallengeId,
        current_tier: 1,
      })
      .returning<GameSessionRow[]>('*')
    log.info({ sessionId: row!.id, userId: data.userId }, 'game session created')
    return row!
  },

  async createTierSession(data: {
    gameSessionId: string
    tierId: number
  }): Promise<TierSessionRow> {
    log.debug({ gameSessionId: data.gameSessionId, tierId: data.tierId }, 'createTierSession')
    const [row] = await db('tier_sessions')
      .insert({
        game_session_id: data.gameSessionId,
        tier_id: data.tierId,
      })
      .returning<TierSessionRow[]>('*')
    log.debug({ tierSessionId: row!.id }, 'tier session created')
    return row!
  },

  async findTierSessionWithContext(tierSessionId: string): Promise<TierSessionWithContext | null> {
    log.debug({ tierSessionId }, 'findTierSessionWithContext')
    const row = await db('tier_sessions')
      .join('game_sessions', 'tier_sessions.game_session_id', 'game_sessions.id')
      .join('tiers', 'tier_sessions.tier_id', 'tiers.id')
      .where('tier_sessions.id', tierSessionId)
      .select<TierSessionWithContext>(
        'tier_sessions.*',
        'game_sessions.user_id',
        'game_sessions.total_score as game_total_score',
        'game_sessions.id as game_session_id',
        'tiers.tier_number',
        'tiers.time_limit_seconds'
      )
      .first()
    log.debug({ tierSessionId, found: !!row }, 'findTierSessionWithContext result')
    return row ?? null
  },

  async updateTierSession(tierSessionId: string, data: {
    score: number
    correctAnswers: number
  }): Promise<void> {
    log.debug({ tierSessionId, score: data.score, correctAnswers: data.correctAnswers }, 'updateTierSession')
    await db('tier_sessions')
      .where('id', tierSessionId)
      .update({
        score: data.score,
        correct_answers: data.correctAnswers,
      })
  },

  async updateGameSession(gameSessionId: string, data: {
    totalScore: number
    currentPosition: number
    isCompleted: boolean
  }): Promise<void> {
    log.info(
      { sessionId: gameSessionId, totalScore: data.totalScore, position: data.currentPosition, completed: data.isCompleted },
      'updateGameSession'
    )
    await db('game_sessions')
      .where('id', gameSessionId)
      .update({
        total_score: data.totalScore,
        current_position: data.currentPosition,
        is_completed: data.isCompleted,
        completed_at: data.isCompleted ? new Date() : undefined,
      })
  },

  async saveGuess(data: {
    tierSessionId: string
    screenshotId: number
    position: number
    guessedGameId: number | null
    guessedText: string
    isCorrect: boolean
    timeTakenMs: number
    scoreEarned: number
  }): Promise<void> {
    log.info(
      {
        tierSessionId: data.tierSessionId,
        position: data.position,
        isCorrect: data.isCorrect,
        scoreEarned: data.scoreEarned,
        timeTakenMs: data.timeTakenMs,
      },
      'saveGuess'
    )
    await db('guesses').insert({
      tier_session_id: data.tierSessionId,
      screenshot_id: data.screenshotId,
      position: data.position,
      guessed_game_id: data.guessedGameId,
      guessed_text: data.guessedText,
      is_correct: data.isCorrect,
      time_taken_ms: data.timeTakenMs,
      score_earned: data.scoreEarned,
    })
  },
}
