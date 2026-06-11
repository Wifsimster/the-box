import type {
  GameHistoryResponse,
  GameSessionDetailsResponse,
  Game,
  GuessAttempt,
  Screenshot,
  MissedChallenge,
} from '@the-box/types'
import type {
  DomainLogger,
  ChallengeRepository,
  GameSessionRecord,
  SessionRepository,
} from '../ports/index.js'

const TOTAL_SCREENSHOTS = 10
const WRONG_GUESS_PENALTY = 0
// Free tier has no catch-up — only today's daily. Premium gets the full
// 365-day archive. Mirrors game.service.ts (kept duplicated rather than
// cross-imported to avoid pulling game.service into user.service's
// dependency graph).
const CATCH_UP_DAYS = 0
const PREMIUM_CATCH_UP_DAYS = 365

export interface UserService {
  getGameHistory(userId: string, isPremium?: boolean): Promise<GameHistoryResponse>
  getPublicGameSessionDetails(
    sessionId: string,
    requesterId?: string
  ): Promise<GameSessionDetailsResponse>
  getGameSessionDetails(
    sessionId: string,
    userId: string
  ): Promise<GameSessionDetailsResponse>
}

export interface UserServiceDeps {
  logger: DomainLogger
  sessionRepository: SessionRepository
  challengeRepository: ChallengeRepository
}

export function createUserService(deps: UserServiceDeps): UserService {
  const { sessionRepository, challengeRepository } = deps
  // Keep a child logger for parity with other services even when unused.
  void deps.logger.child({ service: 'user' })

  async function buildSessionDetailsResponse(
    gameSession: GameSessionRecord
  ): Promise<GameSessionDetailsResponse> {
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
      const tierScreenshots = await challengeRepository.findTierScreenshots(tier.id)
      for (const entry of tierScreenshots) {
        screenshotMap.set(entry.position, entry.screenshot)
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

        // All attempts the user made for this position, in order.
        const attempts: GuessAttempt[] = positionGuesses.map(g => ({
          guess: g.guessedText ?? '',
          isCorrect: g.isCorrect,
        }))

        if (correctGuess) {
          // LEGACY — historical rows only, do not remove. The metadata
          // hints were retired 2026-06 and new guesses always persist
          // power_up_used = null, but old sessions still display their
          // 20% hint penalty here. Only hints NOT paid from inventory
          // (inventory/premium hints were free) carried the penalty.
          let hintPenalty: number | undefined
          if (
            !correctGuess.hintFromInventory &&
            (correctGuess.powerUpUsed === 'hint_year' ||
              correctGuess.powerUpUsed === 'hint_publisher' ||
              correctGuess.powerUpUsed === 'hint_developer' ||
              correctGuess.powerUpUsed === 'hint_genre')
          ) {
            // The score_earned already has hint penalty deducted, so we need to calculate original
            // Original score = scoreEarned / 0.8, hint penalty = original * 0.2
            const originalScore = Math.round(correctGuess.scoreEarned / 0.8)
            hintPenalty = Math.round(originalScore * 0.2)
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
            attempts,
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
            attempts,
          }
        }
      })

    // Get unfound games (positions with no guesses).
    //
    // Anti-cheat belt-and-braces: if the player made zero guesses on this
    // session, do not return the names of the unfound games — they'd be
    // the full answer set. endGame already rejects forfeits without
    // progress, but legacy sessions written before that gate landed could
    // still exist with is_completed=true and zero guesses.
    const guessedPositions = Array.from(positionMap.keys())
    const allPositions = Array.from({ length: TOTAL_SCREENSHOTS }, (_, i) => i + 1)
    const unfoundPositions = allPositions.filter(pos => !guessedPositions.includes(pos))

    const unfoundGames: Array<{ position: number; game: Game; screenshot: Screenshot }> = []
    if (unfoundPositions.length > 0 && tier && guessedPositions.length > 0) {
      const unfoundTierScreenshots = await challengeRepository.findTierScreenshotsWithGames(
        tier.id,
        unfoundPositions
      )
      for (const entry of unfoundTierScreenshots) {
        unfoundGames.push({
          position: entry.position,
          game: entry.game,
          screenshot: entry.screenshot,
        })
      }
    }

    // Personal best is the user's highest completed score; tag this session
    // when its score equals that maximum (and is non-zero — a 0 isn't a PB).
    const userMaxScore = await sessionRepository.findMaxCompletedScore(gameSession.user_id)
    const isPersonalBest = gameSession.total_score > 0 && gameSession.total_score === userMaxScore

    return {
      sessionId: gameSession.id,
      challengeDate: challenge.challenge_date,
      totalScore: gameSession.total_score,
      isCompleted: gameSession.is_completed,
      completedAt: gameSession.completed_at?.toISOString() ?? null,
      totalScreenshots: TOTAL_SCREENSHOTS,
      isPersonalBest,
      guesses,
      unfoundGames,
    }
  }

  return {
    async getGameHistory(userId: string, isPremium: boolean = false): Promise<GameHistoryResponse> {
      const entries = await sessionRepository.findUserGameHistory(userId)

      // Premium users see the extended archive so they have something to
      // play beyond the 7-day window. Free users keep the existing list.
      const lookbackDays = isPremium ? PREMIUM_CATCH_UP_DAYS : CATCH_UP_DAYS
      const recentChallenges = await challengeRepository.findRecentChallenges(lookbackDays)

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
          roundsCorrect: entry.rounds_correct,
          totalScreenshots: entry.total_screenshots,
        })),
        missedChallenges,
      }
    },

    async getPublicGameSessionDetails(
      sessionId: string,
      requesterId?: string
    ): Promise<GameSessionDetailsResponse> {
      const gameSession = await sessionRepository.findCompletedGameSessionById(sessionId)
      if (!gameSession) {
        throw new Error('Session not found or not completed')
      }

      // Anti-cheat: viewing another player's answers reveals the correct
      // games. For the current daily challenge, only allow it once the
      // requester has actually played and completed that same challenge
      // themselves. Past challenges stay open (catch-up scores don't
      // count on the leaderboard). The `guessCount > 0` check is the
      // belt-and-braces guard against a session that ended up marked
      // completed without any real attempt.
      const challenge = await challengeRepository.findById(gameSession.daily_challenge_id)
      const today = new Date().toISOString().split('T')[0]
      if (challenge && challenge.challenge_date === today) {
        const requesterSession = requesterId
          ? await sessionRepository.findGameSession(requesterId, gameSession.daily_challenge_id)
          : null
        if (!requesterSession?.is_completed) {
          throw new Error('TODAY_CHALLENGE_NOT_COMPLETED')
        }
        const guessCount = await sessionRepository.countGuessesBySession(requesterSession.id)
        if (guessCount === 0) {
          throw new Error('TODAY_CHALLENGE_NOT_COMPLETED')
        }
      }

      return buildSessionDetailsResponse(gameSession)
    },

    async getGameSessionDetails(
      sessionId: string,
      userId: string
    ): Promise<GameSessionDetailsResponse> {
      const gameSession = await sessionRepository.findGameSessionById(sessionId, userId)
      if (!gameSession) {
        throw new Error('Session not found')
      }
      return buildSessionDetailsResponse(gameSession)
    },
  }
}
