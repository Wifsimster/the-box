import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'
import type { DailyReward } from '@the-box/types'

const log = repoLogger.child({ repository: 'daily-login' })

// PostgreSQL unique-violation SQLSTATE
const PG_UNIQUE_VIOLATION = '23505'

function todayUtc(): string {
    return new Date().toISOString().slice(0, 10)
}

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
     * Update user streak for a new login. Conditional on last_login_date
     * actually changing — concurrent /status calls from the same tab pair
     * become harmless no-ops instead of redundant writes.
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
            .whereRaw('last_login_date IS DISTINCT FROM ?', [data.lastLoginDate])
            .update({
                current_login_streak: data.currentLoginStreak,
                longest_login_streak: data.longestLoginStreak,
                last_login_date: data.lastLoginDate,
                current_day_in_cycle: data.currentDayInCycle,
                updated_at: new Date(),
            })
    },

    // Atomic streak-freeze consumption + streak update. Closes the race
    // where two concurrent /status calls on the first day after a missed
    // day could both observe a freeze in inventory and both decrement it.
    // The inventory UPDATE has the same `quantity >= 1` predicate as
    // `useItems`, so only one transaction can win the decrement — the
    // other one returns ok=false and the service falls back to "streak
    // resets normally". Bundling the streak update in the same
    // transaction means we never end up with "freeze consumed but
    // streak not updated" or vice versa.
    async consumeFreezeAndUpdateStreak(
        userId: string,
        opts: {
            itemType: string
            itemKey: string
            streak: {
                currentLoginStreak: number
                longestLoginStreak: number
                lastLoginDate: string
                currentDayInCycle: number
            }
        }
    ): Promise<{ ok: true; freezesRemaining: number } | { ok: false }> {
        return db.transaction(async (trx) => {
            const decrement = await trx('user_inventory')
                .where({
                    user_id: userId,
                    item_type: opts.itemType,
                    item_key: opts.itemKey,
                })
                .where('quantity', '>=', 1)
                .decrement('quantity', 1)
            const affected = decrement as unknown as number
            if (!affected) {
                return { ok: false as const }
            }
            await trx('user_login_streaks')
                .where('user_id', userId)
                .whereRaw('last_login_date IS DISTINCT FROM ?', [opts.streak.lastLoginDate])
                .update({
                    current_login_streak: opts.streak.currentLoginStreak,
                    longest_login_streak: opts.streak.longestLoginStreak,
                    last_login_date: opts.streak.lastLoginDate,
                    current_day_in_cycle: opts.streak.currentDayInCycle,
                    updated_at: new Date(),
                })
            const remaining = await trx('user_inventory')
                .where({
                    user_id: userId,
                    item_type: opts.itemType,
                    item_key: opts.itemKey,
                })
                .first<{ quantity: number }>('quantity')
            return { ok: true as const, freezesRemaining: remaining?.quantity ?? 0 }
        })
    },

    /**
     * Atomically claim today's reward: insert claim row, bump
     * `last_claimed_date`, upsert powerups, increment user score — all in
     * one transaction. The unique index on
     * (user_id, (claimed_at AT TIME ZONE 'UTC')::date) is the source of
     * truth for "one claim per UTC day"; on conflict we surface
     * { ok: false, reason: 'ALREADY_CLAIMED' } so the caller can map it
     * to a domain error without inspecting SQLSTATE.
     */
    async claimDailyReward(input: {
        userId: string
        rewardId: number
        dayNumber: number
        streakAtClaim: number
        items: Array<{ itemType: string; itemKey: string; quantity: number }>
        points: number
    }): Promise<{ ok: true } | { ok: false; reason: 'ALREADY_CLAIMED' }> {
        const { userId, rewardId, dayNumber, streakAtClaim, items, points } = input
        const today = todayUtc()

        try {
            await db.transaction(async (trx) => {
                await trx('login_reward_claims').insert({
                    user_id: userId,
                    reward_id: rewardId,
                    day_number: dayNumber,
                    streak_at_claim: streakAtClaim,
                })

                await trx('user_login_streaks')
                    .where('user_id', userId)
                    .update({
                        last_claimed_date: today,
                        updated_at: new Date(),
                    })

                for (const item of items) {
                    await trx.raw(
                        `
                        INSERT INTO user_inventory (user_id, item_type, item_key, quantity, updated_at)
                        VALUES (?, ?, ?, ?, NOW())
                        ON CONFLICT (user_id, item_type, item_key)
                        DO UPDATE SET quantity = user_inventory.quantity + ?, updated_at = NOW()
                    `,
                        [userId, item.itemType, item.itemKey, item.quantity, item.quantity],
                    )
                }

                if (points > 0) {
                    await trx('user').where('id', userId).increment('total_score', points)
                }
            })

            log.info({ userId, rewardId, dayNumber, streakAtClaim }, 'claimDailyReward committed')
            return { ok: true }
        } catch (err) {
            const code = (err as { code?: string }).code
            if (code === PG_UNIQUE_VIOLATION) {
                log.info({ userId, rewardId }, 'claimDailyReward already claimed (unique violation)')
                return { ok: false, reason: 'ALREADY_CLAIMED' }
            }
            throw err
        }
    },

    /**
     * Check if user has claimed reward today (UTC).
     */
    async hasClaimedToday(userId: string): Promise<boolean> {
        const today = todayUtc()

        const claim = await db('login_reward_claims')
            .where('user_id', userId)
            .whereRaw("(claimed_at AT TIME ZONE 'UTC')::date = ?", [today])
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

// Type-level check: the repository must satisfy the domain port.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { DailyLoginRepository as DailyLoginRepositoryPort } from '../../domain/ports/repositories.js'
export const _dailyLoginRepositoryTypeCheck: DailyLoginRepositoryPort = dailyLoginRepository
