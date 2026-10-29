import { env } from '../../config/env.js'
import { queueLogger } from '../logger/logger.js'

const log = queueLogger

function parseRedisUrl(url: string): { host: string; port: number } {
  try {
    const parsed = new URL(url)
    return {
      host: parsed.hostname || 'localhost',
      port: parseInt(parsed.port || '6379'),
    }
  } catch {
    return { host: 'localhost', port: 6379 }
  }
}

const { host, port } = parseRedisUrl(env.REDIS_URL)

export const redisConnectionOptions = {
  host,
  port,
  maxRetriesPerRequest: null as null,
}

export async function testRedisConnection(): Promise<boolean> {
  try {
    const { Queue } = await import('bullmq')
    const testQueue = new Queue('test-connection', {
      connection: redisConnectionOptions,
    })

    const start = Date.now()
    await testQueue.getJobCounts()
    log.info({ durationMs: Date.now() - start, host, port }, 'redis connection verified')
    await testQueue.close()
    return true
  } catch (error) {
    log.error({ error: String(error), host, port }, 'redis connection failed')
    return false
  }
}

export async function tryAcquireBootLock(key: string, ttlSeconds = 60): Promise<boolean> {
  const ioredisModule = await import('ioredis')
  const Redis = (ioredisModule as unknown as { default: typeof import('ioredis').Redis }).default
  const client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: false })
  try {
    const result = await client.set(`bootlock:${key}`, String(Date.now()), 'EX', ttlSeconds, 'NX')
    return result === 'OK'
  } catch (err) {
    log.warn({ err: String(err), key }, 'boot lock acquire failed; proceeding without lock')
    return true
  } finally {
    await client.quit().catch(() => { })
  }
}
