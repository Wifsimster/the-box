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

export interface GameHistoryRow {
  session_id: string
  challenge_date: string
  total_score: number
  is_completed: boolean
  completed_at: Date | null
}

export interface TierSessionRow {
  id: string
  game_session_id: string
  tier_id: number
  score: number
  correct_answers: number
  wrong_guesses: number
  is_completed: boolean
  started_at: Date
  completed_at: Date | null
}

export interface TierSessionWithContext extends TierSessionRow {
  user_id: string
  game_total_score: number
  game_session_started_at: Date
  game_session_id: string
  daily_challenge_id: number
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

  async findLatestTierSession(gameSessionId: string): Promise<TierSessionRow | null> {
    log.debug({ gameSessionId }, 'findLatestTierSession')
    const row = await db('tier_sessions')
      .where('game_session_id', gameSessionId)
      .orderBy('started_at', 'desc')
      .first<TierSessionRow>()
    log.debug({ gameSessionId, found: !!row, tierSessionId: row?.id }, 'findLatestTierSession result')
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
        'game_sessions.started_at as game_session_started_at',
        'game_sessions.id as game_session_id',
        'game_sessions.daily_challenge_id',
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
    wrongGuesses?: number
  }): Promise<void> {
    log.debug({ tierSessionId, score: data.score, correctAnswers: data.correctAnswers, wrongGuesses: data.wrongGuesses }, 'updateTierSession')
    const updateData: Record<string, number> = {
      score: data.score,
      correct_answers: data.correctAnswers,
    }
    if (data.wrongGuesses !== undefined) {
      updateData.wrong_guesses = data.wrongGuesses
    }
    await db('tier_sessions')
      .where('id', tierSessionId)
      .update(updateData)
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
    sessionElapsedMs: number
    scoreEarned: number
  }): Promise<void> {
    log.info(
      {
        tierSessionId: data.tierSessionId,
        position: data.position,
        isCorrect: data.isCorrect,
        scoreEarned: data.scoreEarned,
        sessionElapsedMs: data.sessionElapsedMs,
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
      time_taken_ms: data.sessionElapsedMs,
      session_elapsed_ms: data.sessionElapsedMs,
      score_earned: data.scoreEarned,
    })
  },

  async getCorrectAnswersCount(tierSessionId: string): Promise<number> {
    log.debug({ tierSessionId }, 'getCorrectAnswersCount')
    const result = await db('guesses')
      .where('tier_session_id', tierSessionId)
      .andWhere('is_correct', true)
      .count('id as count')
      .first<{ count: string }>()
    const count = parseInt(result?.count ?? '0', 10)
    log.debug({ tierSessionId, correctCount: count }, 'getCorrectAnswersCount result')
    return count
  },

  async getExhaustedPositionsCount(tierSessionId: string, maxTries: number): Promise<number> {
    log.debug({ tierSessionId, maxTries }, 'getExhaustedPositionsCount')
    // Count positions where tries >= maxTries and no correct answer
    const result = await db('guesses')
      .where('tier_session_id', tierSessionId)
      .groupBy('position')
      .havingRaw('COUNT(*) >= ? AND SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) = 0', [maxTries])
      .count('* as exhausted_count')
    log.debug({ tierSessionId, exhaustedCount: result.length }, 'getExhaustedPositionsCount result')
    return result.length
  },

  async getCorrectPositions(gameSessionId: string): Promise<number[]> {
    log.debug({ gameSessionId }, 'getCorrectPositions')
    // Get all positions with correct guesses across all tier sessions for this game
    const result = await db('guesses')
      .join('tier_sessions', 'guesses.tier_session_id', 'tier_sessions.id')
      .where('tier_sessions.game_session_id', gameSessionId)
      .andWhere('guesses.is_correct', true)
      .distinct('guesses.position')
      .orderBy('guesses.position')
      .select<{ position: number }[]>('guesses.position')
    const positions = result.map(r => r.position)
    log.debug({ gameSessionId, correctPositions: positions }, 'getCorrectPositions result')
    return positions
  },

  async deleteGameSession(userId: string, challengeId: number): Promise<boolean> {
    log.info({ userId, challengeId }, 'deleteGameSession')

    // First find the game session
    const session = await db('game_sessions')
      .where('user_id', userId)
      .andWhere('daily_challenge_id', challengeId)
      .first<GameSessionRow>()

    if (!session) {
      log.debug({ userId, challengeId }, 'No game session found to delete')
      return false
    }

    // Delete guesses from all tier sessions for this game session
    await db('guesses')
      .whereIn('tier_session_id', function () {
        this.select('id').from('tier_sessions').where('game_session_id', session.id)
      })
      .delete()

    // Delete tier sessions
    await db('tier_sessions')
      .where('game_session_id', session.id)
      .delete()

    // Delete game session
    await db('game_sessions')
      .where('id', session.id)
      .delete()

    log.info({ userId, challengeId, sessionId: session.id }, 'Game session deleted successfully')
    return true
  },

  async findUserGameHistory(userId: string): Promise<GameHistoryRow[]> {
    log.debug({ userId }, 'findUserGameHistory')
    const rows = await db('game_sessions')
      .join('daily_challenges', 'game_sessions.daily_challenge_id', 'daily_challenges.id')
      .where('game_sessions.user_id', userId)
      .orderBy('daily_challenges.challenge_date', 'desc')
      .select<GameHistoryRow[]>(
        'game_sessions.id as session_id',
        'daily_challenges.challenge_date',
        'game_sessions.total_score',
        'game_sessions.is_completed',
        'game_sessions.completed_at'
      )
    log.debug({ userId, count: rows.length }, 'findUserGameHistory result')
    return rows
  },

  async findAllInProgressSessions(): Promise<GameSessionRow[]> {
    log.debug('findAllInProgressSessions')
    const rows = await db('game_sessions')
      .where('is_completed', false)
      .select<GameSessionRow[]>('*')
    log.debug({ count: rows.length }, 'findAllInProgressSessions result')
    return rows
  },

  async findGuessesByGameSession(gameSessionId: string): Promise<Array<{
    id: number
    tierSessionId: string
    screenshotId: number
    position: number
    tryNumber: number
    guessedGameId: number | null
    guessedText: string | null
    isCorrect: boolean
    timeTakenMs: number
    sessionElapsedMs: number
    scoreEarned: number
    powerUpUsed: string | null
    correctGameId: number
    correctGameName: string
    correctGameSlug: string
    correctGameCoverImageUrl: string | null
    correctGameReleaseYear: number | null
    correctGameMetacritic: number | null
    correctGamePublisher: string | null
    correctGameDeveloper: string | null
    createdAt: Date
  }>> {
    log.debug({ gameSessionId }, 'findGuessesByGameSession')
    const rows = await db('guesses')
      .join('tier_sessions', 'guesses.tier_session_id', 'tier_sessions.id')
      .join('screenshots', 'guesses.screenshot_id', 'screenshots.id')
      .join('games as correct_game', 'screenshots.game_id', 'correct_game.id')
      .where('tier_sessions.game_session_id', gameSessionId)
      .orderBy('guesses.position', 'asc')
      .orderBy('guesses.created_at', 'asc')
      .select<
        Array<{
          id: number
          tier_session_id: string
          screenshot_id: number
          position: number
          guessed_game_id: number | null
          guessed_text: string | null
          is_correct: boolean
          time_taken_ms: number
          session_elapsed_ms: number
          score_earned: number
          power_up_used: string | null
          correct_game_id: number
          correct_game_name: string
          correct_game_slug: string
          correct_game_cover_image_url: string | null
          correct_game_release_year: number | null
          correct_game_metacritic: number | null
          correct_game_publisher: string | null
          correct_game_developer: string | null
          created_at: Date
        }>
      >(
        'guesses.id',
        'guesses.tier_session_id',
        'guesses.screenshot_id',
        'guesses.position',
        'guesses.guessed_game_id',
        'guesses.guessed_text',
        'guesses.is_correct',
        'guesses.time_taken_ms',
        'guesses.session_elapsed_ms',
        'guesses.score_earned',
        'guesses.power_up_used',
        'correct_game.id as correct_game_id',
        'correct_game.name as correct_game_name',
        'correct_game.slug as correct_game_slug',
        'correct_game.cover_image_url as correct_game_cover_image_url',
        'correct_game.release_year as correct_game_release_year',
        'correct_game.metacritic as correct_game_metacritic',
        'correct_game.publisher as correct_game_publisher',
        'correct_game.developer as correct_game_developer',
        'guesses.created_at'
      )

    // Calculate try_number for each guess by counting previous guesses for the same position
    const positionCounts = new Map<number, number>()

    const result = rows.map(row => {
      const position = row.position
      const currentCount = (positionCounts.get(position) || 0) + 1
      positionCounts.set(position, currentCount)

      return {
        id: row.id,
        tierSessionId: row.tier_session_id,
        screenshotId: row.screenshot_id,
        position: row.position,
        tryNumber: currentCount,
        guessedGameId: row.guessed_game_id,
        guessedText: row.guessed_text,
        isCorrect: row.is_correct,
        timeTakenMs: row.time_taken_ms,
        sessionElapsedMs: row.session_elapsed_ms,
        scoreEarned: row.score_earned,
        powerUpUsed: row.power_up_used,
        correctGameId: row.correct_game_id,
        correctGameName: row.correct_game_name,
        correctGameSlug: row.correct_game_slug,
        correctGameCoverImageUrl: row.correct_game_cover_image_url,
        correctGameReleaseYear: row.correct_game_release_year,
        correctGameMetacritic: row.correct_game_metacritic,
        correctGamePublisher: row.correct_game_publisher,
        correctGameDeveloper: row.correct_game_developer,
        createdAt: row.created_at,
      }
    })

    log.debug({ gameSessionId, count: result.length }, 'findGuessesByGameSession result')
    return result
  },
}
