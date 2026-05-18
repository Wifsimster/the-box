import type { DailyLoginStatus, ClaimRewardResponse, DailyReward, UserInventory } from '@the-box/types'
import type {
  DomainLogger,
  DailyLoginRepository,
  InventoryRepository,
} from '../ports/index.js'

/**
 * Today as YYYY-MM-DD (UTC). All daily-login date math runs in UTC so the
 * outcome is independent of process TZ (Docker UTC vs. dev local) and of
 * PostgreSQL session TZ.
 */
function getToday(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Yesterday as YYYY-MM-DD (UTC).
 */
function getYesterday(): string {
  const yesterday = new Date()
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  return yesterday.toISOString().slice(0, 10)
}

/**
 * Whole-day gap between two YYYY-MM-DD dates (UTC). Returns Infinity when
 * `from` is null. Used to decide whether a streak freeze can cover the
 * gap: exactly one missed day (`gap === 2`, e.g. Mon→Wed) is forgivable;
 * two-or-more missed days resets unconditionally per the streak-freeze
 * PRD ("one freeze = one day, period").
 */
function daysBetween(from: string | null, to: string): number {
  if (!from) return Infinity
  const start = new Date(`${from}T00:00:00Z`).getTime()
  const end = new Date(`${to}T00:00:00Z`).getTime()
  return Math.round((end - start) / (24 * 60 * 60 * 1000))
}

const STREAK_FREEZE_ITEM_TYPE = 'powerup'
const STREAK_FREEZE_ITEM_KEY = 'streak_freeze'

/**
 * Calculate streak based on last login date
 * Returns: { newStreak, newDayInCycle, isNewLogin }
 */
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
 * Normalize `last_login_date` from the database to a YYYY-MM-DD string.
 *
 * The `pg` driver parses DATE columns into JS `Date` objects built at
 * LOCAL midnight (`new Date(year, month, day)`) — a calendar date with no
 * meaningful time-of-day or zone. Rendering such a Date with
 * `toISOString()` reinterprets that local-midnight instant in UTC, which
 * rolls the calendar date back a day on any server east of UTC (e.g.
 * Europe/Paris): yesterday then looks like two days ago and the login
 * streak resets every single day. Read the date back with the LOCAL
 * getters, mirroring how `pg` built the object, so the stored calendar
 * date survives intact regardless of the process timezone.
 */
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
  /**
   * Get daily login status for a user
   * This also updates the streak if it's a new day
   */
  getStatus(userId: string): Promise<DailyLoginStatus>
  /**
   * Claim today's reward
   */
  claimReward(userId: string): Promise<ClaimRewardResponse>
  /**
   * Get all reward definitions
   */
  getAllRewards(): Promise<DailyReward[]>
  /**
   * Get user's inventory
   */
  getUserInventory(userId: string): Promise<UserInventory>
  /**
   * Use a powerup from inventory. Returns true if successful.
   */
  usePowerup(userId: string, powerupKey: string): Promise<boolean>
  /**
   * Check if user has a specific powerup available
   */
  hasPowerup(userId: string, powerupKey: string): Promise<boolean>
}

export interface DailyLoginServiceDeps {
  logger: DomainLogger
  dailyLoginRepository: DailyLoginRepository
  inventoryRepository: InventoryRepository
}

/**
 * Create a DailyLoginService with injected dependencies.
 */
export function createDailyLoginService(deps: DailyLoginServiceDeps): DailyLoginService {
  const { dailyLoginRepository, inventoryRepository } = deps
  const log = deps.logger.child({ service: 'daily-login' })

  const service: DailyLoginService = {
    async getStatus(userId: string): Promise<DailyLoginStatus> {
      log.debug({ userId }, 'getStatus')

      // Get or create streak record
      const streakRecord = await dailyLoginRepository.getOrCreateUserStreak(userId)

      // Normalize date from database (PostgreSQL returns a Date object)
      const lastLoginDate = normalizeDate(
        streakRecord.last_login_date as string | Date | null
      )
      const today = getToday()

      // Calculate new streak values
      let { newStreak, newLongestStreak, newDayInCycle, isNewLogin } = calculateStreak(
        lastLoginDate,
        streakRecord.current_login_streak,
        streakRecord.longest_login_streak,
        streakRecord.current_day_in_cycle
      )

      log.info({ userId, isNewLogin, newStreak, newDayInCycle }, 'calculateStreak result')

      // Streak-freeze auto-consume: when the streak would reset because the
      // user missed EXACTLY one day AND has at least one freeze in
      // inventory, consume the freeze and behave as if they had logged in
      // yesterday. Multi-day gaps are NOT covered (one freeze = one day,
      // per the streak-freeze PRD). Invariant: freezes are never
      // purchasable; this is the SOLE consumption path. The atomic
      // consumeFreezeAndUpdateStreak path below closes the race that
      // used to exist here (two concurrent /status calls could both
      // decrement the same freeze).
      const previousStreak = streakRecord.current_login_streak
      const wouldReset =
        isNewLogin && newStreak === 1 && previousStreak > 0
      const missedExactlyOneDay = daysBetween(lastLoginDate, today) === 2
      let streakFreezeConsumed: DailyLoginStatus['streakFreezeConsumed'] = null
      let streakAlreadyPersisted = false

      if (wouldReset && missedExactlyOneDay) {
        // Recompute the "continued" streak values that we'd save IF the
        // freeze is available, then hand both to the repo so the
        // decrement + streak update commit together.
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

      // Update streak if this is a new login day AND the freeze path
      // above didn't already persist a transactional update.
      // updateUserStreak guards on `last_login_date IS DISTINCT FROM
      // today`, so concurrent /status calls collapse to a single write.
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
        streakFreezeConsumed,
      }
    },

    async claimReward(userId: string): Promise<ClaimRewardResponse> {
      log.info({ userId }, 'claimReward')

      // Get current status (this also updates streak)
      const status = await service.getStatus(userId)

      // Check if can claim
      if (!status.canClaim) {
        throw new DailyLoginError('ALREADY_CLAIMED', 'You have already claimed your reward today')
      }

      if (!status.todayReward) {
        throw new DailyLoginError('NO_REWARD', 'No reward available for today')
      }

      const reward = status.todayReward

      // Process reward items
      const itemsToAdd = reward.rewardValue.items.map(item => ({
        itemType: 'powerup',
        itemKey: item.key,
        quantity: item.quantity,
      }))

      // Atomic: insert claim, update streak, upsert inventory, bump score.
      // The DB unique index on (user_id, UTC claim date) is what actually
      // protects against double-claim from concurrent requests.
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

      // Get updated inventory (post-commit)
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
