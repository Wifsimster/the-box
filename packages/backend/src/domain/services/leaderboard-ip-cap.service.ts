import { LEADERBOARD_IP_CAP } from '@the-box/types'
import type { DomainLogger, LeaderboardIpSlotStore } from '../ports/index.js'

// Cap value and its rationale live in @the-box/types so the player-facing
// message can quote the same number.
export { LEADERBOARD_IP_CAP }

export interface LeaderboardIpCapGuard {
  /**
   * Claim a leaderboard slot for a ranked daily session that is starting.
   * Returns true when the session may enter the leaderboard. Fails open:
   * a missing IP or a storage error never costs a player their rank.
   */
  claim(input: { userId: string; clientIp: string | undefined; day: string }): Promise<boolean>
}

export interface LeaderboardIpCapGuardDeps {
  logger: DomainLogger
  store: LeaderboardIpSlotStore
  /** Keyed, daily-rotating hash; the raw IP never reaches the store. */
  hashIp: (ip: string, day: string) => string
  cap?: number
}

export function createLeaderboardIpCapGuard(deps: LeaderboardIpCapGuardDeps): LeaderboardIpCapGuard {
  const log = deps.logger.child({ service: 'leaderboard-ip-cap' })
  const cap = deps.cap ?? LEADERBOARD_IP_CAP

  return {
    async claim({ userId, clientIp, day }) {
      if (!clientIp) return true
      try {
        // Slots of past days are useless for counting today: drop them on the
        // first claim of a new day so nothing outlives its day by much, even
        // between two runs of the scheduled cleanup.
        await deps.store.purgeBefore(day)
        const granted = await deps.store.claimSlot(day, deps.hashIp(clientIp, day), userId, cap)
        if (!granted) log.info({ userId, day, cap }, 'leaderboard ip cap reached; session will not be ranked')
        return granted
      } catch (error) {
        log.warn({ userId, error: String(error) }, 'leaderboard ip cap check failed (failing open)')
        return true
      }
    },
  }
}
