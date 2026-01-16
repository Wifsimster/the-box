import { achievementRepository } from '../../infrastructure/repositories/index.js'
import { db } from '../../infrastructure/database/connection.js'
import { serviceLogger } from '../../infrastructure/logger/logger.js'
import type { AchievementRow, UserAchievementWithDetails } from '../../infrastructure/repositories/achievement.repository.js'

const log = serviceLogger.child({ service: 'achievement' })

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

export class AchievementService {
    /**
     * Check and award achievements after a game session completes
     */
    async checkAchievementsAfterGame(data: GameCompletionData): Promise<NewlyEarnedAchievement[]> {
        log.info({ userId: data.userId, sessionId: data.sessionId }, 'Checking achievements after game completion')

        const newlyEarned: NewlyEarnedAchievement[] = []

        // Get all achievements and user's current progress
        const allAchievements = await achievementRepository.findAll()
        const userProgress = await achievementRepository.getUserProgress(data.userId)

        // Check each achievement type
        for (const achievement of allAchievements) {
            // Skip if already earned
            if (userProgress[achievement.key]) {
                continue
            }

            const earned = await this.checkSingleAchievement(achievement, data)
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
    }

    /**
     * Check a single achievement against game completion data
     */
    private async checkSingleAchievement(
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
                    return this.checkPerfectScore(achievement, data)

                case 'min_score':
                    return this.checkMinScore(achievement, data, criteria)

                case 'consecutive_speed':
                    return this.checkConsecutiveSpeed(achievement, data, criteria)

                case 'total_speed':
                    return this.checkTotalSpeed(achievement, data, criteria)

                case 'single_speed':
                    return this.checkSingleSpeed(achievement, data, criteria)

                case 'no_hints':
                    return this.checkNoHints(achievement, data, criteria)

                case 'consecutive_correct':
                    return this.checkConsecutiveCorrect(achievement, data, criteria)

                case 'streak':
                    return this.checkStreak(achievement, data, criteria)

                case 'genre_master':
                    return this.checkGenreMaster(achievement, data, criteria)

                case 'challenges_completed':
                    return this.checkChallengesCompleted(achievement, data, criteria)

                case 'leaderboard_rank':
                    return this.checkLeaderboardRank(achievement, data, criteria)

                default:
                    log.warn({ type: criteria.type }, 'Unknown achievement criteria type')
                    return false
            }
        } catch (error) {
            log.error({ error, achievementKey: achievement.key }, 'Error checking achievement')
            return false
        }
    }

    /**
     * Check perfect score (2000 points)
     */
    private async checkPerfectScore(achievement: AchievementRow, data: GameCompletionData): Promise<boolean> {
        if (data.totalScore === 2000) {
            await achievementRepository.awardAchievement(data.userId, achievement.key, 2000, 2000)
            return true
        }
        return false
    }

    /**
     * Check minimum score threshold
     */
    private async checkMinScore(achievement: AchievementRow, data: GameCompletionData, criteria: any): Promise<boolean> {
        if (data.totalScore >= criteria.score) {
            await achievementRepository.awardAchievement(data.userId, achievement.key, data.totalScore, criteria.score)
            return true
        }
        return false
    }

    /**
     * Check consecutive speed guesses (e.g., 3 in a row under 3 seconds)
     */
    private async checkConsecutiveSpeed(achievement: AchievementRow, data: GameCompletionData, criteria: any): Promise<boolean> {
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
            await achievementRepository.awardAchievement(data.userId, achievement.key, maxConsecutive, criteria.count)
            return true
        }

        return false
    }

    /**
     * Check total speed guesses across all games
     */
    private async checkTotalSpeed(achievement: AchievementRow, data: GameCompletionData, criteria: any): Promise<boolean> {
        // Get historical count from database
        const result = await db('guesses')
            .join('tier_sessions', 'guesses.tier_session_id', 'tier_sessions.id')
            .join('game_sessions', 'tier_sessions.game_session_id', 'game_sessions.id')
            .where('game_sessions.user_id', data.userId)
            .where('guesses.is_correct', true)
            .where('guesses.time_taken_ms', '<=', criteria.max_time_ms)
            .count('* as count')
            .first()

        const totalCount = Number(result?.count || 0)

        if (totalCount >= criteria.count) {
            await achievementRepository.awardAchievement(data.userId, achievement.key, totalCount, criteria.count)
            return true
        }

        return false
    }

    /**
     * Check single speed guess
     */
    private async checkSingleSpeed(achievement: AchievementRow, data: GameCompletionData, criteria: any): Promise<boolean> {
        const hasFastGuess = data.guesses.some(
            g => g.isCorrect && g.roundTimeTakenMs <= criteria.max_time_ms
        )

        if (hasFastGuess) {
            await achievementRepository.awardAchievement(data.userId, achievement.key, 1, 1)
            return true
        }

        return false
    }

    /**
     * Check no hints used
     */
    private async checkNoHints(achievement: AchievementRow, data: GameCompletionData, criteria: any): Promise<boolean> {
        const usedHints = data.guesses.some(g => g.powerUpUsed !== null)

        if (!usedHints) {
            // Count total hint-free games
            const result = await db('game_sessions')
                .leftJoin('tier_sessions', 'game_sessions.id', 'tier_sessions.game_session_id')
                .leftJoin('user_guesses', 'tier_sessions.id', 'user_guesses.tier_session_id')
                .where('game_sessions.user_id', data.userId)
                .where('game_sessions.is_complete', true)
                .groupBy('game_sessions.id')
                .havingRaw('COALESCE(MAX(CASE WHEN user_guesses.power_up_used IS NOT NULL THEN 1 ELSE 0 END), 0) = 0')
                .count('* as count')

            const totalHintFreeGames = Number(result[0]?.count || 0)

            if (totalHintFreeGames >= criteria.count) {
                await achievementRepository.awardAchievement(data.userId, achievement.key, totalHintFreeGames, criteria.count)
                return true
            }
        }

        return false
    }

    /**
     * Check consecutive correct guesses (no wrong answers)
     */
    private async checkConsecutiveCorrect(achievement: AchievementRow, data: GameCompletionData, criteria: any): Promise<boolean> {
        // Get all user guesses ordered by time
        const allGuesses = await db('guesses')
            .join('tier_sessions', 'guesses.tier_session_id', 'tier_sessions.id')
            .join('game_sessions', 'tier_sessions.game_session_id', 'game_sessions.id')
            .where('game_sessions.user_id', data.userId)
            .select('guesses.is_correct', 'guesses.created_at')
            .orderBy('guesses.created_at', 'desc')
            .limit(criteria.count)

        let consecutiveCorrect = 0
        for (const guess of allGuesses) {
            if (guess.is_correct) {
                consecutiveCorrect++
            } else {
                break
            }
        }

        if (consecutiveCorrect >= criteria.count) {
            await achievementRepository.awardAchievement(data.userId, achievement.key, consecutiveCorrect, criteria.count)
            return true
        }

        return false
    }

    /**
     * Check streak milestone
     */
    private async checkStreak(achievement: AchievementRow, data: GameCompletionData, criteria: any): Promise<boolean> {
        if (data.currentStreak >= criteria.days) {
            await achievementRepository.awardAchievement(data.userId, achievement.key, data.currentStreak, criteria.days)
            return true
        }
        return false
    }

    /**
     * Check genre mastery
     */
    private async checkGenreMaster(achievement: AchievementRow, data: GameCompletionData, criteria: any): Promise<boolean> {
        const targetGenre = criteria.genre

        // Count correct guesses for this genre
        const result = await db('guesses')
            .join('tier_sessions', 'guesses.tier_session_id', 'tier_sessions.id')
            .join('game_sessions', 'tier_sessions.game_session_id', 'game_sessions.id')
            .join('screenshots', 'guesses.screenshot_id', 'screenshots.id')
            .join('games', 'screenshots.game_id', 'games.id')
            .where('game_sessions.user_id', data.userId)
            .where('guesses.is_correct', true)
            .whereRaw('? = ANY(games.genres)', [targetGenre])
            .count('* as count')
            .first()

        const genreCount = Number(result?.count || 0)

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

    /**
     * Check total challenges completed
     */
    private async checkChallengesCompleted(achievement: AchievementRow, data: GameCompletionData, criteria: any): Promise<boolean> {
        const result = await db('game_sessions')
            .where('user_id', data.userId)
            .where('is_complete', true)
            .count('* as count')
            .first()

        const totalCompleted = Number(result?.count || 0)

        if (totalCompleted >= criteria.count) {
            await achievementRepository.awardAchievement(data.userId, achievement.key, totalCompleted, criteria.count)
            return true
        }

        return false
    }

    /**
     * Check leaderboard ranking
     */
    private async checkLeaderboardRank(achievement: AchievementRow, data: GameCompletionData, criteria: any): Promise<boolean> {
        // Get user's rank for this challenge
        const rankings = await db('game_sessions')
            .where('challenge_id', data.challengeId)
            .where('is_complete', true)
            .orderBy('total_score', 'desc')
            .select('user_id', 'total_score')

        const userRank = rankings.findIndex(r => r.user_id === data.userId) + 1

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

    /**
     * Get all achievements with user's progress
     */
    async getAllAchievementsWithProgress(userId: string): Promise<Array<AchievementRow & { earned: boolean; earnedAt: Date | null; progress: number; progressMax: number | null }>> {
        const allAchievements = await achievementRepository.findAll()
        const userProgress = await achievementRepository.getUserProgress(userId)

        return allAchievements.map(achievement => {
            const progress = userProgress[achievement.key]
            return {
                ...achievement,
                earned: !!progress,
                earnedAt: progress?.earned_at || null,
                progress: progress?.progress || 0,
                progressMax: progress?.progress_max || null,
            }
        })
    }

    /**
     * Get user's earned achievements
     */
    async getUserAchievements(userId: string): Promise<UserAchievementWithDetails[]> {
        return achievementRepository.findUserAchievements(userId)
    }

    /**
     * Get achievement statistics for a user
     */
    async getUserStats(userId: string) {
        return achievementRepository.getUserStats(userId)
    }

    /**
     * Get achievement leaderboard
     */
    async getLeaderboard(limit: number = 100) {
        return achievementRepository.getLeaderboard(limit)
    }
}

export const achievementService = new AchievementService()
