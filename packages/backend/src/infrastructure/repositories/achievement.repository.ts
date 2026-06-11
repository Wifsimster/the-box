import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'

// Re-export domain row types so existing modules importing these names
// from the repository file keep working.
export type {
    AchievementRow,
    UserAchievementRow,
    UserAchievementWithDetails,
} from '../../domain/types/achievement.types.js'
import type {
    AchievementRow,
    UserAchievementRow,
    UserAchievementWithDetails,
} from '../../domain/types/achievement.types.js'

const log = repoLogger.child({ repository: 'achievement' })

export class AchievementRepository {
    /**
     * Get all achievements
     */
    async findAll(): Promise<AchievementRow[]> {
        log.debug('Finding all achievements')
        return db<AchievementRow>('achievements')
            .select('*')
            .orderBy('category')
            .orderBy('tier')
            .orderBy('points', 'desc')
    }

    /**
     * Get a single achievement by key
     */
    async findByKey(key: string): Promise<AchievementRow | undefined> {
        log.debug({ key }, 'Finding achievement by key')
        return db<AchievementRow>('achievements')
            .where('key', key)
            .first()
    }

    /**
     * Get achievements by category
     */
    async findByCategory(category: string): Promise<AchievementRow[]> {
        log.debug({ category }, 'Finding achievements by category')
        return db<AchievementRow>('achievements')
            .where('category', category)
            .orderBy('tier')
            .orderBy('points', 'desc')
    }

    /**
     * Get all achievements earned by a user (with achievement details)
     */
    async findUserAchievements(userId: string): Promise<UserAchievementWithDetails[]> {
        log.debug({ userId }, 'Finding user achievements')
        return db<UserAchievementRow>('user_achievements')
            .join('achievements', 'user_achievements.achievement_id', 'achievements.id')
            .where('user_achievements.user_id', userId)
            .select(
                'user_achievements.*',
                'achievements.key as achievement_key',
                'achievements.name as achievement_name',
                'achievements.description as achievement_description',
                'achievements.category as achievement_category',
                'achievements.icon_url as achievement_icon_url',
                'achievements.points as achievement_points',
                'achievements.tier as achievement_tier'
            )
            .orderBy('user_achievements.earned_at', 'desc')
    }

    /**
     * Check if user has earned a specific achievement
     */
    async hasAchievement(userId: string, achievementKey: string): Promise<boolean> {
        log.debug({ userId, achievementKey }, 'Checking if user has achievement')
        const result = await db('user_achievements')
            .join('achievements', 'user_achievements.achievement_id', 'achievements.id')
            .where('user_achievements.user_id', userId)
            .where('achievements.key', achievementKey)
            .first()

        return !!result
    }

    /**
     * Award an achievement to a user
     */
    async awardAchievement(
        userId: string,
        achievementKey: string,
        progress: number = 0,
        progressMax: number | null = null,
        metadata: Record<string, any> | null = null
    ): Promise<UserAchievementRow> {
        log.info({ userId, achievementKey }, 'Awarding achievement to user')

        const achievement = await this.findByKey(achievementKey)
        if (!achievement) {
            throw new Error(`Achievement not found: ${achievementKey}`)
        }

        const [userAchievement] = await db<UserAchievementRow>('user_achievements')
            .insert({
                user_id: userId,
                achievement_id: achievement.id,
                earned_at: new Date(),
                progress,
                progress_max: progressMax,
                metadata,
            })
            .returning('*')

        if (!userAchievement) {
            throw new Error('Failed to award achievement')
        }

        return userAchievement
    }

    /**
     * Update progress for an achievement (creates record if doesn't exist)
     */
    async updateProgress(
        userId: string,
        achievementKey: string,
        progress: number,
        progressMax: number | null = null,
        metadata: Record<string, any> | null = null
    ): Promise<UserAchievementRow> {
        log.debug({ userId, achievementKey, progress }, 'Updating achievement progress')

        const achievement = await this.findByKey(achievementKey)
        if (!achievement) {
            throw new Error(`Achievement not found: ${achievementKey}`)
        }

        // Check if already awarded
        const existing = await db<UserAchievementRow>('user_achievements')
            .where('user_id', userId)
            .where('achievement_id', achievement.id)
            .first()

        if (existing) {
            // Update progress only if not fully earned yet
            const [updated] = await db<UserAchievementRow>('user_achievements')
                .where('id', existing.id)
                .update({
                    progress,
                    progress_max: progressMax,
                    metadata,
                })
                .returning('*')

            if (!updated) {
                throw new Error('Failed to update achievement progress')
            }

            return updated
        } else {
            // Create new progress record
            const [created] = await db<UserAchievementRow>('user_achievements')
                .insert({
                    user_id: userId,
                    achievement_id: achievement.id,
                    earned_at: new Date(),
                    progress,
                    progress_max: progressMax,
                    metadata,
                })
                .returning('*')

            if (!created) {
                throw new Error('Failed to create achievement progress')
            }

            return created
        }
    }

