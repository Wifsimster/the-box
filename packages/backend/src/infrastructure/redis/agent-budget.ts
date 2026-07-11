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

/** Seconds from `now` until the top of the next UTC hour. Pure. */
export function secondsToNextUtcHour(now: Date): number {
  const nextHour = new Date(now)
  nextHour.setUTCMinutes(60, 0, 0)
  return Math.max(1, Math.ceil((nextHour.getTime() - now.getTime()) / 1000))
}

/** Redis key for a key's ingest budget on a given UTC day. Pure. */
export function ingestBudgetKey(apiKeyId: number, now: Date): string {
  return `geo-agent:budget:ingest:${apiKeyId}:${now.toISOString().slice(0, 10)}`
}

/** Redis key for a key's pin budget in a given UTC hour. Pure. */
export function pinBudgetKey(apiKeyId: number, now: Date): string {
  // slice(0, 13) → "YYYY-MM-DDTHH" (hour granularity).
  return `geo-agent:budget:pins:${apiKeyId}:${now.toISOString().slice(0, 13)}`
}

/** Redis key for a key's daily enroll budget (phase 5, curate scope). Pure. */
export function enrollBudgetKey(apiKeyId: number, now: Date): string {
  return `geo-agent:budget:enroll:${apiKeyId}:${now.toISOString().slice(0, 10)}`
}

/** Redis key for a key's daily capture-import budget (phase 5). Pure. */
export function captureImportBudgetKey(apiKeyId: number, now: Date): string {
  return `geo-agent:budget:capture-import:${apiKeyId}:${now.toISOString().slice(0, 10)}`
}

/** Redis key for a key's daily map-curation-action budget (phase 5). Pure. */
export function mapActionBudgetKey(apiKeyId: number, now: Date): string {
  return `geo-agent:budget:map-action:${apiKeyId}:${now.toISOString().slice(0, 10)}`
}

/** Redis key for a key's daily confirm/promote budget (phase 7). Pure. */
export function promoteBudgetKey(apiKeyId: number, now: Date): string {
  return `geo-agent:budget:promote:${apiKeyId}:${now.toISOString().slice(0, 10)}`
}

/**
 * Atomically consume one unit of a windowed budget keyed in Redis. Returns
 * `ok: false` (without consuming) once `limit` is reached; the counter expires
 * at the end of the window so it rolls over automatically. FAILS CLOSED on any
 * Redis error — a budget we can't verify must not silently become unlimited.
 */
async function consumeWindowBudget(
  key: string,
  limit: number,
  resetSeconds: number,
  label: string,
): Promise<BudgetResult> {
  try {
    const redis = getRedis()
    const used = await redis.incr(key)
    if (used === 1) {
      // First hit in this window — bound the key's lifetime to the window.
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
    log.error({ err: String(err), key, label }, `${label} budget check failed — failing closed`)
    return { ok: false, used: limit, limit, remaining: 0, resetSeconds }
  }
}

/** Consume one unit of a key's DAILY ingest budget (phase 3). */
export async function consumeIngestBudget(apiKeyId: number, limit: number): Promise<BudgetResult> {
  const now = new Date()
  return consumeWindowBudget(ingestBudgetKey(apiKeyId, now), limit, secondsToUtcMidnight(now), 'ingest')
}

/** Consume one unit of a key's HOURLY pin-proposal budget (phase 4). */
export async function consumePinBudget(apiKeyId: number, limit: number): Promise<BudgetResult> {
  const now = new Date()
  return consumeWindowBudget(pinBudgetKey(apiKeyId, now), limit, secondsToNextUtcHour(now), 'pin')
}

/** Consume one unit of a key's DAILY game-enrollment budget (phase 5). */
export async function consumeEnrollBudget(apiKeyId: number, limit: number): Promise<BudgetResult> {
  const now = new Date()
  return consumeWindowBudget(enrollBudgetKey(apiKeyId, now), limit, secondsToUtcMidnight(now), 'enroll')
}

/** Consume one unit of a key's DAILY capture-import budget (phase 5). */
export async function consumeCaptureImportBudget(
  apiKeyId: number,
  limit: number,
): Promise<BudgetResult> {
  const now = new Date()
  return consumeWindowBudget(
    captureImportBudgetKey(apiKeyId, now),
    limit,
    secondsToUtcMidnight(now),
    'capture-import',
  )
}

/** Consume one unit of a key's DAILY map-curation-action budget (phase 5). */
export async function consumeMapActionBudget(apiKeyId: number, limit: number): Promise<BudgetResult> {
  const now = new Date()
  return consumeWindowBudget(
    mapActionBudgetKey(apiKeyId, now),
    limit,
    secondsToUtcMidnight(now),
    'map-action',
  )
}

/** Consume one unit of a key's DAILY confirm/promote budget (phase 7). */
export async function consumePromoteBudget(apiKeyId: number, limit: number): Promise<BudgetResult> {
  const now = new Date()
  return consumeWindowBudget(
    promoteBudgetKey(apiKeyId, now),
    limit,
    secondsToUtcMidnight(now),
    'promote',
  )
}
