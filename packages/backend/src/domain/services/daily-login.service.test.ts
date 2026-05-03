import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createDailyLoginService } from './daily-login.service.js'
import type { DailyReward } from '@the-box/types'
import type {
    DailyLoginRepository,
    InventoryRepository,
    UserLoginStreakRecord,
    LoginRewardClaimRecord,
} from '../ports/repositories.js'
import type { DomainLogger } from '../ports/logger.js'

const silentLogger: DomainLogger = {
    child: () => silentLogger,
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
}

function todayUTC(): string {
    return new Date().toISOString().slice(0, 10)
}

/** Returns YYYY-MM-DD `daysAgo` days before today (UTC). */
function dateOffset(daysAgo: number): string {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - daysAgo)
    return d.toISOString().slice(0, 10)
}

interface FakeInventoryState {
    items: Map<string, number>
    useItemsCalls: Array<{ userId: string; itemType: string; itemKey: string; quantity: number }>
}

function makeFakeInventory(initialFreezes: number): {
    repo: InventoryRepository
    state: FakeInventoryState
} {
    const state: FakeInventoryState = {
        items: new Map([['streak_freeze', initialFreezes]]),
        useItemsCalls: [],
    }
    const repo: InventoryRepository = {
        async getUserInventory() {
            return { powerups: {}, totalItems: 0 }
        },
        async getItem() {
            return null
        },
        async addItems() {},
        async useItems(userId, itemType, itemKey, quantity = 1) {
            state.useItemsCalls.push({ userId, itemType, itemKey, quantity })
            const have = state.items.get(itemKey) ?? 0
            if (have < quantity) return false
            state.items.set(itemKey, have - quantity)
            return true
        },
        async getItemQuantity(_userId, _itemType, itemKey) {
            return state.items.get(itemKey) ?? 0
        },
        async addMultipleItems() {},
    }
    return { repo, state }
}

interface FakeDailyLoginState {
    streak: UserLoginStreakRecord
    updates: Array<Parameters<DailyLoginRepository['updateUserStreak']>[1]>
    claimedToday: boolean
}

function makeFakeDailyLogin(overrides: Partial<UserLoginStreakRecord>): {
    repo: DailyLoginRepository
    state: FakeDailyLoginState
} {
    const state: FakeDailyLoginState = {
        streak: {
            id: 1,
            user_id: 'user-1',
            current_login_streak: 0,
            longest_login_streak: 0,
            last_login_date: null,
            last_claimed_date: null,
            current_day_in_cycle: 0,
            created_at: new Date(),
            updated_at: new Date(),
            ...overrides,
        },
        updates: [],
        claimedToday: false,
    }
    const repo: DailyLoginRepository = {
        async getAllRewards(): Promise<DailyReward[]> {
            return [
                {
                    id: 1,
                    dayNumber: 1,
                    rewardType: 'powerup',
                    rewardValue: { items: [{ key: 'hint_year', quantity: 1 }], points: 0 },
                    displayName: 'Day 1',
                    description: null,
                    iconUrl: null,
                },
            ]
        },
        async getRewardForDay() {
            return null
        },
        async getOrCreateUserStreak() {
            return state.streak
        },
        async getUserStreak() {
            return state.streak
        },
        async updateUserStreak(_userId, data) {
            state.updates.push(data)
            state.streak.current_login_streak = data.currentLoginStreak
            state.streak.longest_login_streak = data.longestLoginStreak
            state.streak.last_login_date = data.lastLoginDate
            state.streak.current_day_in_cycle = data.currentDayInCycle
        },
        async claimDailyReward() {
            return { ok: true }
        },
        async hasClaimedToday() {
            return state.claimedToday
        },
        async getClaimHistory(): Promise<LoginRewardClaimRecord[]> {
            return []
        },
    }
    return { repo, state }
}

