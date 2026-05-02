import { Redis } from 'ioredis'
import { env } from '../../config/env.js'
import { logger } from '../logger/logger.js'

// Single shared client for non-queue Redis ops (rate limiter, circuit breaker).
// BullMQ keeps its own pool in connection.ts; do not reuse — BullMQ's client
// is configured with `maxRetriesPerRequest: null` which is wrong for one-shot
// commands.

let client: Redis | null = null

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(env.REDIS_URL, {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    })
    client.on('error', (err: Error) => {
      logger.error({ err: String(err) }, 'redis client error')
    })
  }
  return client
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit()
    client = null
  }
}
