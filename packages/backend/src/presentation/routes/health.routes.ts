import { Router } from 'express'
import { env } from '../../config/env.js'
import { testConnection } from '../../infrastructure/database/connection.js'
import { testRedisConnection } from '../../infrastructure/queue/connection.js'
import { pushService } from '../../composition/services.js'

const router = Router()

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

router.get('/healthz', async (_req, res) => {
  const [dbOk, redisOk] = await Promise.all([
    testConnection().catch(() => false),
    testRedisConnection().catch(() => false),
  ])
  const checks = {
    db: dbOk,
    redis: redisOk,
    push: pushService.isConfigured(),
    email: !!env.RESEND_API_KEY,
  }
  const ready = checks.db && checks.redis
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ok' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  })
})

export default router
