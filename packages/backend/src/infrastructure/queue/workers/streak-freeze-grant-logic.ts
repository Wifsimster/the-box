import { db } from '../../database/connection.js'
import { queueLogger } from '../../logger/logger.js'
import {
  rewardsService,
} from '../../../composition/services.js'
import { inventoryRepository } from '../../repositories/index.js'
import { emitRewardGranted } from '../../socket/socket.js'
import type { RewardGrantedEvent } from '@the-box/types'

const log = queueLogger.child({ worker: 'streak-freeze-grant' })

const GUEST_EMAIL_DOMAIN = 'guest.thebox.local'

const ACTIVE_DAYS = 60

const MAX_FREEZES_PER_USER = 2

const STREAK_FREEZE_KEY = 'streak_freeze'
const ITEM_TYPE = 'powerup'

export interface StreakFreezeGrantResult {
  candidates: number
  granted: number
  cappedSkips: number
  failures: number
  message: string
}

interface ActiveUserRow {
  id: string
}

async function findActiveUsers(): Promise<ActiveUserRow[]> {
  const rows = await db('user as u')
    .select<ActiveUserRow[]>('u.id')
    .whereNot('u.email', 'like', `%@${GUEST_EMAIL_DOMAIN}`)
    .whereRaw(`u.last_played_at IS NOT NULL`)
    .whereRaw(`u.last_played_at > NOW() - INTERVAL '${ACTIVE_DAYS} days'`)
  return rows
}

function currentMonthSourceRef(now = new Date()): string {
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `streak_freeze:${yyyy}-${mm}`
}

export async function grantMonthlyStreakFreezes(
  onProgress?: (current: number, total: number) => void
): Promise<StreakFreezeGrantResult> {
  const candidates = await findActiveUsers()
  log.info({ candidates: candidates.length }, 'streak-freeze-grant candidates')

  const sourceRef = currentMonthSourceRef()
  let granted = 0
  let cappedSkips = 0
  let failures = 0

  for (let i = 0; i < candidates.length; i++) {
    const user = candidates[i]
    if (!user) continue

    try {
      const owned = await inventoryRepository.getItemQuantity(
        user.id,
        ITEM_TYPE,
        STREAK_FREEZE_KEY
      )
      if (owned >= MAX_FREEZES_PER_USER) {
        cappedSkips++
        log.debug(
          { userId: user.id, owned, cap: MAX_FREEZES_PER_USER },
          'streak-freeze grant skipped — user at cap'
        )
        continue
      }

      const result = await rewardsService.grant({
        userId: user.id,
        source: 'streak_freeze',
        sourceRef,
        items: [{ itemType: ITEM_TYPE, itemKey: STREAK_FREEZE_KEY, quantity: 1 }],
      })

      if (result.wasNew) {
        granted++
        const event: RewardGrantedEvent = {
          rewardId: result.grant.id,
          source: result.grant.source,
          sourceRef: result.grant.sourceRef,
          items: result.grant.payload.items,
          grantedAt: result.grant.grantedAt,
          unlockedAt: result.grant.unlockedAt,
        }
        emitRewardGranted(user.id, event)
      }
    } catch (error) {
      failures++
      log.error(
        { userId: user.id, error: String(error) },
        'streak-freeze grant failed for user'
      )
    }

    if (onProgress) onProgress(i + 1, candidates.length)
  }

  const result: StreakFreezeGrantResult = {
    candidates: candidates.length,
    granted,
    cappedSkips,
    failures,
    message: `streak-freeze: granted ${granted}/${candidates.length} (capped: ${cappedSkips}, failures: ${failures})`,
  }
  log.info(result, 'streak-freeze-grant complete')
  return result
}
