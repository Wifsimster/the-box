import type { DailyLoginStatus, ClaimRewardResponse, DailyReward, UserInventory } from '@the-box/types'
import type {
  DomainLogger,
  DailyLoginRepository,
  InventoryRepository,
} from '../ports/index.js'

function getToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function getYesterday(): string {
  const yesterday = new Date()
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  return yesterday.toISOString().slice(0, 10)
}

function daysBetween(from: string | null, to: string): number {
  if (!from) return Infinity
  const start = new Date(`${from}T00:00:00Z`).getTime()
  const end = new Date(`${to}T00:00:00Z`).getTime()
  return Math.round((end - start) / (24 * 60 * 60 * 1000))
}

const STREAK_FREEZE_ITEM_TYPE = 'powerup'
const STREAK_FREEZE_ITEM_KEY = 'streak_freeze'

function calculateStreak(
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
  const today = getToday()
  const yesterday = getYesterday()

  if (lastLoginDate === today) {
    return {
      newStreak: currentStreak,
      newLongestStreak: longestStreak,
      newDayInCycle: currentDayInCycle,
      isNewLogin: false,
    }
  }

  if (lastLoginDate === yesterday) {
    const newStreak = currentStreak + 1
    const newLongestStreak = Math.max(longestStreak, newStreak)
    const newDayInCycle = (currentDayInCycle % 7) + 1
    return {
      newStreak,
      newLongestStreak,
      newDayInCycle,
      isNewLogin: true,
    }
  }

  return {
    newStreak: 1,
    newLongestStreak: Math.max(longestStreak, 1),
    newDayInCycle: 1,
    isNewLogin: true,
  }
}

