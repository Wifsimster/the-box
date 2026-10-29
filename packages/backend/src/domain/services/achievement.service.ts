import type {
  AchievementRepository,
  DomainLogger,
  AchievementUserContext,
} from '../ports/index.js'
import type {
  AchievementRow,
  UserAchievementWithDetails,
} from '../types/achievement.types.js'

export interface AchievementCheckContext {
  userId: string
  sessionId: string
  challengeId: number
  sessionScore: number
  isComplete: boolean
}

export interface GuessData {
  position: number
  isCorrect: boolean
  roundTimeTakenMs: number
  powerUpUsed: string | null
  screenshotId: number
}

export interface GameCompletionData {
  userId: string
  sessionId: string
  challengeId: number
  totalScore: number
  streakBonusTotal?: number
  guesses: GuessData[]
  gameGenres: string[]
  currentStreak: number
  longestStreak: number
}

export interface NewlyEarnedAchievement {
  key: string
  name: string
  description: string
  category: string
  iconUrl: string | null
  points: number
  tier: number
}

export interface AchievementWithProgressRow
  extends AchievementRow {
  earned: boolean
  earnedAt: Date | null
  progress: number
  progressMax: number | null
}

export interface AchievementStats {
  totalEarned: number
  totalPoints: number
  byCategory: Record<string, number>
  byTier: Record<number, number>
}

export interface AchievementService {
  checkAchievementsAfterGame(data: GameCompletionData): Promise<NewlyEarnedAchievement[]>
  evaluateAccountAgeMilestones(userId: string): Promise<NewlyEarnedAchievement[]>
  getAllAchievementsWithProgress(userId: string): Promise<AchievementWithProgressRow[]>
  getUserAchievements(userId: string): Promise<UserAchievementWithDetails[]>
  getUserStats(userId: string): Promise<AchievementStats>
  getLeaderboard(
    limit?: number
  ): ReturnType<AchievementRepository['getLeaderboard']>
}

