import type {
  AchievementRepository,
  DomainLogger,
  UserRepository,
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
  /**
   * Check and award achievements after a game session completes
   */
  checkAchievementsAfterGame(data: GameCompletionData): Promise<NewlyEarnedAchievement[]>
  /**
   * Get all achievements with user's progress
   */
  getAllAchievementsWithProgress(userId: string): Promise<AchievementWithProgressRow[]>
  /**
   * Get user's earned achievements
   */
  getUserAchievements(userId: string): Promise<UserAchievementWithDetails[]>
  /**
   * Get achievement statistics for a user
   */
  getUserStats(userId: string): Promise<AchievementStats>
  /**
   * Get achievement leaderboard
   */
  getLeaderboard(
    limit?: number
  ): ReturnType<AchievementRepository['getLeaderboard']>
}

export interface AchievementServiceDeps {
  logger: DomainLogger
  achievementRepository: AchievementRepository
  userRepository: UserRepository
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Criteria = Record<string, any>

export function createAchievementService(deps: AchievementServiceDeps): AchievementService {
  const { achievementRepository, userRepository } = deps
  const log = deps.logger.child({ service: 'achievement' })

  async function checkPerfectScore(
    achievement: AchievementRow,
    data: GameCompletionData
  ): Promise<boolean> {
    if (data.totalScore === 2000) {
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

    if (!usedHints) {
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

  async function checkSingleAchievement(
    achievement: AchievementRow,
    data: GameCompletionData
  ): Promise<boolean> {
    const criteria = achievement.criteria

    if (!criteria || !criteria.type) {
      return false
    }

    try {
      switch (criteria.type) {
        case 'perfect_score':
          return checkPerfectScore(achievement, data)
        case 'min_score':
          return checkMinScore(achievement, data, criteria)
        case 'consecutive_speed':
          return checkConsecutiveSpeed(achievement, data, criteria)
        case 'total_speed':
          return checkTotalSpeed(achievement, data, criteria)
        case 'single_speed':
          return checkSingleSpeed(achievement, data, criteria)
        case 'no_hints':
          return checkNoHints(achievement, data, criteria)
        case 'consecutive_correct':
          return checkConsecutiveCorrect(achievement, data, criteria)
        case 'streak':
          return checkStreak(achievement, data, criteria)
        case 'genre_master':
          return checkGenreMaster(achievement, data, criteria)
        case 'challenges_completed':
          return checkChallengesCompleted(achievement, data, criteria)
        case 'leaderboard_rank':
          return checkLeaderboardRank(achievement, data, criteria)
        case 'challenges_started':
          return checkChallengesStarted(achievement, data, criteria)
        case 'total_guesses':
          return checkTotalGuesses(achievement, data, criteria)
        case 'total_correct_guesses':
          return checkTotalCorrectGuesses(achievement, data, criteria)
        case 'correct_in_game':
          return checkCorrectInGame(achievement, data, criteria)
        default:
          log.warn({ type: criteria.type }, 'Unknown achievement criteria type')
          return false
      }
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
      currentStreak,
      speedGuesses3s,
      speedGuesses5s,
      hintFreeGames,
    ] = await Promise.all([
      achievementRepository.countCompletedGameSessions(userId),
      achievementRepository.countStartedGameSessions(userId),
      achievementRepository.countAllGuesses(userId),
      achievementRepository.countCorrectGuesses(userId),
      userRepository.getCurrentStreak(userId),
      achievementRepository.countSpeedCorrectGuesses(userId, 3000),
      achievementRepository.countSpeedCorrectGuesses(userId, 5000),
      achievementRepository.countHintFreeCompletedGames(userId),
    ])

    // Map progress to achievement keys based on their criteria type
    for (const achievement of allAchievements) {
      const criteria = achievement.criteria
      if (!criteria || !criteria.type) continue

      switch (criteria.type) {
        case 'challenges_completed':
          progress[achievement.key] = challengesCompleted
          break
        case 'challenges_started':
          progress[achievement.key] = challengesStarted
          break
        case 'total_guesses':
          progress[achievement.key] = totalGuesses
          break
        case 'total_correct_guesses':
          progress[achievement.key] = totalCorrectGuesses
          break
        case 'streak':
          progress[achievement.key] = currentStreak
          break
        case 'total_speed':
          if (criteria.max_time_ms <= 3000) {
            progress[achievement.key] = speedGuesses3s
          } else {
            progress[achievement.key] = speedGuesses5s
          }
          break
        case 'no_hints':
          progress[achievement.key] = hintFreeGames
          break
        case 'genre_master':
          if (criteria.genre) {
            progress[achievement.key] = await achievementRepository.countGenreCorrectGuesses(
              userId,
              criteria.genre
            )
          }
          break
        case 'leaderboard_rank':
          if (criteria.max_rank) {
            const bestRank = await achievementRepository.getUserBestChallengeRank(userId)
            progress[achievement.key] =
              bestRank !== null && bestRank <= criteria.max_rank ? 1 : 0
          }
          break
        // Other types (perfect_score, min_score, consecutive_speed, etc.)
        // are session-based and don't have meaningful cumulative progress
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