function normalizeDate(date: string | Date | null): string | null {
  if (!date) return null
  if (date instanceof Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  return date
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

export interface DailyLoginService {
  getStatus(userId: string): Promise<DailyLoginStatus>
  claimReward(userId: string): Promise<ClaimRewardResponse>
  getAllRewards(): Promise<DailyReward[]>
  getUserInventory(userId: string): Promise<UserInventory>
  usePowerup(userId: string, powerupKey: string): Promise<boolean>
  hasPowerup(userId: string, powerupKey: string): Promise<boolean>
}

export interface DailyLoginServiceDeps {
  logger: DomainLogger
  dailyLoginRepository: DailyLoginRepository
  inventoryRepository: InventoryRepository
}

export function createDailyLoginService(deps: DailyLoginServiceDeps): DailyLoginService {
  const { dailyLoginRepository, inventoryRepository } = deps
  const log = deps.logger.child({ service: 'daily-login' })

  const service: DailyLoginService = {
    async getStatus(userId: string): Promise<DailyLoginStatus> {
      log.debug({ userId }, 'getStatus')

      const streakRecord = await dailyLoginRepository.getOrCreateUserStreak(userId)

      const lastLoginDate = normalizeDate(
        streakRecord.last_login_date as string | Date | null
      )
      const today = getToday()

      let { newStreak, newLongestStreak, newDayInCycle, isNewLogin } = calculateStreak(
        lastLoginDate,
        streakRecord.current_login_streak,
        streakRecord.longest_login_streak,
        streakRecord.current_day_in_cycle
      )

      log.info({ userId, isNewLogin, newStreak, newDayInCycle }, 'calculateStreak result')

      const previousStreak = streakRecord.current_login_streak
      const wouldReset =
        isNewLogin && newStreak === 1 && previousStreak > 0
      const missedExactlyOneDay = daysBetween(lastLoginDate, today) === 2
      let streakFreezeConsumed: DailyLoginStatus['streakFreezeConsumed'] = null
      let streakAlreadyPersisted = false

      if (wouldReset && missedExactlyOneDay) {
        const continued = calculateStreak(
          getYesterday(),
          previousStreak,
          streakRecord.longest_login_streak,
          streakRecord.current_day_in_cycle
        )
        const result = await dailyLoginRepository.consumeFreezeAndUpdateStreak(userId, {
          itemType: STREAK_FREEZE_ITEM_TYPE,
          itemKey: STREAK_FREEZE_ITEM_KEY,
          streak: {
            currentLoginStreak: continued.newStreak,
            longestLoginStreak: continued.newLongestStreak,
            lastLoginDate: today,
            currentDayInCycle: continued.newDayInCycle,
          },
        })
        if (result.ok) {
          newStreak = continued.newStreak
          newLongestStreak = continued.newLongestStreak
          newDayInCycle = continued.newDayInCycle
          streakFreezeConsumed = {
            previousStreak,
            newStreak,
            freezesRemaining: result.freezesRemaining,
          }
          streakAlreadyPersisted = true
          log.info(
            { userId, previousStreak, newStreak, freezesRemaining: result.freezesRemaining },
            'streak-freeze auto-consumed — streak preserved'
          )
        }
      }

      if (isNewLogin && !streakAlreadyPersisted) {
        await dailyLoginRepository.updateUserStreak(userId, {
          currentLoginStreak: newStreak,
          longestLoginStreak: newLongestStreak,
          lastLoginDate: today,
          currentDayInCycle: newDayInCycle,
        })
        log.info(
          { userId, newStreak, newDayInCycle, savedDate: today },
          'updated user streak for new login day'
        )
      }

      const hasClaimedToday = await dailyLoginRepository.hasClaimedToday(userId)

      const allRewards = await dailyLoginRepository.getAllRewards()
      const todayReward = allRewards.find(r => r.dayNumber === newDayInCycle) || null

      return {
        isLoggedInToday: true,
        canClaim: !hasClaimedToday,
        hasClaimedToday,
        currentStreak: newStreak,
        longestStreak: newLongestStreak,
        currentDayInCycle: newDayInCycle,
        todayReward,
        allRewards,
        streakFreezeConsumed,
      }
    },

    async claimReward(userId: string): Promise<ClaimRewardResponse> {
      log.info({ userId }, 'claimReward')

      const status = await service.getStatus(userId)

      if (!status.canClaim) {
        throw new DailyLoginError('ALREADY_CLAIMED', 'You have already claimed your reward today')
      }

      if (!status.todayReward) {
        throw new DailyLoginError('NO_REWARD', 'No reward available for today')
      }

      const reward = status.todayReward

      const itemsToAdd = reward.rewardValue.items.map(item => ({
        itemType: 'powerup',
        itemKey: item.key,
        quantity: item.quantity,
      }))

      const result = await dailyLoginRepository.claimDailyReward({
        userId,
        rewardId: reward.id,
        dayNumber: status.currentDayInCycle,
        streakAtClaim: status.currentStreak,
        items: itemsToAdd,
        points: reward.rewardValue.points,
      })

      if (!result.ok) {
        throw new DailyLoginError('ALREADY_CLAIMED', 'You have already claimed your reward today')
      }

      const inventory = await inventoryRepository.getUserInventory(userId)

      log.info(
        {
          userId,
          rewardId: reward.id,
          dayNumber: status.currentDayInCycle,
          streak: status.currentStreak,
          itemsAdded: reward.rewardValue.items,
          pointsAdded: reward.rewardValue.points,
        },
        'reward claimed successfully'
      )

      return {
        success: true,
        reward,
        newStreak: status.currentStreak,
        newDayInCycle: status.currentDayInCycle,
        itemsAdded: reward.rewardValue.items,
        pointsAdded: reward.rewardValue.points,
        inventory,
      }
    },

    async getAllRewards(): Promise<DailyReward[]> {
      return dailyLoginRepository.getAllRewards()
    },

    async getUserInventory(userId: string): Promise<UserInventory> {
      return inventoryRepository.getUserInventory(userId)
    },

    async usePowerup(userId: string, powerupKey: string): Promise<boolean> {
      return inventoryRepository.useItems(userId, 'powerup', powerupKey, 1)
    },

    async hasPowerup(userId: string, powerupKey: string): Promise<boolean> {
      const quantity = await inventoryRepository.getItemQuantity(userId, 'powerup', powerupKey)
      return quantity > 0
    },
  }

  return service
}
