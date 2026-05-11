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

// Boot-time elect-a-leader lock used to serialise the recurring-job
// re-registration block in index.ts. Without this, two containers
// performing a rolling-deploy "remove then re-add" interleave can leave
// the queue with either zero or two of a recurring job; with this, only
// the first booting container holds the lock for the TTL window and
// re-registers, the rest skip and pick up the already-scheduled cron.
//
// Returns true if the caller acquired the lock; false otherwise. The
// caller does not need to release — the TTL is short and matches a
// rolling-deploy overlap.
export async function tryAcquireBootLock(key: string, ttlSeconds = 60): Promise<boolean> {
  // ioredis ships its CJS default as the named `Redis` export under
  // NodeNext module resolution. Importing the namespace and reading
  // `.default` gives us a constructable value.
  const ioredisModule = await import('ioredis')
  const Redis = (ioredisModule as unknown as { default: typeof import('ioredis').Redis }).default
  const client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: false })
  try {
    const result = await client.set(`bootlock:${key}`, String(Date.now()), 'EX', ttlSeconds, 'NX')
    return result === 'OK'
  } catch (err) {
    log.warn({ err: String(err), key }, 'boot lock acquire failed; proceeding without lock')
    return true // fail-open: better to risk a redundant re-register than to skip entirely
  } finally {
    await client.quit().catch(() => { /* ignore */ })
  }
}
