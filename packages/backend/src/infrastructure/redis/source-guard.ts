import { acquire as acquireToken } from './rate-limiter.js'
import {
  getState,
  recordFailure,
  recordSuccess,
  tryHalfOpenProbe,
  type CircuitState,
} from './circuit-breaker.js'
import { logger } from '../logger/logger.js'

const log = logger.child({ module: 'source-guard' })

export class CircuitOpenError extends Error {
  constructor(public readonly source: string) {
    super(`Circuit OPEN for source=${source}`)
    this.name = 'CircuitOpenError'
  }
}

export interface GuardOptions {
  source: string
  rateCapacity: number
  rateRefillPerSec: number
}

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
