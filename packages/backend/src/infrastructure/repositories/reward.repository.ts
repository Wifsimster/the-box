import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'
import type { RewardGrant, RewardGrantPayload } from '@the-box/types'
import type { RewardRepository as RewardRepositoryPort } from '../../domain/ports/repositories.js'

const log = repoLogger.child({ repository: 'reward' })

interface RewardGrantRow {
  id: string
  user_id: string
  source: string
  source_ref: string
  payload: RewardGrantPayload
  granted_at: Date
  unlocked_at: Date | null
  claimed_at: Date | null
}

function mapRow(row: RewardGrantRow): RewardGrant {
  return {
    id: row.id,
    userId: row.user_id,
    source: row.source as RewardGrant['source'],
    sourceRef: row.source_ref,
    payload: row.payload,
    grantedAt: row.granted_at.toISOString(),
    unlockedAt: row.unlocked_at ? row.unlocked_at.toISOString() : null,
    claimedAt: row.claimed_at ? row.claimed_at.toISOString() : null,
  }
}

export const rewardRepository = {
  async grantAtomic(input: {
    userId: string
    source: string
    sourceRef: string
    payload: RewardGrantPayload
    autoUnlock: boolean
  }): Promise<{ wasNew: boolean; grant: RewardGrant }> {
    const { userId, source, sourceRef, payload, autoUnlock } = input
    log.info({ userId, source, sourceRef, autoUnlock }, 'grantAtomic')

    return db.transaction(async (trx) => {
      // Try insert. ON CONFLICT DO NOTHING + RETURNING omits the row when
      // the unique key collides, which is exactly the idempotency contract:
      // a retry returns wasNew=false and we do not re-touch inventory.
      const insertResult = await trx.raw<{ rows: RewardGrantRow[] }>(
        `
        INSERT INTO reward_grants (user_id, source, source_ref, payload, unlocked_at)
        VALUES (?, ?, ?, ?::jsonb, ${autoUnlock ? 'NOW()' : 'NULL'})
        ON CONFLICT (user_id, source, source_ref) DO NOTHING
        RETURNING *
        `,
        [userId, source, sourceRef, JSON.stringify(payload)]
      )

      if (insertResult.rows.length === 0) {
        // Conflict: fetch the existing row, do NOT re-upsert inventory.
        const existing = await trx<RewardGrantRow>('reward_grants')
          .where({ user_id: userId, source, source_ref: sourceRef })
          .first()
        if (!existing) {
          // Should be impossible — race-window between conflict and read
          // would be the only way. Surface loudly so we notice.
          throw new Error(
            `reward_grants insert conflict but no existing row found for ${userId}/${source}/${sourceRef}`
          )
        }
        log.info(
          { userId, source, sourceRef, grantId: existing.id },
          'grantAtomic conflict — returning existing row'
        )
        return { wasNew: false, grant: mapRow(existing) }
      }

      const inserted = insertResult.rows[0]
      if (!inserted) {
        // Postgres returned an empty rows array on an INSERT … RETURNING
        // that did NOT hit the conflict path. Should be unreachable.
        throw new Error('reward_grants insert returned no row and no conflict')
      }

      // Upsert each item into user_inventory in the same transaction.
      // Mirrors the pattern used by inventory.repository.addMultipleItems.
      for (const item of payload.items) {
        await trx.raw(
          `
          INSERT INTO user_inventory (user_id, item_type, item_key, quantity, updated_at)
          VALUES (?, ?, ?, ?, NOW())
          ON CONFLICT (user_id, item_type, item_key)
          DO UPDATE SET quantity = user_inventory.quantity + ?, updated_at = NOW()
          `,
          [userId, item.itemType, item.itemKey, item.quantity, item.quantity]
        )
      }

      return { wasNew: true, grant: mapRow(inserted) }
    })
  },

  async findById(id: string, userId: string): Promise<RewardGrant | null> {
    const row = await db<RewardGrantRow>('reward_grants')
      .where({ id, user_id: userId })
      .first()
    return row ? mapRow(row) : null
  },

  async markUnlocked(id: string, userId: string): Promise<RewardGrant | null> {
    log.info({ id, userId }, 'markUnlocked')
    // Set unlocked_at only if currently null. Re-runs are no-ops.
    const rows = await db<RewardGrantRow>('reward_grants')
      .where({ id, user_id: userId })
      .whereNull('unlocked_at')
      .update({ unlocked_at: db.fn.now() })
      .returning('*')
    const updated = rows[0]
    if (updated) return mapRow(updated)
    // Row exists but already unlocked — return current state.
    const existing = await db<RewardGrantRow>('reward_grants')
      .where({ id, user_id: userId })
      .first()
    return existing ? mapRow(existing) : null
  },

  async markClaimed(id: string, userId: string): Promise<RewardGrant | null> {
    log.info({ id, userId }, 'markClaimed')
    // Claim is a no-op if already claimed. We require unlocked_at to be set
    // so a staged-but-not-yet-earned reward (e.g. reactivation pre-play)
    // cannot be claimed prematurely.
    const rows = await db<RewardGrantRow>('reward_grants')
      .where({ id, user_id: userId })
      .whereNotNull('unlocked_at')
      .whereNull('claimed_at')
      .update({ claimed_at: db.fn.now() })
      .returning('*')
    const updated = rows[0]
    if (updated) return mapRow(updated)
    const existing = await db<RewardGrantRow>('reward_grants')
      .where({ id, user_id: userId })
      .first()
    return existing ? mapRow(existing) : null
  },

  async unlockPendingByUserAndSource(
    userId: string,
    source: string
  ): Promise<RewardGrant[]> {
    log.info({ userId, source }, 'unlockPendingByUserAndSource')
    const rows = await db<RewardGrantRow>('reward_grants')
      .where({ user_id: userId, source })
      .whereNull('unlocked_at')
      .update({ unlocked_at: db.fn.now() })
      .returning('*')
    return rows.map(mapRow)
  },

  async listForUser(
    userId: string,
    options: { onlyUnclaimed?: boolean; limit?: number } = {}
  ): Promise<RewardGrant[]> {
    const { onlyUnclaimed = true, limit = 50 } = options
    const query = db<RewardGrantRow>('reward_grants')
      .where('user_id', userId)
      .orderBy('granted_at', 'desc')
      .limit(limit)
    if (onlyUnclaimed) query.whereNull('claimed_at')
    const rows = await query
    return rows.map(mapRow)
  },
}

// Type-level check: the repository must satisfy the domain port.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const _rewardRepositoryTypeCheck: RewardRepositoryPort = rewardRepository