    /**
     * Get user's progress on all achievements
     */
    async getUserProgress(userId: string): Promise<Record<string, UserAchievementRow>> {
        log.debug({ userId }, 'Getting user achievement progress')

        const achievements = await db<UserAchievementRow>('user_achievements')
            .join('achievements', 'user_achievements.achievement_id', 'achievements.id')
            .where('user_achievements.user_id', userId)
            .select('user_achievements.*', 'achievements.key')

        const progressMap: Record<string, UserAchievementRow> = {}
        for (const achievement of achievements) {
            const key = (achievement as any).key
            progressMap[key] = achievement
        }

        return progressMap
    }

    /**
     * Get achievement statistics for a user
     */
    async getUserStats(userId: string): Promise<{
        totalEarned: number
        totalPoints: number
        byCategory: Record<string, number>
        byTier: Record<number, number>
    }> {
        log.debug({ userId }, 'Getting user achievement stats')

        const achievements = await db('user_achievements')
            .join('achievements', 'user_achievements.achievement_id', 'achievements.id')
            .where('user_achievements.user_id', userId)
            .select('achievements.category', 'achievements.tier', 'achievements.points')

        const stats = {
            totalEarned: achievements.length,
            totalPoints: 0,
            byCategory: {} as Record<string, number>,
            byTier: {} as Record<number, number>,
        }

        for (const achievement of achievements) {
            stats.totalPoints += achievement.points
            stats.byCategory[achievement.category] = (stats.byCategory[achievement.category] || 0) + 1
            stats.byTier[achievement.tier] = (stats.byTier[achievement.tier] || 0) + 1
        }

        return stats
    }

    /**
     * Get leaderboard by achievement points
     */
    async getLeaderboard(limit: number = 100): Promise<Array<{
        userId: string
        username: string
        displayName: string
        avatarUrl: string | null
        totalPoints: number
        achievementCount: number
    }>> {
        log.debug({ limit }, 'Getting achievement leaderboard')

        const results = await db('user_achievements')
            .join('achievements', 'user_achievements.achievement_id', 'achievements.id')
            .join('user', 'user_achievements.user_id', 'user.id')
            .select(
                'user.id as userId',
                'user.username',
                'user.display_name as displayName',
                'user.avatar_url as avatarUrl'
            )
            .sum('achievements.points as totalPoints')
            .count('user_achievements.id as achievementCount')
            .groupBy('user.id', 'user.username', 'user.display_name', 'user.avatar_url')
            .orderBy('totalPoints', 'desc')
            .limit(limit)

        return results.map(row => ({
            userId: row.userId,
            username: row.username || 'Unknown',
            displayName: row.displayName || row.username || 'Unknown',
            avatarUrl: row.avatarUrl,
            totalPoints: Number(row.totalPoints) || 0,
            achievementCount: Number(row.achievementCount) || 0,
        }))
    }

    // ---- Aggregations used by the domain service ----

    async countCompletedGameSessions(userId: string): Promise<number> {
        const row = await db('game_sessions')
            .where('user_id', userId)
            .where('is_completed', true)
            .count<{ count: string }>({ count: '*' })
            .first()
        return Number(row?.count ?? 0)
    }

    async countPerfectSessions(userId: string): Promise<number> {
        // Perfect = total_score = 2000 (10 screenshots × 200 max). Restrict
        // to completed sessions so a mid-flight session doesn't count.
        const row = await db('game_sessions')
            .where('user_id', userId)
            .where('is_completed', true)
            .where('total_score', 2000)
            .count<{ count: string }>({ count: '*' })
            .first()
        return Number(row?.count ?? 0)
    }

    async countStartedGameSessions(userId: string): Promise<number> {
        const row = await db('game_sessions')
            .where('user_id', userId)
            .count<{ count: string }>({ count: '*' })
            .first()
        return Number(row?.count ?? 0)
    }

    async countAllGuesses(userId: string): Promise<number> {
        const row = await db('guesses')
            .join('tier_sessions', 'guesses.tier_session_id', 'tier_sessions.id')
            .join('game_sessions', 'tier_sessions.game_session_id', 'game_sessions.id')
            .where('game_sessions.user_id', userId)
            .count<{ count: string }>({ count: '*' })
            .first()
        return Number(row?.count ?? 0)
    }

    async countCorrectGuesses(userId: string): Promise<number> {
        const row = await db('guesses')
            .join('tier_sessions', 'guesses.tier_session_id', 'tier_sessions.id')
            .join('game_sessions', 'tier_sessions.game_session_id', 'game_sessions.id')
            .where('game_sessions.user_id', userId)
            .where('guesses.is_correct', true)
            .count<{ count: string }>({ count: '*' })
            .first()
        return Number(row?.count ?? 0)
    }

    async countWrongGuesses(userId: string): Promise<number> {
        const row = await db('guesses')
            .join('tier_sessions', 'guesses.tier_session_id', 'tier_sessions.id')
            .join('game_sessions', 'tier_sessions.game_session_id', 'game_sessions.id')
            .where('game_sessions.user_id', userId)
            .where('guesses.is_correct', false)
            .count<{ count: string }>({ count: '*' })
            .first()
        return Number(row?.count ?? 0)
    }

