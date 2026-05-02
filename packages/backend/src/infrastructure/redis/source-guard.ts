import { acquire as acquireToken } from './rate-limiter.js'
import {
  getState,
  recordFailure,
  recordSuccess,
  tryHalfOpenProbe,
  type CircuitState,
} from './circuit-breaker.js'
import { logger } from '../logger/logger.js'

// Single entry point that workers call before hitting an external provider.
// Combines: circuit-breaker check → rate-limit acquire → run → record outcome.
//
// Throws `CircuitOpenError` when the breaker is open; callers should treat as
// "skip this source for now, advance pipeline to next provider".

const log = logger.child({ module: 'source-guard' })

export class CircuitOpenError extends Error {
  constructor(public readonly source: string) {
    super(`Circuit OPEN for source=${source}`)
    this.name = 'CircuitOpenError'
  }
}

export interface GuardOptions {
  source: string
  /** Token-bucket capacity. Typically 1×limit (peak ~limit reqs in burst). */
  rateCapacity: number
  /** Token refill per second. e.g. for 60 rpm use 1.0. */
  rateRefillPerSec: number
}

/**
 * Run `fetch` under the rate limiter and circuit breaker for `opts.source`.
 * Records success/failure on the breaker. Returns whatever `fetch` returns.
 *
 * - If breaker is OPEN, throws `CircuitOpenError` without calling `fetch`.
 * - If breaker is HALF_OPEN and we win the probe, runs `fetch`; otherwise
 *   throws `CircuitOpenError`.
 */
export async function runGuarded<T>(
  opts: GuardOptions,
  fetch: () => Promise<T>,
): Promise<T> {
  const state: CircuitState = await getState(opts.source)
  if (state === 'open') {
    throw new CircuitOpenError(opts.source)
  }
  if (state === 'half_open') {
    const probe = await tryHalfOpenProbe(opts.source)
    if (!probe) {
      log.debug({ source: opts.source }, 'half-open probe taken by another worker')
      throw new CircuitOpenError(opts.source)
    }
  }

  await acquireToken(opts.source, {
    capacity: opts.rateCapacity,
    refillPerSec: opts.rateRefillPerSec,
  })

  try {
    const result = await fetch()
    await recordSuccess(opts.source)
    return result
  } catch (err) {
    if (isTransientError(err)) {
      await recordFailure(opts.source)
    }
    throw err
  }
}

function isTransientError(err: unknown): boolean {
  // Permanent errors (404, 401) shouldn't trip the breaker — only transient
  // failures that look like infrastructure trouble.
  if (!err || typeof err !== 'object') return true
  const e = err as { status?: number; code?: string }
  if (typeof e.status === 'number') {
    return e.status >= 500 || e.status === 408 || e.status === 429
  }
  if (typeof e.code === 'string') {
    return ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN'].includes(e.code)
  }
  return true
}
