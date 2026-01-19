import { dailyLoginRepository, inventoryRepository, userRepository } from '../../infrastructure/repositories/index.js'
import { serviceLogger } from '../../infrastructure/logger/logger.js'
import type { DailyLoginStatus, ClaimRewardResponse, DailyReward, UserInventory } from '@the-box/types'

const log = serviceLogger.child({ service: 'daily-login' })

export class DailyLoginService {
    /**
     * Get today's date as YYYY-MM-DD string using local timezone
     */
    private getToday(): string {
        const now = new Date()
        const year = now.getFullYear()
        const month = String(now.getMonth() + 1).padStart(2, '0')
        const day = String(now.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
    }

    /**
     * Get yesterday's date as YYYY-MM-DD string using local timezone
     */
    private getYesterday(): string {
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        const year = yesterday.getFullYear()
        const month = String(yesterday.getMonth() + 1).padStart(2, '0')
        const day = String(yesterday.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
    }

    /**
     * Calculate streak based on last login date
     * Returns: { newStreak, newDayInCycle, isNewLogin }
     */
    private calculateStreak(
        lastLoginDate: string | null,
        currentStreak: number,
        longestStreak: number,
        currentDayInCycle: number
    ): {
        newStreak: number
        newLongestStreak: number
        newDayInCycle: number
        isNewLogin: boolean
    } {
        const today = this.getToday()
        const yesterday = this.getYesterday()

        // Case 1: Already logged in today
        if (lastLoginDate === today) {
            return {
                newStreak: currentStreak,
                newLongestStreak: longestStreak,
                newDayInCycle: currentDayInCycle,
                isNewLogin: false,
            }
        }

        // Case 2: Logged in yesterday - continue streak
        if (lastLoginDate === yesterday) {
            const newStreak = currentStreak + 1
            const newLongestStreak = Math.max(longestStreak, newStreak)
            // Cycle through days 1-7
            const newDayInCycle = (currentDayInCycle % 7) + 1
            return {
                newStreak,
                newLongestStreak,
                newDayInCycle,
                isNewLogin: true,
            }
        }

        // Case 3: No login or login was more than a day ago - reset streak
        return {
            newStreak: 1,
            newLongestStreak: Math.max(longestStreak, 1),
            newDayInCycle: 1, // Reset to day 1
            isNewLogin: true,
        }
    }

    /**
     * Normalize date from database (PostgreSQL returns Date object for DATE columns)
     * Uses local date components to avoid timezone issues with toISOString()
     */
    private normalizeDate(date: string | Date | null): string | null {
        if (!date) return null
        if (date instanceof Date) {
            // Use local date components to avoid UTC conversion issues
            const year = date.getFullYear()
            const month = String(date.getMonth() + 1).padStart(2, '0')
            const day = String(date.getDate()).padStart(2, '0')
            return `${year}-${month}-${day}`
        }
        return date
    }

    /**
     * Get daily login status for a user
     * This also updates the streak if it's a new day
     */
    async getStatus(userId: string): Promise<DailyLoginStatus> {
        log.debug({ userId }, 'getStatus')

        // Get or create streak record
        const streakRecord = await dailyLoginRepository.getOrCreateUserStreak(userId)

        // Normalize date from database (PostgreSQL returns Date object)
        const rawLastLoginDate = streakRecord.last_login_date
        const lastLoginDate = this.normalizeDate(rawLastLoginDate as string | Date | null)
        const today = this.getToday()

        log.info({
            userId,
            rawLastLoginDate,
            rawType: typeof rawLastLoginDate,
            normalizedLastLoginDate: lastLoginDate,
            today,
            isEqual: lastLoginDate === today,
        }, 'getStatus date comparison debug')

        // Calculate new streak values
        const { newStreak, newLongestStreak, newDayInCycle, isNewLogin } = this.calculateStreak(
            lastLoginDate,
            streakRecord.current_login_streak,
            streakRecord.longest_login_streak,
            streakRecord.current_day_in_cycle
        )

        log.info({ userId, isNewLogin, newStreak, newDayInCycle }, 'calculateStreak result')

        // Update streak if this is a new login day
        if (isNewLogin) {
            await dailyLoginRepository.updateUserStreak(userId, {
                currentLoginStreak: newStreak,
                longestLoginStreak: newLongestStreak,
                lastLoginDate: today,
                currentDayInCycle: newDayInCycle,
            })
            log.info({ userId, newStreak, newDayInCycle, savedDate: today }, 'updated user streak for new login day')
        }

        // Check if already claimed today
        const hasClaimedToday = await dailyLoginRepository.hasClaimedToday(userId)

        // Get all rewards and today's reward
        const allRewards = await dailyLoginRepository.getAllRewards()
        const todayReward = allRewards.find(r => r.dayNumber === newDayInCycle) || null

        return {
            isLoggedInToday: true, // They're logged in since they're calling this
            canClaim: !hasClaimedToday,
            hasClaimedToday,
            currentStreak: newStreak,
            longestStreak: newLongestStreak,
            currentDayInCycle: newDayInCycle,
            todayReward,
            allRewards,
        }
    }

    /**
     * Claim today's reward
     */
    async claimReward(userId: string): Promise<ClaimRewardResponse> {
        log.info({ userId }, 'claimReward')

        // Get current status (this also updates streak)
        const status = await this.getStatus(userId)

        // Check if can claim
        if (!status.canClaim) {
            throw new DailyLoginError('ALREADY_CLAIMED', 'You have already claimed your reward today')
        }

        if (!status.todayReward) {
            throw new DailyLoginError('NO_REWARD', 'No reward available for today')
        }

        const reward = status.todayReward

        // Process reward items
        const itemsToAdd: Array<{ itemType: string; itemKey: string; quantity: number }> = []
        for (const item of reward.rewardValue.items) {
            itemsToAdd.push({
                itemType: 'powerup',
                itemKey: item.key,
                quantity: item.quantity,
            })
        }

        // Add items to inventory
        if (itemsToAdd.length > 0) {
            await inventoryRepository.addMultipleItems(userId, itemsToAdd)
        }

        // Add points to user score
        if (reward.rewardValue.points > 0) {
            await userRepository.updateScore(userId, reward.rewardValue.points)
        }

        // Mark reward as claimed
        await dailyLoginRepository.markRewardClaimed(
            userId,
            reward.id,
            status.currentDayInCycle,
            status.currentStreak
        )

        // Get updated inventory
        const inventory = await inventoryRepository.getUserInventory(userId)

        log.info({
            userId,
            rewardId: reward.id,
            dayNumber: status.currentDayInCycle,
            streak: status.currentStreak,
            itemsAdded: reward.rewardValue.items,
            pointsAdded: reward.rewardValue.points,
        }, 'reward claimed successfully')

        return {
            success: true,
            reward,
            newStreak: status.currentStreak,
            newDayInCycle: status.currentDayInCycle,
            itemsAdded: reward.rewardValue.items,
            pointsAdded: reward.rewardValue.points,
            inventory,
        }
    }

    /**
     * Get all reward definitions
     */
    async getAllRewards(): Promise<DailyReward[]> {
        return dailyLoginRepository.getAllRewards()
    }

    /**
     * Get user's inventory
     */
    async getUserInventory(userId: string): Promise<UserInventory> {
        return inventoryRepository.getUserInventory(userId)
    }

    /**
     * Use a powerup from inventory
     * Returns true if successful
     */
    async usePowerup(userId: string, powerupKey: string): Promise<boolean> {
        return inventoryRepository.useItems(userId, 'powerup', powerupKey, 1)
    }

    /**
     * Check if user has a specific powerup available
     */
    async hasPowerup(userId: string, powerupKey: string): Promise<boolean> {
        const quantity = await inventoryRepository.getItemQuantity(userId, 'powerup', powerupKey)
        return quantity > 0
    }
}

export class DailyLoginError extends Error {
    constructor(
        public code: string,
        message: string
    ) {
        super(message)
        this.name = 'DailyLoginError'
    }
}

export const dailyLoginService = new DailyLoginService()