describe('dailyLoginService.getStatus — streak freeze auto-consume', () => {
    it('consumes a freeze when exactly one day was missed and preserves the streak', async () => {
        // last login 2 days ago (yesterday was missed). Streak was 5 → would
        // reset to 1 without a freeze. With 1 freeze available, streak
        // continues at 6, freeze drops to 0.
        const { repo: dailyRepo, state: dailyState } = makeFakeDailyLogin({
            current_login_streak: 5,
            longest_login_streak: 5,
            last_login_date: dateOffset(2),
            current_day_in_cycle: 5,
        })
        const { repo: invRepo, state: invState } = makeFakeInventory(1)

        const service = createDailyLoginService({
            logger: silentLogger,
            dailyLoginRepository: dailyRepo,
            inventoryRepository: invRepo,
        })

        const status = await service.getStatus('user-1')

        assert.equal(status.currentStreak, 6, 'streak should advance, not reset')
        assert.equal(status.currentDayInCycle, 6, 'cycle should advance')
        assert.ok(status.streakFreezeConsumed, 'streakFreezeConsumed should be set')
        assert.equal(status.streakFreezeConsumed?.previousStreak, 5)
        assert.equal(status.streakFreezeConsumed?.newStreak, 6)
        assert.equal(status.streakFreezeConsumed?.freezesRemaining, 0)
        assert.equal(invState.useItemsCalls.length, 1)
        assert.equal(invState.useItemsCalls[0]?.itemKey, 'streak_freeze')
        assert.equal(dailyState.updates.length, 1, 'streak row should be persisted once')
        assert.equal(dailyState.updates[0]?.currentLoginStreak, 6)
        assert.equal(dailyState.updates[0]?.lastLoginDate, todayUTC())
    })

    it('does not consume when more than one day was missed (freeze covers 1 day only)', async () => {
        const { repo: dailyRepo } = makeFakeDailyLogin({
            current_login_streak: 5,
            longest_login_streak: 5,
            last_login_date: dateOffset(3), // 2 missed days
            current_day_in_cycle: 5,
        })
        const { repo: invRepo, state: invState } = makeFakeInventory(2)

        const service = createDailyLoginService({
            logger: silentLogger,
            dailyLoginRepository: dailyRepo,
            inventoryRepository: invRepo,
        })

        const status = await service.getStatus('user-1')

        assert.equal(status.currentStreak, 1, 'streak should reset normally')
        assert.equal(status.streakFreezeConsumed, null)
        assert.equal(invState.useItemsCalls.length, 0, 'no freeze consumed')
    })

    it('resets normally when one day was missed but no freeze is available', async () => {
        const { repo: dailyRepo } = makeFakeDailyLogin({
            current_login_streak: 5,
            longest_login_streak: 5,
            last_login_date: dateOffset(2),
            current_day_in_cycle: 5,
        })
        const { repo: invRepo, state: invState } = makeFakeInventory(0)

        const service = createDailyLoginService({
            logger: silentLogger,
            dailyLoginRepository: dailyRepo,
            inventoryRepository: invRepo,
        })

        const status = await service.getStatus('user-1')

        assert.equal(status.currentStreak, 1, 'streak should reset')
        assert.equal(status.streakFreezeConsumed, null)
        // We did call useItems (returned false), but we should NOT report
        // a consumption.
        assert.equal(invState.useItemsCalls.length, 1, 'attempted to use a freeze')
        assert.equal(invState.useItemsCalls[0]?.itemKey, 'streak_freeze')
    })

    it('does not consume on a continuing streak (logged in yesterday)', async () => {
        const { repo: dailyRepo } = makeFakeDailyLogin({
            current_login_streak: 3,
            longest_login_streak: 3,
            last_login_date: dateOffset(1),
            current_day_in_cycle: 3,
        })
        const { repo: invRepo, state: invState } = makeFakeInventory(2)

        const service = createDailyLoginService({
            logger: silentLogger,
            dailyLoginRepository: dailyRepo,
            inventoryRepository: invRepo,
        })

        const status = await service.getStatus('user-1')

        assert.equal(status.currentStreak, 4)
        assert.equal(status.streakFreezeConsumed, null)
        assert.equal(invState.useItemsCalls.length, 0, 'no consume on continue')
    })

    it('does not consume on same-day re-call (no new login)', async () => {
        const { repo: dailyRepo } = makeFakeDailyLogin({
            current_login_streak: 3,
            longest_login_streak: 3,
            last_login_date: todayUTC(),
            current_day_in_cycle: 3,
        })
        const { repo: invRepo, state: invState } = makeFakeInventory(2)

        const service = createDailyLoginService({
            logger: silentLogger,
            dailyLoginRepository: dailyRepo,
            inventoryRepository: invRepo,
        })

        const status = await service.getStatus('user-1')

        assert.equal(status.currentStreak, 3, 'streak unchanged')
        assert.equal(status.streakFreezeConsumed, null)
        assert.equal(invState.useItemsCalls.length, 0)
    })

    it('does not consume for a brand-new user with no prior streak', async () => {
        // First-time user: no last_login_date, current_login_streak === 0.
        // Even with freezes pre-stocked (edge case), we should NOT consume
        // because there is no streak to protect.
        const { repo: dailyRepo } = makeFakeDailyLogin({
            current_login_streak: 0,
            longest_login_streak: 0,
            last_login_date: null,
            current_day_in_cycle: 0,
        })
        const { repo: invRepo, state: invState } = makeFakeInventory(2)

        const service = createDailyLoginService({
            logger: silentLogger,
            dailyLoginRepository: dailyRepo,
            inventoryRepository: invRepo,
        })

        const status = await service.getStatus('user-1')

        assert.equal(status.currentStreak, 1)
        assert.equal(status.streakFreezeConsumed, null)
        assert.equal(invState.useItemsCalls.length, 0)
    })
})
