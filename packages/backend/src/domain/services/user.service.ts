import { sessionRepository, challengeRepository } from '../../infrastructure/repositories/index.js'
import { db } from '../../infrastructure/database/connection.js'
import type { GameHistoryResponse, GameSessionDetailsResponse, Game, Screenshot, MissedChallenge } from '@the-box/types'

const TOTAL_SCREENSHOTS = 10
const WRONG_GUESS_PENALTY = 0
const CATCH_UP_DAYS = 7

export const userService = {
  async getGameHistory(userId: string): Promise<GameHistoryResponse> {
    const entries = await sessionRepository.findUserGameHistory(userId)

    // Get recent challenges (last CATCH_UP_DAYS days)
    const recentChallenges = await challengeRepository.findRecentChallenges(CATCH_UP_DAYS)

    // Get today's date to exclude it from missed challenges
    const today = new Date().toISOString().split('T')[0]

    // Get the set of dates the user has played
    const playedDates = new Set(entries.map(entry => entry.challenge_date))

    // Calculate missed challenges (challenges with no session, excluding today)
    const missedChallenges: MissedChallenge[] = recentChallenges
      .filter(challenge => {
        const challengeDate = challenge.challenge_date
        // Exclude today's challenge and challenges already played
        return challengeDate !== today && !playedDates.has(challengeDate)
      })
      .map(challenge => ({
        challengeId: challenge.id,
        date: challenge.challenge_date,
      }))

    return {
      entries: entries.map(entry => ({
        sessionId: entry.session_id,
        challengeDate: entry.challenge_date,
        totalScore: entry.total_score,
        isCompleted: entry.is_completed,
        completedAt: entry.completed_at?.toISOString() ?? null,
      })),
      missedChallenges,
    }
  },

  async getPublicGameSessionDetails(sessionId: string): Promise<GameSessionDetailsResponse> {
    // Only allow viewing completed sessions (for public access)
    const gameSession = await sessionRepository.findCompletedGameSessionById(sessionId)
    if (!gameSession) {
      throw new Error('Session not found or not completed')
    }

    return this.buildSessionDetailsResponse(gameSession)
  },

  async getGameSessionDetails(sessionId: string, userId: string): Promise<GameSessionDetailsResponse> {
    // Verify the session belongs to the user
    const gameSession = await sessionRepository.findGameSessionById(sessionId, userId)
    if (!gameSession) {
      throw new Error('Session not found')
    }

    return this.buildSessionDetailsResponse(gameSession)
  },

  async buildSessionDetailsResponse(gameSession: Awaited<ReturnType<typeof sessionRepository.findGameSessionById>> & object): Promise<GameSessionDetailsResponse> {

    // Get challenge date
    const challenge = await challengeRepository.findById(gameSession.daily_challenge_id)
    if (!challenge) {
      throw new Error('Challenge not found')
    }

    // Get all guesses for this session
    const guessesData = await sessionRepository.findGuessesByGameSession(gameSession.id)

    // Get tier screenshots with game info for all positions
    const tiers = await challengeRepository.findTiersByChallenge(gameSession.daily_challenge_id)
    const tier = tiers[0]

    // Create a map of position -> screenshot data
    const screenshotMap = new Map<number, Screenshot>()
    if (tier) {
      const tierScreenshots = await db('tier_screenshots')
        .join('screenshots', 'tier_screenshots.screenshot_id', 'screenshots.id')
        .where('tier_screenshots.tier_id', tier.id)
        .select(
          'tier_screenshots.position',
          'screenshots.id as screenshot_id',
          'screenshots.image_url',
          'screenshots.thumbnail_url',
          'screenshots.difficulty',
          'screenshots.location_hint',
          'screenshots.game_id'
        )
        .orderBy('tier_screenshots.position', 'asc')

      for (const row of tierScreenshots) {
        screenshotMap.set(row.position, {
          id: row.screenshot_id,
          gameId: row.game_id,
          imageUrl: row.image_url,
          thumbnailUrl: row.thumbnail_url ?? undefined,
          difficulty: row.difficulty,
          locationHint: row.location_hint ?? undefined,
        })
      }
    }

    // Group guesses by position and find the correct one for each position
    const positionMap = new Map<number, typeof guessesData>()
    for (const guess of guessesData) {
      const existing = positionMap.get(guess.position) || []
      existing.push(guess)
      positionMap.set(guess.position, existing)
    }

    // Transform guesses to match GuessResult structure
    const guesses = Array.from(positionMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([position, positionGuesses]) => {
        // Find the correct guess (if any)
        const correctGuess = positionGuesses.find(g => g.isCorrect)
        // Get the first guess (for userGuess display)
        const firstGuess = positionGuesses[0]!

        if (correctGuess) {
          // Calculate hint penalty (20% of score if hint was used)
          let hintPenalty: number | undefined
          if (correctGuess.powerUpUsed === 'hint_year' || correctGuess.powerUpUsed === 'hint_publisher') {
            // The score_earned already has hint penalty deducted, so we need to calculate original
            // Original score = scoreEarned / 0.8, hint penalty = original * 0.2
            const originalScore = Math.round(correctGuess.scoreEarned / 0.8)
            hintPenalty = Math.round(originalScore * 0.20)
          }

          const correctGame: Game = {
            id: correctGuess.correctGameId,
            name: correctGuess.correctGameName,
            slug: correctGuess.correctGameSlug,
            aliases: [],
            coverImageUrl: correctGuess.correctGameCoverImageUrl ?? undefined,
            releaseYear: correctGuess.correctGameReleaseYear ?? undefined,
            publisher: correctGuess.correctGamePublisher ?? undefined,
            developer: correctGuess.correctGameDeveloper ?? undefined,
            metacritic: correctGuess.correctGameMetacritic ?? undefined,
          }

          return {
            position,
            isCorrect: true,
            correctGame,
            userGuess: firstGuess.guessedText || null,
            timeTakenMs: correctGuess.timeTakenMs,
            scoreEarned: correctGuess.scoreEarned,
            hintPenalty,
            tryNumber: correctGuess.tryNumber,
            screenshot: screenshotMap.get(position)!,
          }
        } else {
          // No correct guess - use the last guess for display
          const lastGuess = positionGuesses[positionGuesses.length - 1]!

          // Get correct game info from the screenshot
          const anyGuess = positionGuesses[0]!
          const correctGame: Game = {
            id: anyGuess.correctGameId,
            name: anyGuess.correctGameName,
            slug: anyGuess.correctGameSlug,
            aliases: [],
            coverImageUrl: anyGuess.correctGameCoverImageUrl ?? undefined,
            releaseYear: anyGuess.correctGameReleaseYear ?? undefined,
            publisher: anyGuess.correctGamePublisher ?? undefined,
            developer: anyGuess.correctGameDeveloper ?? undefined,
            metacritic: anyGuess.correctGameMetacritic ?? undefined,
          }

          return {
            position,
            isCorrect: false,
            correctGame,
            userGuess: lastGuess.guessedText || null,
            timeTakenMs: lastGuess.timeTakenMs,
            scoreEarned: 0,
            wrongGuessPenalty: WRONG_GUESS_PENALTY,
            tryNumber: lastGuess.tryNumber,
            screenshot: screenshotMap.get(position)!,
          }
        }
      })

    // Get unfound games (positions with no guesses)
    const guessedPositions = Array.from(positionMap.keys())
    const allPositions = Array.from({ length: TOTAL_SCREENSHOTS }, (_, i) => i + 1)
    const unfoundPositions = allPositions.filter(pos => !guessedPositions.includes(pos))

    const unfoundGames: Array<{ position: number; game: Game; screenshot: Screenshot }> = []
    if (unfoundPositions.length > 0) {
      // Get the tier for this challenge
      const tiers = await challengeRepository.findTiersByChallenge(gameSession.daily_challenge_id)
      const tier = tiers[0]
      if (tier) {
        // Get tier screenshots with game info for unfound positions
        const unfoundTierScreenshots = await db('tier_screenshots')
          .join('screenshots', 'tier_screenshots.screenshot_id', 'screenshots.id')
          .join('games', 'screenshots.game_id', 'games.id')
          .where('tier_screenshots.tier_id', tier.id)
          .whereIn('tier_screenshots.position', unfoundPositions)
          .select(
            'tier_screenshots.position',
            'screenshots.id as screenshot_id',
            'screenshots.image_url',
            'screenshots.thumbnail_url',
            'screenshots.difficulty',
            'screenshots.location_hint',
            'screenshots.game_id',
            'games.id as game_id',
            'games.name as game_name',
            'games.slug as game_slug',
            'games.cover_image_url',
            'games.release_year',
            'games.developer',
            'games.publisher',
            'games.metacritic'
          )
          .orderBy('tier_screenshots.position', 'asc')

        for (const row of unfoundTierScreenshots) {
          unfoundGames.push({
            position: row.position,
            game: {
              id: row.game_id,
              name: row.game_name,
              slug: row.game_slug,
              aliases: [],
              coverImageUrl: row.cover_image_url ?? undefined,
              releaseYear: row.release_year ?? undefined,
              developer: row.developer ?? undefined,
              publisher: row.publisher ?? undefined,
              metacritic: row.metacritic ?? undefined,
            },
            screenshot: {
              id: row.screenshot_id,
              gameId: row.game_id,
              imageUrl: row.image_url,
              thumbnailUrl: row.thumbnail_url ?? undefined,
              difficulty: row.difficulty,
              locationHint: row.location_hint ?? undefined,
            },
          })
        }
      }
    }

    return {
      sessionId: gameSession.id,
      challengeDate: challenge.challenge_date,
      totalScore: gameSession.total_score,
      isCompleted: gameSession.is_completed,
      completedAt: gameSession.completed_at?.toISOString() ?? null,
      totalScreenshots: TOTAL_SCREENSHOTS,
      guesses,
      unfoundGames,
    }
  },
}