    async countSpeedCorrectGuesses(userId: string, maxTimeMs: number): Promise<number> {
        const row = await db('guesses')
            .join('tier_sessions', 'guesses.tier_session_id', 'tier_sessions.id')
            .join('game_sessions', 'tier_sessions.game_session_id', 'game_sessions.id')
            .where('game_sessions.user_id', userId)
            .where('guesses.is_correct', true)
            .where('guesses.time_taken_ms', '<=', maxTimeMs)
            .count<{ count: string }>({ count: '*' })
            .first()
        return Number(row?.count ?? 0)
    }

    async countHintFreeCompletedGames(userId: string): Promise<number> {
        // Count completed game sessions that have zero power-up usage across
        // all of their guesses AND zero letter reveals. power_up_used is only
        // ever non-null on historical rows (legacy metadata hints, retired
        // 2026-06) but must stay in the predicate so old hint-assisted
        // sessions don't retroactively become "hint-free".
        const rows = await db('game_sessions')
            .leftJoin('tier_sessions', 'game_sessions.id', 'tier_sessions.game_session_id')
            .leftJoin('guesses', 'tier_sessions.id', 'guesses.tier_session_id')
            .leftJoin(
                'position_letter_reveals',
                'tier_sessions.id',
                'position_letter_reveals.tier_session_id'
            )
            .where('game_sessions.user_id', userId)
            .where('game_sessions.is_completed', true)
            .groupBy('game_sessions.id')
            .havingRaw('COALESCE(MAX(CASE WHEN guesses.power_up_used IS NOT NULL THEN 1 ELSE 0 END), 0) = 0')
            .havingRaw('COALESCE(MAX(position_letter_reveals.letters_revealed), 0) = 0')
            .count('* as count')
        return rows.length
    }

    async countSessionLetterReveals(gameSessionId: string): Promise<number> {
        const row = await db('position_letter_reveals')
            .join('tier_sessions', 'position_letter_reveals.tier_session_id', 'tier_sessions.id')
            .where('tier_sessions.game_session_id', gameSessionId)
            .sum<{ sum: string | null }>('position_letter_reveals.letters_revealed as sum')
            .first()
        return Number(row?.sum ?? 0)
    }

    async countGenreCorrectGuesses(userId: string, genre: string): Promise<number> {
        const row = await db('guesses')
            .join('tier_sessions', 'guesses.tier_session_id', 'tier_sessions.id')
            .join('game_sessions', 'tier_sessions.game_session_id', 'game_sessions.id')
            .join('screenshots', 'guesses.screenshot_id', 'screenshots.id')
            .join('games', 'screenshots.game_id', 'games.id')
            .where('game_sessions.user_id', userId)
            .where('guesses.is_correct', true)
            .whereRaw('? = ANY(games.genres)', [genre])
            .count<{ count: string }>({ count: '*' })
            .first()
        return Number(row?.count ?? 0)
    }

    async findRecentGuessCorrectness(
        userId: string,
        limit: number
    ): Promise<Array<{ isCorrect: boolean; createdAt: Date }>> {
        const rows = await db('guesses')
            .join('tier_sessions', 'guesses.tier_session_id', 'tier_sessions.id')
            .join('game_sessions', 'tier_sessions.game_session_id', 'game_sessions.id')
            .where('game_sessions.user_id', userId)
            .orderBy('guesses.created_at', 'desc')
            .limit(limit)
            .select<Array<{ is_correct: boolean; created_at: Date }>>(
                'guesses.is_correct',
                'guesses.created_at'
            )
        return rows.map(r => ({ isCorrect: r.is_correct, createdAt: r.created_at }))
    }

    async findChallengeUserRanking(
        challengeId: number
    ): Promise<Array<{ userId: string }>> {
        const rows = await db('game_sessions')
            .where('daily_challenge_id', challengeId)
            .where('is_completed', true)
            .orderBy('total_score', 'desc')
            .select<Array<{ user_id: string }>>('user_id')
        return rows.map(r => ({ userId: r.user_id }))
    }

    async getUserBestChallengeRank(userId: string): Promise<number | null> {
        const userChallenges = await db('game_sessions')
            .where('user_id', userId)
            .where('is_completed', true)
            .select<Array<{ daily_challenge_id: number; total_score: number }>>(
                'daily_challenge_id',
                'total_score'
            )

        if (userChallenges.length === 0) return null

        let bestRank: number | null = null
        for (const userChallenge of userChallenges) {
            const rankings = await db('game_sessions')
                .where('daily_challenge_id', userChallenge.daily_challenge_id)
                .where('is_completed', true)
                .orderBy('total_score', 'desc')
                .select<Array<{ user_id: string }>>('user_id')

            const rank = rankings.findIndex(r => r.user_id === userId) + 1
            if (rank > 0 && (bestRank === null || rank < bestRank)) {
                bestRank = rank
            }
        }

        return bestRank
    }
}

export const achievementRepository = new AchievementRepository()

// Type-level check: the repository must satisfy the domain port.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { AchievementRepository as AchievementRepositoryPort } from '../../domain/ports/repositories.js'
export const _achievementRepositoryTypeCheck: AchievementRepositoryPort = achievementRepository
