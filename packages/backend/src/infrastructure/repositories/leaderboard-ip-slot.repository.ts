import { db } from '../database/connection.js'

// Storage for the leaderboard per-connection cap. One row per player who got
// a ranked slot on a given (UTC day, hashed connection). Players over the cap
// get no row at all. See migrations/20261010_leaderboard_ip_cap.ts.
export const leaderboardIpSlotRepository = {
  /**
   * Grant `userId` a slot on (`day`, `ipHash`) if fewer than `cap` other
   * players hold one. Idempotent: a player who already holds the slot keeps
   * it. The advisory lock serialises concurrent claims on the same
   * connection so two simultaneous starts can't both take the last slot.
   */
  async claimSlot(day: string, ipHash: string, userId: string, cap: number): Promise<boolean> {
    return db.transaction(async (trx) => {
      await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [`lb-ip:${day}:${ipHash}`])

      const holders = await trx('leaderboard_ip_slots')
        .where({ slot_date: day, ip_hash: ipHash })
        .pluck<string[]>('user_id')

      if (holders.includes(userId)) return true
      if (holders.length >= cap) return false

      await trx('leaderboard_ip_slots').insert({ slot_date: day, ip_hash: ipHash, user_id: userId })
      return true
    })
  },

  /** Delete every slot older than `today` (YYYY-MM-DD). Returns rows removed. */
  async purgeBefore(today: string): Promise<number> {
    return db('leaderboard_ip_slots').where('slot_date', '<', today).delete()
  },
}

// Type-level check: the repository must satisfy the domain port.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { LeaderboardIpSlotStore } from '../../domain/ports/repositories.js'
export const _leaderboardIpSlotRepositoryTypeCheck: LeaderboardIpSlotStore = leaderboardIpSlotRepository