export interface AchievementServiceDeps {
  logger: DomainLogger
  achievementRepository: AchievementRepository
  userRepository: AchievementUserContext
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Criteria = Record<string, any>

interface ProgressTotals {
  challengesCompleted: number
  challengesStarted: number
  totalGuesses: number
  totalCorrectGuesses: number
  totalWrongGuesses: number
  currentStreak: number
  speedGuesses3s: number
  speedGuesses5s: number
  hintFreeGames: number
}

export const ACHIEVEMENT_CRITERIA_TYPES = [
  'perfect_score',
  'min_score',
  'consecutive_speed',
  'total_speed',
  'single_speed',
  'no_hints',
  'consecutive_correct',
  'streak',
  'genre_master',
  'challenges_completed',
  'leaderboard_rank',
  'challenges_started',
  'total_guesses',
  'total_correct_guesses',
  'correct_in_game',
  'perfect_score_count',
  'attempts_in_game',
  'comeback_in_game',
  'first_try_in_game',
  'flawless_game',
  'total_wrong_guesses',
  'account_age_days',
  'geogamers_runs_completed',
  'geogamers_perfect_run',
] as const

export type AchievementCriteriaType = (typeof ACHIEVEMENT_CRITERIA_TYPES)[number]

interface CriterionHandler {
  evaluate?: (
    achievement: AchievementRow,
    data: GameCompletionData,
    criteria: Criteria
  ) => Promise<boolean>
  progress?: (
    achievement: AchievementRow,
    criteria: Criteria,
    totals: ProgressTotals,
    userId: string
  ) => Promise<number | null> | number | null
}

export function createAchievementService(deps: AchievementServiceDeps): AchievementService {
  const { achievementRepository, userRepository } = deps
  const log = deps.logger.child({ service: 'achievement' })

  async function checkPerfectScore(
    achievement: AchievementRow,
    data: GameCompletionData
  ): Promise<boolean> {
    if (data.totalScore - (data.streakBonusTotal ?? 0) === 2000) {
      await achievementRepository.awardAchievement(data.userId, achievement.key, 2000, 2000)
      return true
    }
    return false
  }

  async function checkMinScore(
    achievement: AchievementRow,
    data: GameCompletionData,
    criteria: Criteria
  ): Promise<boolean> {
    if (data.totalScore >= criteria.score) {
      await achievementRepository.awardAchievement(
        data.userId,
        achievement.key,
        data.totalScore,
        criteria.score
      )
      return true
    }
    return false
  }

  async function checkConsecutiveSpeed(
    achievement: AchievementRow,
    data: GameCompletionData,
    criteria: Criteria
  ): Promise<boolean> {
    let consecutiveCount = 0
    let maxConsecutive = 0

    for (const guess of data.guesses) {
      if (guess.isCorrect && guess.roundTimeTakenMs <= criteria.max_time_ms) {
        consecutiveCount++
        maxConsecutive = Math.max(maxConsecutive, consecutiveCount)
      } else {
        consecutiveCount = 0
      }
    }

    if (maxConsecutive >= criteria.count) {
      await achievementRepository.awardAchievement(
        data.userId,
        achievement.key,
        maxConsecutive,
        criteria.count
      )
      return true
    }

    return false
  }

  async function checkTotalSpeed(
    achievement: AchievementRow,
    data: GameCompletionData,
    criteria: Criteria
  ): Promise<boolean> {
    const totalCount = await achievementRepository.countSpeedCorrectGuesses(
      data.userId,
      criteria.max_time_ms
    )

    if (totalCount >= criteria.count) {
      await achievementRepository.awardAchievement(
        data.userId,
        achievement.key,
        totalCount,
        criteria.count
      )
      return true
    }

    return false
  }

  async function checkSingleSpeed(
    achievement: AchievementRow,
    data: GameCompletionData,
    criteria: Criteria
  ): Promise<boolean> {
    const hasFastGuess = data.guesses.some(
      g => g.isCorrect && g.roundTimeTakenMs <= criteria.max_time_ms
    )

    if (hasFastGuess) {
      await achievementRepository.awardAchievement(data.userId, achievement.key, 1, 1)
      return true
    }

    return false
  }

  async function checkNoHints(
    achievement: AchievementRow,
    data: GameCompletionData,
    criteria: Criteria
  ): Promise<boolean> {
    const usedHints = data.guesses.some(g => g.powerUpUsed !== null)
    const lettersRevealed = await achievementRepository.countSessionLetterReveals(
      data.sessionId
    )

    if (!usedHints && lettersRevealed === 0) {
      const totalHintFreeGames = await achievementRepository.countHintFreeCompletedGames(
        data.userId
      )

      if (totalHintFreeGames >= criteria.count) {
        await achievementRepository.awardAchievement(
          data.userId,
          achievement.key,
          totalHintFreeGames,
          criteria.count
        )
        return true
      }
    }

    return false
  }

  async function checkConsecutiveCorrect(
    achievement: AchievementRow,
    data: GameCompletionData,
    criteria: Criteria
  ): Promise<boolean> {
    const recent = await achievementRepository.findRecentGuessCorrectness(
      data.userId,
      criteria.count
    )

    let consecutiveCorrect = 0
    for (const guess of recent) {
      if (guess.isCorrect) {
        consecutiveCorrect++
      } else {
        break
      }
    }

    if (consecutiveCorrect >= criteria.count) {
      await achievementRepository.awardAchievement(
        data.userId,
        achievement.key,
        consecutiveCorrect,
        criteria.count
      )
      return true
    }

    return false
  }

  async function checkStreak(
    achievement: AchievementRow,
    data: GameCompletionData,
    criteria: Criteria
  ): Promise<boolean> {
    if (data.currentStreak >= criteria.days) {
      await achievementRepository.awardAchievement(
        data.userId,
        achievement.key,
        data.currentStreak,
        criteria.days
      )
      return true
    }
    return false
  }

  async function checkGenreMaster(
    achievement: AchievementRow,
    data: GameCompletionData,
    criteria: Criteria
  ): Promise<boolean> {
    const targetGenre = criteria.genre
    const genreCount = await achievementRepository.countGenreCorrectGuesses(
      data.userId,
      targetGenre
    )

    if (genreCount >= criteria.count) {
      await achievementRepository.awardAchievement(
        data.userId,
        achievement.key,
        genreCount,
        criteria.count,
        { genre: targetGenre }
      )
      return true
    }

    return false
  }

  async function checkChallengesCompleted(
    achievement: AchievementRow,
    data: GameCompletionData,
    criteria: Criteria
  ): Promise<boolean> {
    const totalCompleted = await achievementRepository.countCompletedGameSessions(data.userId)

    if (totalCompleted >= criteria.count) {
      await achievementRepository.awardAchievement(
        data.userId,
        achievement.key,
        totalCompleted,
        criteria.count
      )
      return true
    }

    return false
  }

  async function checkLeaderboardRank(
    achievement: AchievementRow,
    data: GameCompletionData,
    criteria: Criteria
  ): Promise<boolean> {
    const rankings = await achievementRepository.findChallengeUserRanking(data.challengeId)
    const userRank = rankings.findIndex(r => r.userId === data.userId) + 1

    if (userRank > 0 && userRank <= criteria.max_rank) {
      await achievementRepository.awardAchievement(
        data.userId,
        achievement.key,
        userRank,
        criteria.max_rank,
        { challengeId: data.challengeId, rank: userRank }
      )
      return true
    }

    return false
  }

  async function checkChallengesStarted(
    achievement: AchievementRow,
    data: GameCompletionData,
    criteria: Criteria
  ): Promise<boolean> {
    const totalStarted = await achievementRepository.countStartedGameSessions(data.userId)

    if (totalStarted >= criteria.count) {
      await achievementRepository.awardAchievement(
        data.userId,
        achievement.key,
        totalStarted,
        criteria.count
      )
      return true
    }

    return false
  }

  async function checkTotalGuesses(
    achievement: AchievementRow,
    data: GameCompletionData,
    criteria: Criteria
  ): Promise<boolean> {
    const totalGuesses = await achievementRepository.countAllGuesses(data.userId)

    if (totalGuesses >= criteria.count) {
      await achievementRepository.awardAchievement(
        data.userId,
        achievement.key,
        totalGuesses,
        criteria.count
      )
      return true
    }

    return false
  }

  async function checkTotalCorrectGuesses(
    achievement: AchievementRow,
    data: GameCompletionData,
    criteria: Criteria
  ): Promise<boolean> {
    const totalCorrect = await achievementRepository.countCorrectGuesses(data.userId)

    if (totalCorrect >= criteria.count) {
      await achievementRepository.awardAchievement(
        data.userId,
        achievement.key,
        totalCorrect,
        criteria.count
      )
      return true
    }

    return false
  }

  async function checkCorrectInGame(
    achievement: AchievementRow,
    data: GameCompletionData,
    criteria: Criteria
  ): Promise<boolean> {
    const correctInGame = data.guesses.filter(g => g.isCorrect).length

    if (correctInGame >= criteria.count) {
      await achievementRepository.awardAchievement(
        data.userId,
        achievement.key,
        correctInGame,
        criteria.count
      )
      return true
    }

    return false
  }

  async function checkPerfectScoreCount(
    achievement: AchievementRow,
    data: GameCompletionData,
    criteria: Criteria
  ): Promise<boolean> {
    const total = await achievementRepository.countPerfectSessions(data.userId)
    if (total >= criteria.count) {
      await achievementRepository.awardAchievement(
        data.userId,
        achievement.key,
        total,
        criteria.count
      )
      return true
    }
    return false
  }

  async function checkAttemptsInGame(
    achievement: AchievementRow,
    data: GameCompletionData,
    criteria: Criteria
  ): Promise<boolean> {
    const attemptsByScreenshot = new Map<number, number>()
    for (const guess of data.guesses) {
      attemptsByScreenshot.set(
        guess.screenshotId,
        (attemptsByScreenshot.get(guess.screenshotId) ?? 0) + 1
      )
    }
    const maxAttempts = Math.max(0, ...attemptsByScreenshot.values())

    if (maxAttempts >= criteria.count) {
      await achievementRepository.awardAchievement(
        data.userId,
        achievement.key,
        maxAttempts,
        criteria.count
      )
      return true
    }

    return false
  }

  async function checkComebackInGame(
    achievement: AchievementRow,
    data: GameCompletionData,
    criteria: Criteria
  ): Promise<boolean> {
    const wrongByScreenshot = new Map<number, number>()
    const solvedScreenshots = new Set<number>()
    for (const guess of data.guesses) {
      if (guess.isCorrect) {
        solvedScreenshots.add(guess.screenshotId)
      } else {
        wrongByScreenshot.set(
          guess.screenshotId,
          (wrongByScreenshot.get(guess.screenshotId) ?? 0) + 1
        )
      }
    }

    let maxComeback = 0
    for (const screenshotId of solvedScreenshots) {
      maxComeback = Math.max(maxComeback, wrongByScreenshot.get(screenshotId) ?? 0)
    }

    if (maxComeback >= criteria.count) {
      await achievementRepository.awardAchievement(
        data.userId,
        achievement.key,
        maxComeback,
        criteria.count
      )
      return true
    }

    return false
  }

  async function checkFirstTryInGame(
    achievement: AchievementRow,
    data: GameCompletionData,
    criteria: Criteria
  ): Promise<boolean> {
    const wrongByScreenshot = new Map<number, number>()
    const solvedScreenshots = new Set<number>()
    for (const guess of data.guesses) {
      if (guess.isCorrect) {
        solvedScreenshots.add(guess.screenshotId)
      } else {
        wrongByScreenshot.set(
          guess.screenshotId,
          (wrongByScreenshot.get(guess.screenshotId) ?? 0) + 1
        )
      }
    }

    let firstTryCount = 0
    for (const screenshotId of solvedScreenshots) {
      if ((wrongByScreenshot.get(screenshotId) ?? 0) === 0) {
        firstTryCount++
      }
    }

    if (firstTryCount >= criteria.count) {
      await achievementRepository.awardAchievement(
        data.userId,
        achievement.key,
        firstTryCount,
        criteria.count
      )
      return true
    }

    return false
  }

  async function checkFlawlessGame(
    achievement: AchievementRow,
    data: GameCompletionData,
    criteria: Criteria
  ): Promise<boolean> {
    const correctCount = data.guesses.filter(g => g.isCorrect).length
    const wrongCount = data.guesses.filter(g => !g.isCorrect).length

    if (wrongCount === 0 && correctCount >= criteria.count) {
      await achievementRepository.awardAchievement(
        data.userId,
        achievement.key,
        correctCount,
        criteria.count
      )
      return true
    }

    return false
  }

  async function checkTotalWrongGuesses(
    achievement: AchievementRow,
    data: GameCompletionData,
    criteria: Criteria
  ): Promise<boolean> {
    const totalWrong = await achievementRepository.countWrongGuesses(data.userId)

    if (totalWrong >= criteria.count) {
      await achievementRepository.awardAchievement(
        data.userId,
        achievement.key,
        totalWrong,
        criteria.count
      )
      return true
    }

    return false
  }

  async function checkAccountAgeDays(
    achievement: AchievementRow,
    userId: string,
    accountAgeDays: number,
    criteria: Criteria
  ): Promise<boolean> {
    if (accountAgeDays >= criteria.days) {
      await achievementRepository.awardAchievement(
        userId,
        achievement.key,
        accountAgeDays,
        criteria.days
      )
      return true
    }
    return false
  }

  const criteriaRegistry: Record<AchievementCriteriaType, CriterionHandler> = {
    perfect_score: {
      evaluate: (achievement, data) => checkPerfectScore(achievement, data),
    },
    min_score: {
      evaluate: (achievement, data, criteria) => checkMinScore(achievement, data, criteria),
    },
    consecutive_speed: {
      evaluate: (achievement, data, criteria) =>
        checkConsecutiveSpeed(achievement, data, criteria),
    },
    single_speed: {
      evaluate: (achievement, data, criteria) => checkSingleSpeed(achievement, data, criteria),
    },
    consecutive_correct: {
      evaluate: (achievement, data, criteria) =>
        checkConsecutiveCorrect(achievement, data, criteria),
    },
    correct_in_game: {
      evaluate: (achievement, data, criteria) => checkCorrectInGame(achievement, data, criteria),
    },
    attempts_in_game: {
      evaluate: (achievement, data, criteria) => checkAttemptsInGame(achievement, data, criteria),
    },
    comeback_in_game: {
      evaluate: (achievement, data, criteria) => checkComebackInGame(achievement, data, criteria),
    },
    first_try_in_game: {
      evaluate: (achievement, data, criteria) => checkFirstTryInGame(achievement, data, criteria),
    },
    flawless_game: {
      evaluate: (achievement, data, criteria) => checkFlawlessGame(achievement, data, criteria),
    },
    perfect_score_count: {
      evaluate: (achievement, data, criteria) =>
        checkPerfectScoreCount(achievement, data, criteria),
    },

    total_speed: {
      evaluate: (achievement, data, criteria) => checkTotalSpeed(achievement, data, criteria),
      progress: (_achievement, criteria, totals) =>
        criteria.max_time_ms <= 3000 ? totals.speedGuesses3s : totals.speedGuesses5s,
    },
    no_hints: {
      evaluate: (achievement, data, criteria) => checkNoHints(achievement, data, criteria),
      progress: (_achievement, _criteria, totals) => totals.hintFreeGames,
    },
    streak: {
      evaluate: (achievement, data, criteria) => checkStreak(achievement, data, criteria),
      progress: (_achievement, _criteria, totals) => totals.currentStreak,
    },
    challenges_completed: {
      evaluate: (achievement, data, criteria) =>
        checkChallengesCompleted(achievement, data, criteria),
      progress: (_achievement, _criteria, totals) => totals.challengesCompleted,
    },
    challenges_started: {
      evaluate: (achievement, data, criteria) =>
        checkChallengesStarted(achievement, data, criteria),
      progress: (_achievement, _criteria, totals) => totals.challengesStarted,
    },
    total_guesses: {
      evaluate: (achievement, data, criteria) => checkTotalGuesses(achievement, data, criteria),
      progress: (_achievement, _criteria, totals) => totals.totalGuesses,
    },
    total_correct_guesses: {
      evaluate: (achievement, data, criteria) =>
        checkTotalCorrectGuesses(achievement, data, criteria),
      progress: (_achievement, _criteria, totals) => totals.totalCorrectGuesses,
    },
    total_wrong_guesses: {
      evaluate: (achievement, data, criteria) =>
        checkTotalWrongGuesses(achievement, data, criteria),
      progress: (_achievement, _criteria, totals) => totals.totalWrongGuesses,
    },
    genre_master: {
      evaluate: (achievement, data, criteria) => checkGenreMaster(achievement, data, criteria),
      progress: async (_achievement, criteria, _totals, userId) =>
        criteria.genre
          ? await achievementRepository.countGenreCorrectGuesses(userId, criteria.genre)
          : null,
    },
    leaderboard_rank: {
      evaluate: (achievement, data, criteria) =>
        checkLeaderboardRank(achievement, data, criteria),
      progress: async (_achievement, criteria, _totals, userId) => {
        if (!criteria.max_rank) return null
        const bestRank = await achievementRepository.getUserBestChallengeRank(userId)
        return bestRank !== null && bestRank <= criteria.max_rank ? 1 : 0
      },
    },

    account_age_days: {},
    geogamers_runs_completed: {},
    geogamers_perfect_run: {},
  }

  async function checkSingleAchievement(
    achievement: AchievementRow,
    data: GameCompletionData
  ): Promise<boolean> {
    const criteria = achievement.criteria

    if (!criteria || !criteria.type) {
      return false
    }

    const handler = criteriaRegistry[criteria.type as AchievementCriteriaType]
    if (!handler) {
      log.warn({ type: criteria.type }, 'Unknown achievement criteria type')
      return false
    }
    if (!handler.evaluate) {
      return false
    }

    try {
      return await handler.evaluate(achievement, data, criteria)
    } catch (error) {
      log.error({ error, achievementKey: achievement.key }, 'Error checking achievement')
      return false
    }
  }

  function extractProgressMaxFromCriteria(criteria: Criteria | null): number | null {
    if (!criteria || !criteria.type) {
      return null
    }
    if (criteria.count !== undefined) return criteria.count
    if (criteria.days !== undefined) return criteria.days
    if (criteria.score !== undefined) return criteria.score
    if (criteria.max_rank !== undefined) return criteria.max_rank
    return null
  }

  async function calculateCurrentProgress(userId: string): Promise<Record<string, number>> {
    const progress: Record<string, number> = {}

    const allAchievements = await achievementRepository.findAll()

    const [
      challengesCompleted,
      challengesStarted,
      totalGuesses,
      totalCorrectGuesses,
      totalWrongGuesses,
      currentStreak,
      speedGuesses3s,
      speedGuesses5s,
      hintFreeGames,
    ] = await Promise.all([
      achievementRepository.countCompletedGameSessions(userId),
      achievementRepository.countStartedGameSessions(userId),
      achievementRepository.countAllGuesses(userId),
      achievementRepository.countCorrectGuesses(userId),
      achievementRepository.countWrongGuesses(userId),
      userRepository.getCurrentStreak(userId),
      achievementRepository.countSpeedCorrectGuesses(userId, 3000),
      achievementRepository.countSpeedCorrectGuesses(userId, 5000),
      achievementRepository.countHintFreeCompletedGames(userId),
    ])

    const totals: ProgressTotals = {
      challengesCompleted,
      challengesStarted,
      totalGuesses,
      totalCorrectGuesses,
      totalWrongGuesses,
      currentStreak,
      speedGuesses3s,
      speedGuesses5s,
      hintFreeGames,
    }

    for (const achievement of allAchievements) {
      const criteria = achievement.criteria
      if (!criteria || !criteria.type) continue

      const handler = criteriaRegistry[criteria.type as AchievementCriteriaType]
      if (!handler?.progress) continue

      const value = await handler.progress(achievement, criteria, totals, userId)
      if (value !== null && value !== undefined) {
        progress[achievement.key] = value
      }
    }

    return progress
  }

  const service: AchievementService = {
    async checkAchievementsAfterGame(
      data: GameCompletionData
    ): Promise<NewlyEarnedAchievement[]> {
      log.info(
        { userId: data.userId, sessionId: data.sessionId },
        'Checking achievements after game completion'
      )

      const newlyEarned: NewlyEarnedAchievement[] = []

      const allAchievements = await achievementRepository.findAll()
      const userProgress = await achievementRepository.getUserProgress(data.userId)

      for (const achievement of allAchievements) {
        if (userProgress[achievement.key]) {
          continue
        }

        const earned = await checkSingleAchievement(achievement, data)
        if (earned) {
          newlyEarned.push({
            key: achievement.key,
            name: achievement.name,
            description: achievement.description || '',
            category: achievement.category,
            iconUrl: achievement.icon_url,
            points: achievement.points,
            tier: achievement.tier,
          })
        }
      }

      log.info({ userId: data.userId, count: newlyEarned.length }, 'Achievement check complete')
      return newlyEarned
    },

    async evaluateAccountAgeMilestones(
      userId: string
    ): Promise<NewlyEarnedAchievement[]> {
      const newlyEarned: NewlyEarnedAchievement[] = []

      const user = await userRepository.findById(userId)
      if (!user) return newlyEarned

      const createdAtMs = new Date(user.createdAt).getTime()
      const accountAgeDays = Math.floor(
        (Date.now() - createdAtMs) / (24 * 60 * 60 * 1000)
      )
      if (accountAgeDays < 1) return newlyEarned

      const allAchievements = await achievementRepository.findAll()
      const userProgress = await achievementRepository.getUserProgress(userId)

      for (const achievement of allAchievements) {
        if (userProgress[achievement.key]) continue
        const criteria = achievement.criteria
        if (!criteria || criteria.type !== 'account_age_days') continue

        const earned = await checkAccountAgeDays(
          achievement,
          userId,
          accountAgeDays,
          criteria
        )
        if (earned) {
          newlyEarned.push({
            key: achievement.key,
            name: achievement.name,
            description: achievement.description || '',
            category: achievement.category,
            iconUrl: achievement.icon_url,
            points: achievement.points,
            tier: achievement.tier,
          })
        }
      }

      if (newlyEarned.length > 0) {
        log.info(
          { userId, accountAgeDays, count: newlyEarned.length },
          'Account-age milestones unlocked'
        )
      }
      return newlyEarned
    },

    async getAllAchievementsWithProgress(
      userId: string
    ): Promise<AchievementWithProgressRow[]> {
      const allAchievements = await achievementRepository.findAll()
      const userProgress = await achievementRepository.getUserProgress(userId)

      const currentProgress = await calculateCurrentProgress(userId)

      return allAchievements.map(achievement => {
        const progress = userProgress[achievement.key]
        const isEarned = !!progress

        const criteriaMax = extractProgressMaxFromCriteria(achievement.criteria)

        return {
          ...achievement,
          earned: isEarned,
          earnedAt: progress?.earned_at || null,
          progress: currentProgress[achievement.key] || 0,
          progressMax: criteriaMax,
        }
      })
    },

    async getUserAchievements(userId: string): Promise<UserAchievementWithDetails[]> {
      return achievementRepository.findUserAchievements(userId)
    },

    async getUserStats(userId: string): Promise<AchievementStats> {
      const achievementsWithProgress = await service.getAllAchievementsWithProgress(userId)

      const stats: AchievementStats = {
        totalEarned: 0,
        totalPoints: 0,
        byCategory: {},
        byTier: {},
      }

      for (const achievement of achievementsWithProgress) {
        const isEarned =
          achievement.earned ||
          (achievement.progressMax != null && achievement.progress >= achievement.progressMax)

        if (isEarned) {
          stats.totalEarned++
          stats.totalPoints += achievement.points
          stats.byCategory[achievement.category] =
            (stats.byCategory[achievement.category] || 0) + 1
          stats.byTier[achievement.tier] = (stats.byTier[achievement.tier] || 0) + 1
        }
      }

      return stats
    },

    async getLeaderboard(limit: number = 100) {
      return achievementRepository.getLeaderboard(limit)
    },
  }

  return service
}
