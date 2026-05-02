import type { Redis } from 'ioredis'
import { getRedis } from './redis.client.js'
import { logger } from '../logger/logger.js'

// Per-source token bucket. Each external provider (Steam, RAWG, MapGenie, ...)
// gets its own bucket so a slow provider can't starve a fast one. Lua-evaluated
// for atomicity across replicas; in-process libraries like `bottleneck` would
// only throttle within a single Node process.

const log = logger.child({ module: 'rate-limiter' })

// KEYS[1] = tokens key
// KEYS[2] = last_refill_ms key
// ARGV[1] = capacity (max tokens)
// ARGV[2] = refill_per_sec (float)
// ARGV[3] = now_ms
// ARGV[4] = cost
// Returns: { allowed (0|1), retry_after_ms }
const TOKEN_BUCKET_LUA = `
local capacity = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])

local tokens = tonumber(redis.call('GET', KEYS[1]))
local last = tonumber(redis.call('GET', KEYS[2]))
if tokens == nil then tokens = capacity end
if last == nil then last = now end

local elapsed = (now - last) / 1000.0
if elapsed > 0 then
  tokens = math.min(capacity, tokens + elapsed * rate)
end

local allowed = 0
local retry = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
else
  local needed = cost - tokens
  retry = math.ceil((needed / rate) * 1000)
end

redis.call('SET', KEYS[1], tostring(tokens), 'EX', 3600)
redis.call('SET', KEYS[2], tostring(now), 'EX', 3600)
return { allowed, retry }
`

export interface BucketOptions {
  /** Max tokens the bucket holds. */
  capacity: number
  /** Tokens added per second. */
  refillPerSec: number
  /** Tokens consumed by this call. Default 1. */
  cost?: number
}

export interface AcquireResult {
  allowed: boolean
  retryAfterMs: number
}

function keyTokens(source: string): string {
  return `geo:rl:${source}:tokens`
}

function keyLast(source: string): string {
  return `geo:rl:${source}:last`
}

let scriptSha: string | null = null

async function evalScript(redis: Redis, source: string, opts: BucketOptions): Promise<[number, number]> {
  const args = [
    String(opts.capacity),
    String(opts.refillPerSec),
    String(Date.now()),
    String(opts.cost ?? 1),
  ]
  // Try EVALSHA for fewer bytes on the wire; fall back to EVAL on NOSCRIPT.
  if (scriptSha) {
    try {
      const result = (await redis.evalsha(scriptSha, 2, keyTokens(source), keyLast(source), ...args)) as [number, number]
      return result
    } catch (err) {
      const msg = String(err)
      if (!msg.includes('NOSCRIPT')) throw err
    }
  }
  const result = (await redis.eval(TOKEN_BUCKET_LUA, 2, keyTokens(source), keyLast(source), ...args)) as [number, number]
  scriptSha = await redis.script('LOAD', TOKEN_BUCKET_LUA) as string
  return result
}

/**
 * Try to consume tokens without blocking. Returns immediately.
 */
export async function tryAcquire(source: string, opts: BucketOptions): Promise<AcquireResult> {
  const [allowed, retry] = await evalScript(getRedis(), source, opts)
  return { allowed: allowed === 1, retryAfterMs: retry }
}

/**
 * Block until tokens can be consumed. Sleeps with small random jitter to avoid
 * thundering-herd when many workers wake up together.
 */
export async function acquire(source: string, opts: BucketOptions): Promise<void> {
  for (;;) {
    const { allowed, retryAfterMs } = await tryAcquire(source, opts)
    if (allowed) return
    const jitter = Math.floor(Math.random() * 50)
    const sleepMs = Math.min(retryAfterMs + jitter, 5000)
    log.debug({ source, retryAfterMs, sleepMs }, 'rate limited, sleeping')
    await new Promise((r) => setTimeout(r, sleepMs))
  }
}
