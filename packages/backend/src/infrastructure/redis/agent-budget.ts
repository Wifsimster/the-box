import { getRedis } from './redis.client.js'
import { logger } from '../logger/logger.js'

const log = logger.child({ module: 'agent-budget' })

// Per-key daily budget counter for the agent API (issue #331, phase 3). Backed
// by Redis (INCR + EXPIRE keyed by UTC day) so it survives deploys — an
// in-memory counter would reset on every redeploy and let a looping agent
// multiply its quota. Distinct from the 60/min rate limit: this bounds total
// ingests per day, that bounds burst rate.

export interface BudgetResult {
  ok: boolean
  used: number
  limit: number
  remaining: number
  resetSeconds: number
}

/** Seconds from `now` until the next UTC midnight. Pure — unit-testable. */
export function secondsToUtcMidnight(now: Date): number {
  const midnight = new Date(now)
  midnight.setUTCHours(24, 0, 0, 0)
  return Math.max(1, Math.ceil((midnight.getTime() - now.getTime()) / 1000))
}

/** Redis key for a key's ingest budget on a given UTC day. Pure. */
export function ingestBudgetKey(apiKeyId: number, now: Date): string {
  return `geo-agent:budget:ingest:${apiKeyId}:${now.toISOString().slice(0, 10)}`
}

/**
 * Atomically consume one unit of a key's daily ingest budget. Returns
 * `ok: false` (without consuming) once `limit` is reached. The counter expires
 * at the next UTC midnight so a fresh budget rolls over automatically.
 *
 * On any Redis error the call FAILS CLOSED (`ok: false`): a budget we can't
 * verify must not silently become unlimited.
 */
export async function consumeIngestBudget(apiKeyId: number, limit: number): Promise<BudgetResult> {
  const now = new Date()
  const key = ingestBudgetKey(apiKeyId, now)
  const resetSeconds = secondsToUtcMidnight(now)
  try {
    const redis = getRedis()
    const used = await redis.incr(key)
    if (used === 1) {
      // First hit today — bound the key's lifetime to the current UTC day.
      await redis.expire(key, resetSeconds + 60)
    }
    if (used > limit) {
      // Over budget: undo this increment so rejected calls don't inflate the
      // counter (and thus don't push the reset further via repeated hits).
      await redis.decr(key)
      return { ok: false, used: limit, limit, remaining: 0, resetSeconds }
    }
    return { ok: true, used, limit, remaining: Math.max(0, limit - used), resetSeconds }
  } catch (err) {
    log.error({ err: String(err), apiKeyId }, 'ingest budget check failed — failing closed')
    return { ok: false, used: limit, limit, remaining: 0, resetSeconds }
  }
}
