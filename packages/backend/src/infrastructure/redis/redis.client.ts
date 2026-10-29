import { Redis } from 'ioredis'
import { env } from '../../config/env.js'
import { logger } from '../logger/logger.js'

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
