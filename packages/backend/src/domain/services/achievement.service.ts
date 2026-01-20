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

                case 'challenges_started':
                    return this.checkChallengesStarted(achievement, data, criteria)

                case 'total_guesses':
                    return this.checkTotalGuesses(achievement, data, criteria)

                case 'total_correct_guesses':
                    return this.checkTotalCorrectGuesses(achievement, data, criteria)

                case 'correct_in_game':
                    return this.checkCorrectInGame(achievement, data, criteria)

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
                .leftJoin('guesses', 'tier_sessions.id', 'guesses.tier_session_id')
                .where('game_sessions.user_id', data.userId)
                .where('game_sessions.is_completed', true)
                .groupBy('game_sessions.id')
                .havingRaw('COALESCE(MAX(CASE WHEN guesses.power_up_used IS NOT NULL THEN 1 ELSE 0 END), 0) = 0')
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
            .where('is_completed', true)
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
            .where('is_completed', true)
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
     * Check total challenges started (not necessarily completed)
     */
    private async checkChallengesStarted(achievement: AchievementRow, data: GameCompletionData, criteria: any): Promise<boolean> {
        const result = await db('game_sessions')
            .where('user_id', data.userId)
            .count('* as count')
            .first()

        const totalStarted = Number(result?.count || 0)

        if (totalStarted >= criteria.count) {
            await achievementRepository.awardAchievement(data.userId, achievement.key, totalStarted, criteria.count)
            return true
        }

        return false
    }

    /**
     * Check total guesses made (correct or not)
     */
    private async checkTotalGuesses(achievement: AchievementRow, data: GameCompletionData, criteria: any): Promise<boolean> {
        const result = await db('guesses')
            .join('tier_sessions', 'guesses.tier_session_id', 'tier_sessions.id')
            .join('game_sessions', 'tier_sessions.game_session_id', 'game_sessions.id')
            .where('game_sessions.user_id', data.userId)
            .count('* as count')
            .first()

        const totalGuesses = Number(result?.count || 0)

        if (totalGuesses >= criteria.count) {
            await achievementRepository.awardAchievement(data.userId, achievement.key, totalGuesses, criteria.count)
            return true
        }

        return false
    }

    /**
     * Check total correct guesses across all games
     */
    private async checkTotalCorrectGuesses(achievement: AchievementRow, data: GameCompletionData, criteria: any): Promise<boolean> {
        const result = await db('guesses')
            .join('tier_sessions', 'guesses.tier_session_id', 'tier_sessions.id')
            .join('game_sessions', 'tier_sessions.game_session_id', 'game_sessions.id')
            .where('game_sessions.user_id', data.userId)
            .where('guesses.is_correct', true)
            .count('* as count')
            .first()

        const totalCorrect = Number(result?.count || 0)

        if (totalCorrect >= criteria.count) {
            await achievementRepository.awardAchievement(data.userId, achievement.key, totalCorrect, criteria.count)
            return true
        }

        return false
    }

    /**
     * Check correct guesses in the current game session
     */
    private async checkCorrectInGame(achievement: AchievementRow, data: GameCompletionData, criteria: any): Promise<boolean> {
        const correctInGame = data.guesses.filter(g => g.isCorrect).length

        if (correctInGame >= criteria.count) {
            await achievementRepository.awardAchievement(data.userId, achievement.key, correctInGame, criteria.count)
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

        // Calculate current progress for unearned achievements
        const currentProgress = await this.calculateCurrentProgress(userId)

        return allAchievements.map(achievement => {
            const progress = userProgress[achievement.key]
            const isEarned = !!progress

            // Extract progressMax from criteria for count-based achievements
            const criteriaMax = this.extractProgressMaxFromCriteria(achievement.criteria)

            return {
                ...achievement,
                earned: isEarned,
                earnedAt: progress?.earned_at || null,
                progress: isEarned ? (progress?.progress || 0) : (currentProgress[achievement.key] || 0),
                progressMax: isEarned ? (progress?.progress_max || criteriaMax) : criteriaMax,
            }
        })
    }

    /**
     * Extract the max progress value from achievement criteria
     */
    private extractProgressMaxFromCriteria(criteria: any): number | null {
        if (!criteria || !criteria.type) {
            return null
        }

        // Count-based achievements
        if (criteria.count !== undefined) {
            return criteria.count
        }

        // Streak-based achievements (days)
        if (criteria.days !== undefined) {
            return criteria.days
        }

        // Score-based achievements
        if (criteria.score !== undefined) {
            return criteria.score
        }

        // Rank-based achievements
        if (criteria.max_rank !== undefined) {
            return criteria.max_rank
        }

        return null
    }

    /**
     * Calculate current progress for all count-based achievements
     */
    private async calculateCurrentProgress(userId: string): Promise<Record<string, number>> {
        const progress: Record<string, number> = {}

        // Get all achievements to know which ones to calculate
        const allAchievements = await achievementRepository.findAll()

        // Batch database queries for efficiency
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
            // Total challenges completed
            db('game_sessions')
                .where('user_id', userId)
                .where('is_completed', true)
                .count('* as count')
                .first(),
            // Total challenges started
            db('game_sessions')
                .where('user_id', userId)
                .count('* as count')
                .first(),
            // Total guesses
            db('guesses')
                .join('tier_sessions', 'guesses.tier_session_id', 'tier_sessions.id')
                .join('game_sessions', 'tier_sessions.game_session_id', 'game_sessions.id')
                .where('game_sessions.user_id', userId)
                .count('* as count')
                .first(),
            // Total correct guesses
            db('guesses')
                .join('tier_sessions', 'guesses.tier_session_id', 'tier_sessions.id')
                .join('game_sessions', 'tier_sessions.game_session_id', 'game_sessions.id')
                .where('game_sessions.user_id', userId)
                .where('guesses.is_correct', true)
                .count('* as count')
                .first(),
            // Current streak
            db('user')
                .where('id', userId)
                .select('current_streak')
                .first(),
            // Speed guesses under 3 seconds
            db('guesses')
                .join('tier_sessions', 'guesses.tier_session_id', 'tier_sessions.id')
                .join('game_sessions', 'tier_sessions.game_session_id', 'game_sessions.id')
                .where('game_sessions.user_id', userId)
                .where('guesses.is_correct', true)
                .where('guesses.time_taken_ms', '<=', 3000)
                .count('* as count')
                .first(),
            // Speed guesses under 5 seconds
            db('guesses')
                .join('tier_sessions', 'guesses.tier_session_id', 'tier_sessions.id')
                .join('game_sessions', 'tier_sessions.game_session_id', 'game_sessions.id')
                .where('game_sessions.user_id', userId)
                .where('guesses.is_correct', true)
                .where('guesses.time_taken_ms', '<=', 5000)
                .count('* as count')
                .first(),
            // Hint-free completed games - count game sessions without any power-up usage
            db.raw(`
                SELECT COUNT(*) as count FROM (
                    SELECT gs.id
                    FROM game_sessions gs
                    LEFT JOIN tier_sessions ts ON gs.id = ts.game_session_id
                    LEFT JOIN guesses g ON ts.id = g.tier_session_id
                    WHERE gs.user_id = ? AND gs.is_completed = true
                    GROUP BY gs.id
                    HAVING COALESCE(MAX(CASE WHEN g.power_up_used IS NOT NULL THEN 1 ELSE 0 END), 0) = 0
                ) as hint_free
            `, [userId]),
        ])

        // Map progress to achievement keys based on their criteria type
        for (const achievement of allAchievements) {
            const criteria = achievement.criteria
            if (!criteria || !criteria.type) continue

            switch (criteria.type) {
                case 'challenges_completed':
                    progress[achievement.key] = Number(challengesCompleted?.count || 0)
                    break
                case 'challenges_started':
                    progress[achievement.key] = Number(challengesStarted?.count || 0)
                    break
                case 'total_guesses':
                    progress[achievement.key] = Number(totalGuesses?.count || 0)
                    break
                case 'total_correct_guesses':
                    progress[achievement.key] = Number(totalCorrectGuesses?.count || 0)
                    break
                case 'streak':
                    progress[achievement.key] = Number(currentStreak?.current_streak || 0)
                    break
                case 'total_speed':
                    // Use 3s or 5s based on criteria
                    if (criteria.max_time_ms <= 3000) {
                        progress[achievement.key] = Number(speedGuesses3s?.count || 0)
                    } else {
                        progress[achievement.key] = Number(speedGuesses5s?.count || 0)
                    }
                    break
                case 'no_hints':
                    // Raw query returns { rows: [...] } in PostgreSQL
                    const hintFreeRows = hintFreeGames?.rows || hintFreeGames || []
                    progress[achievement.key] = hintFreeRows.length > 0 ? Number(hintFreeRows[0]?.count || 0) : 0
                    break
                // Other types (perfect_score, min_score, consecutive_speed, etc.)
                // are session-based and don't have meaningful cumulative progress
            }
        }

        return progress
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
        // Get all achievements with progress to determine which are truly earned
        const achievementsWithProgress = await this.getAllAchievementsWithProgress(userId)

        const stats = {
            totalEarned: 0,
            totalPoints: 0,
            byCategory: {} as Record<string, number>,
            byTier: {} as Record<number, number>,
        }

        for (const achievement of achievementsWithProgress) {
            // Count as earned if marked as earned OR if progress >= progressMax
            const isEarned = achievement.earned || (
                achievement.progressMax != null &&
                achievement.progress >= achievement.progressMax
            )

            if (isEarned) {
                stats.totalEarned++
                stats.totalPoints += achievement.points
                stats.byCategory[achievement.category] = (stats.byCategory[achievement.category] || 0) + 1
                stats.byTier[achievement.tier] = (stats.byTier[achievement.tier] || 0) + 1
            }
        }

        return stats
    }

    /**
     * Get achievement leaderboard
     */
    async getLeaderboard(limit: number = 100) {
        return achievementRepository.getLeaderboard(limit)
    }
}

export const achievementService = new AchievementService()
