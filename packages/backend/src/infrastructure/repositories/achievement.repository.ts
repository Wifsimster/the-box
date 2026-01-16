import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'

const log = repoLogger.child({ repository: 'achievement' })

export interface AchievementRow {
    id: number
    key: string
    name: string
    description: string | null
    category: string
    icon_url: string | null
    points: number
    criteria: Record<string, any> | null
    tier: number
    is_hidden: boolean
    created_at: Date
}

export interface UserAchievementRow {
    id: number
    user_id: string
    achievement_id: number
    earned_at: Date
    progress: number
    progress_max: number | null
    metadata: Record<string, any> | null
}

export interface UserAchievementWithDetails extends UserAchievementRow {
    achievement_key: string
    achievement_name: string
    achievement_description: string | null
    achievement_category: string
    achievement_icon_url: string | null
    achievement_points: number
    achievement_tier: number
}

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
}

export const achievementRepository = new AchievementRepository()
