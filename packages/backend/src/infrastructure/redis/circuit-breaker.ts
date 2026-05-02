import { getRedis } from './redis.client.js'
import { logger } from '../logger/logger.js'

// Per-source circuit breaker. When a provider returns 5xx/timeout repeatedly,
// flip OPEN and stop hitting it for a cooldown window. After cooldown, allow
// one probe (HALF_OPEN) — success closes, failure re-opens with full cooldown.
//
// State lives in Redis so multi-replica workers share one truth. Cheap to read
// (one GET) so it's safe to call before every fetch.

const log = logger.child({ module: 'circuit-breaker' })

export type CircuitState = 'closed' | 'open' | 'half_open'

export interface BreakerOptions {
  /** Failures within `windowMs` to trip OPEN. */
  failureThreshold: number
  /** Sliding-window length in ms. */
  windowMs: number
  /** How long to stay OPEN before allowing a probe. */
  cooldownMs: number
}

const DEFAULT: BreakerOptions = {
  failureThreshold: 10,
  windowMs: 60_000,
  cooldownMs: 5 * 60_000,
}

function keyState(source: string): string {
  return `geo:cb:${source}:state`
}
function keyFailures(source: string): string {
  return `geo:cb:${source}:failures`
}
function keyOpenedAt(source: string): string {
  return `geo:cb:${source}:opened_at`
}
function keyHalfOpenProbe(source: string): string {
  return `geo:cb:${source}:probe`
}

/**
 * Read current state, transitioning OPEN → HALF_OPEN if the cooldown elapsed.
 * Cheap; safe to call on every fetch.
 */
export async function getState(
  source: string,
  opts: BreakerOptions = DEFAULT,
): Promise<CircuitState> {
  const redis = getRedis()
  const state = ((await redis.get(keyState(source))) as CircuitState | null) ?? 'closed'
  if (state !== 'open') return state

  const openedAt = Number((await redis.get(keyOpenedAt(source))) ?? 0)
  if (openedAt && Date.now() - openedAt >= opts.cooldownMs) {
    await redis.set(keyState(source), 'half_open', 'EX', 3600)
    log.info({ source }, 'circuit breaker → half_open')
    return 'half_open'
  }
  return 'open'
}

/**
 * Half-open lets exactly one probe through at a time. Returns true if this
 * caller is the elected probe; false otherwise (caller should treat as OPEN).
 */
export async function tryHalfOpenProbe(source: string): Promise<boolean> {
  const redis = getRedis()
  // SET NX with TTL: only one probe per 30s window.
  const acquired = await redis.set(keyHalfOpenProbe(source), '1', 'EX', 30, 'NX')
  return acquired === 'OK'
}

export async function recordSuccess(source: string): Promise<void> {
  const redis = getRedis()
  const state = ((await redis.get(keyState(source))) as CircuitState | null) ?? 'closed'
  if (state === 'closed') return
  // Half-open success → close and clear failure history.
  await redis
    .multi()
    .set(keyState(source), 'closed', 'EX', 3600)
    .del(keyFailures(source))
    .del(keyOpenedAt(source))
    .del(keyHalfOpenProbe(source))
    .exec()
  log.info({ source, from: state }, 'circuit breaker → closed')
}

export async function recordFailure(
  source: string,
  opts: BreakerOptions = DEFAULT,
): Promise<CircuitState> {
  const redis = getRedis()
  const now = Date.now()
  const cutoff = now - opts.windowMs

  const tx = redis.multi()
  tx.zadd(keyFailures(source), now, `${now}:${Math.random()}`)
  tx.zremrangebyscore(keyFailures(source), '-inf', cutoff)
  tx.zcard(keyFailures(source))
  tx.expire(keyFailures(source), Math.ceil(opts.windowMs / 1000) + 60)
  const results = (await tx.exec()) ?? []
  const count = Number(results[2]?.[1] ?? 0)

  const currentState = ((await redis.get(keyState(source))) as CircuitState | null) ?? 'closed'

  if (currentState === 'half_open') {
    // Probe failed → re-open with full cooldown.
    await redis
      .multi()
      .set(keyState(source), 'open', 'EX', Math.ceil(opts.cooldownMs / 1000) + 60)
      .set(keyOpenedAt(source), String(now), 'EX', Math.ceil(opts.cooldownMs / 1000) + 60)
      .del(keyHalfOpenProbe(source))
      .exec()
    log.warn({ source }, 'circuit breaker → open (probe failed)')
    return 'open'
  }

  if (currentState === 'closed' && count >= opts.failureThreshold) {
    await redis
      .multi()
      .set(keyState(source), 'open', 'EX', Math.ceil(opts.cooldownMs / 1000) + 60)
      .set(keyOpenedAt(source), String(now), 'EX', Math.ceil(opts.cooldownMs / 1000) + 60)
      .exec()
    log.warn({ source, failures: count }, 'circuit breaker → open (threshold tripped)')
    return 'open'
  }

  return currentState
}

/**
 * Manual reset — admin escape hatch.
 */
export async function reset(source: string): Promise<void> {
  const redis = getRedis()
  await redis
    .multi()
    .del(keyState(source))
    .del(keyFailures(source))
    .del(keyOpenedAt(source))
    .del(keyHalfOpenProbe(source))
    .exec()
  log.info({ source }, 'circuit breaker manually reset')
}
