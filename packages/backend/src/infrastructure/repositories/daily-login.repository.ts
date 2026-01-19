import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'
import type { DailyReward } from '@the-box/types'

const log = repoLogger.child({ repository: 'daily-login' })

// Database row types
export interface DailyLoginRewardRow {
    id: number
    day_number: number
    reward_type: string
    reward_value: { items: Array<{ key: string; quantity: number }>; points: number }
    display_name: string
    description: string | null
    icon_url: string | null
    created_at: Date
}

export interface UserLoginStreakRow {
    id: number
    user_id: string
    current_login_streak: number
    longest_login_streak: number
    last_login_date: string | null
    last_claimed_date: string | null
    current_day_in_cycle: number
    created_at: Date
    updated_at: Date
}

export interface LoginRewardClaimRow {
    id: number
    user_id: string
    reward_id: number
    day_number: number
    streak_at_claim: number
    claimed_at: Date
}

function mapRewardRowToDailyReward(row: DailyLoginRewardRow): DailyReward {
    return {
        id: row.id,
        dayNumber: row.day_number,
        rewardType: row.reward_type as 'powerup' | 'points' | 'legendary',
        rewardValue: row.reward_value,
        displayName: row.display_name,
        description: row.description,
        iconUrl: row.icon_url,
    }
}

export const dailyLoginRepository = {
    /**
     * Get all reward definitions
     */
    async getAllRewards(): Promise<DailyReward[]> {
        log.debug('getAllRewards')
        const rows = await db('daily_login_rewards')
            .select<DailyLoginRewardRow[]>('*')
            .orderBy('day_number', 'asc')
        return rows.map(mapRewardRowToDailyReward)
    },

    /**
     * Get reward for a specific day
     */
    async getRewardForDay(dayNumber: number): Promise<DailyReward | null> {
        log.debug({ dayNumber }, 'getRewardForDay')
        const row = await db('daily_login_rewards')
            .where('day_number', dayNumber)
            .first<DailyLoginRewardRow>()
        return row ? mapRewardRowToDailyReward(row) : null
    },

    /**
     * Get or create user login streak record
     */
    async getOrCreateUserStreak(userId: string): Promise<UserLoginStreakRow> {
        log.debug({ userId }, 'getOrCreateUserStreak')

        // Try to get existing record
        let row = await db('user_login_streaks')
            .where('user_id', userId)
            .first<UserLoginStreakRow>()

        if (!row) {
            // Create new record
            const [inserted] = await db('user_login_streaks')
                .insert({
                    user_id: userId,
                    current_login_streak: 0,
                    longest_login_streak: 0,
                    current_day_in_cycle: 1,
                })
                .returning('*')
            row = inserted as UserLoginStreakRow
            log.info({ userId }, 'created new user login streak record')
        }

        return row
    },

    /**
     * Get user login streak record (without creating)
     */
    async getUserStreak(userId: string): Promise<UserLoginStreakRow | null> {
        log.debug({ userId }, 'getUserStreak')
        return await db('user_login_streaks')
            .where('user_id', userId)
            .first<UserLoginStreakRow>()
    },

    /**
     * Update user streak for a new login
     */
    async updateUserStreak(
        userId: string,
        data: {
            currentLoginStreak: number
            longestLoginStreak: number
            lastLoginDate: string
            currentDayInCycle: number
        }
    ): Promise<void> {
        log.info({ userId, ...data }, 'updateUserStreak')
        await db('user_login_streaks')
            .where('user_id', userId)
            .update({
                current_login_streak: data.currentLoginStreak,
                longest_login_streak: data.longestLoginStreak,
                last_login_date: data.lastLoginDate,
                current_day_in_cycle: data.currentDayInCycle,
                updated_at: new Date(),
            })
    },

    /**
     * Mark reward as claimed for today
     */
    async markRewardClaimed(
        userId: string,
        rewardId: number,
        dayNumber: number,
        streakAtClaim: number
    ): Promise<void> {
        // Use local date for consistency
        const now = new Date()
        const year = now.getFullYear()
        const month = String(now.getMonth() + 1).padStart(2, '0')
        const day = String(now.getDate()).padStart(2, '0')
        const today = `${year}-${month}-${day}`
        log.info({ userId, rewardId, dayNumber, streakAtClaim, today }, 'markRewardClaimed starting')

        await db.transaction(async (trx) => {
            // Insert claim record
            const [insertedClaim] = await trx('login_reward_claims')
                .insert({
                    user_id: userId,
                    reward_id: rewardId,
                    day_number: dayNumber,
                    streak_at_claim: streakAtClaim,
                })
                .returning('*')

            log.info({ userId, claimId: insertedClaim?.id, claimedAt: insertedClaim?.claimed_at }, 'claim record inserted')

            // Update last claimed date
            await trx('user_login_streaks')
                .where('user_id', userId)
                .update({
                    last_claimed_date: today,
                    updated_at: new Date(),
                })

            log.info({ userId, today }, 'user_login_streaks updated')
        })

        log.info({ userId, rewardId }, 'markRewardClaimed completed successfully')
    },

    /**
     * Check if user has claimed reward today
     * Uses the login_reward_claims table directly for reliability
     */
    async hasClaimedToday(userId: string): Promise<boolean> {
        // Use local date for consistency
        const now = new Date()
        const year = now.getFullYear()
        const month = String(now.getMonth() + 1).padStart(2, '0')
        const day = String(now.getDate()).padStart(2, '0')
        const today = `${year}-${month}-${day}`

        // Query using PostgreSQL DATE() function with local timezone
        const claim = await db('login_reward_claims')
            .where('user_id', userId)
            .whereRaw("DATE(claimed_at) = ?", [today])
            .first()

        const hasClaimed = !!claim
        log.info({ userId, hasClaimed, today }, 'hasClaimedToday result')
        return hasClaimed
    },

    /**
     * Get user's claim history
     */
    async getClaimHistory(userId: string, limit: number = 30): Promise<LoginRewardClaimRow[]> {
        log.debug({ userId, limit }, 'getClaimHistory')
        return await db('login_reward_claims')
            .where('user_id', userId)
            .orderBy('claimed_at', 'desc')
            .limit(limit)
    },
}
