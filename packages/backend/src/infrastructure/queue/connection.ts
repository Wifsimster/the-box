import { env } from '../../config/env.js'
import { queueLogger } from '../logger/logger.js'

const log = queueLogger

// Parse Redis URL
function parseRedisUrl(url: string): { host: string; port: number } {
  try {
    const parsed = new URL(url)
    return {
      host: parsed.hostname || 'localhost',
      port: parseInt(parsed.port || '6379'),
    }
  } catch {
    // If URL parsing fails, assume localhost
    return { host: 'localhost', port: 6379 }
  }
}

const { host, port } = parseRedisUrl(env.REDIS_URL)

// Connection options for BullMQ
export const redisConnectionOptions = {
  host,
  port,
  maxRetriesPerRequest: null as null, // Required for BullMQ
}

// Test connection by checking if queue can be accessed
export async function testRedisConnection(): Promise<boolean> {
  try {
    // Import Queue dynamically to test connection
    const { Queue } = await import('bullmq')
    const testQueue = new Queue('test-connection', {
      connection: redisConnectionOptions,
    })

    const start = Date.now()
    // Try to get queue info - this will fail if Redis is not available
    await testQueue.getJobCounts()
    log.info({ durationMs: Date.now() - start, host, port }, 'redis connection verified')
    await testQueue.close()
    return true
  } catch (error) {
    log.error({ error: String(error), host, port }, 'redis connection failed')
    return false
  }
}
