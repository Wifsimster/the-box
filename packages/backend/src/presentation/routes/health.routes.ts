/**
 * Liveness and readiness probes.
 *
 * Mounted at the root (not under /api/) because orchestrators probe these
 * before any application concern exists. Kept out of `index.ts` so the
 * entrypoint wires things together rather than answering HTTP itself.
 */
import { Router } from 'express'
import { env } from '../../config/env.js'
import { testConnection } from '../../infrastructure/database/connection.js'
import { testRedisConnection } from '../../infrastructure/queue/connection.js'
import { pushService } from '../../composition/services.js'

const router = Router()

// Lightweight liveness check. Always 200 so an orchestrator knows the
// process is up; downstream dependency status lives on /healthz.
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Readiness check. Probes the dependencies the app actually needs to serve
// requests (Postgres, Redis) and reports the optional capability flags
// (web push, email) so dashboards can alert on a misconfigured environment
// instead of waiting for the first user to hit a 503.
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
  // db + redis are required; push and email are optional capabilities. If
  // either required check is failing we report 503 so a load balancer or
  // k8s readiness probe can route traffic away.
  const ready = checks.db && checks.redis
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ok' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  })
})

export default router
