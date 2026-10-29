import { getRedis } from './redis.client.js'
import { logger } from '../logger/logger.js'

const log = logger.child({ module: 'agent-budget' })

export interface BudgetResult {
  ok: boolean
  used: number
  limit: number
  remaining: number
  resetSeconds: number
}

export function secondsToUtcMidnight(now: Date): number {
  const midnight = new Date(now)
  midnight.setUTCHours(24, 0, 0, 0)
  return Math.max(1, Math.ceil((midnight.getTime() - now.getTime()) / 1000))
}

export function secondsToNextUtcHour(now: Date): number {
  const nextHour = new Date(now)
  nextHour.setUTCMinutes(60, 0, 0)
  return Math.max(1, Math.ceil((nextHour.getTime() - now.getTime()) / 1000))
}

export function ingestBudgetKey(apiKeyId: number, now: Date): string {
  return `geo-agent:budget:ingest:${apiKeyId}:${now.toISOString().slice(0, 10)}`
}

export function pinBudgetKey(apiKeyId: number, now: Date): string {
  return `geo-agent:budget:pins:${apiKeyId}:${now.toISOString().slice(0, 13)}`
}

export function enrollBudgetKey(apiKeyId: number, now: Date): string {
  return `geo-agent:budget:enroll:${apiKeyId}:${now.toISOString().slice(0, 10)}`
}

export function captureImportBudgetKey(apiKeyId: number, now: Date): string {
  return `geo-agent:budget:capture-import:${apiKeyId}:${now.toISOString().slice(0, 10)}`
}

export function mapActionBudgetKey(apiKeyId: number, now: Date): string {
  return `geo-agent:budget:map-action:${apiKeyId}:${now.toISOString().slice(0, 10)}`
}

export function mapUploadBudgetKey(apiKeyId: number, now: Date): string {
  return `geo-agent:budget:map-upload:${apiKeyId}:${now.toISOString().slice(0, 10)}`
}

export function promoteBudgetKey(apiKeyId: number, now: Date): string {
  return `geo-agent:budget:promote:${apiKeyId}:${now.toISOString().slice(0, 10)}`
}

export function promoteOverrideBudgetKey(apiKeyId: number, now: Date): string {
  return `geo-agent:budget:promote-override:${apiKeyId}:${now.toISOString().slice(0, 10)}`
}

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
      await redis.expire(key, resetSeconds + 60)
    }
    if (used > limit) {
      await redis.decr(key)
      return { ok: false, used: limit, limit, remaining: 0, resetSeconds }
    }
    return { ok: true, used, limit, remaining: Math.max(0, limit - used), resetSeconds }
  } catch (err) {
    log.error({ err: String(err), key, label }, `${label} budget check failed — failing closed`)
    return { ok: false, used: limit, limit, remaining: 0, resetSeconds }
  }
}

export async function consumeIngestBudget(apiKeyId: number, limit: number): Promise<BudgetResult> {
  const now = new Date()
  return consumeWindowBudget(ingestBudgetKey(apiKeyId, now), limit, secondsToUtcMidnight(now), 'ingest')
}

export async function consumePinBudget(apiKeyId: number, limit: number): Promise<BudgetResult> {
  const now = new Date()
  return consumeWindowBudget(pinBudgetKey(apiKeyId, now), limit, secondsToNextUtcHour(now), 'pin')
}

export async function consumeEnrollBudget(apiKeyId: number, limit: number): Promise<BudgetResult> {
  const now = new Date()
  return consumeWindowBudget(enrollBudgetKey(apiKeyId, now), limit, secondsToUtcMidnight(now), 'enroll')
}

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

export async function consumeMapActionBudget(apiKeyId: number, limit: number): Promise<BudgetResult> {
  const now = new Date()
  return consumeWindowBudget(
    mapActionBudgetKey(apiKeyId, now),
    limit,
    secondsToUtcMidnight(now),
    'map-action',
  )
}

export async function consumeMapUploadBudget(apiKeyId: number, limit: number): Promise<BudgetResult> {
  const now = new Date()
  return consumeWindowBudget(
    mapUploadBudgetKey(apiKeyId, now),
    limit,
    secondsToUtcMidnight(now),
    'map-upload',
  )
}

export async function consumePromoteBudget(apiKeyId: number, limit: number): Promise<BudgetResult> {
  const now = new Date()
  return consumeWindowBudget(
    promoteBudgetKey(apiKeyId, now),
    limit,
    secondsToUtcMidnight(now),
    'promote',
  )
}

export async function consumePromoteOverrideBudget(
  apiKeyId: number,
  limit: number,
): Promise<BudgetResult> {
  const now = new Date()
  return consumeWindowBudget(
    promoteOverrideBudgetKey(apiKeyId, now),
    limit,
    secondsToUtcMidnight(now),
    'promote-override',
  )
}
