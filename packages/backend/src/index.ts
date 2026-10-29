import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { createServer } from 'http'
import { toNodeHandler } from 'better-auth/node'
import { env, validateEnv } from './config/env.js'
import { testConnection, runMigrations } from './infrastructure/database/connection.js'
import { auth } from './infrastructure/auth/auth.js'
import { logger } from './infrastructure/logger/logger.js'
import { registerScheduledJobs } from './bootstrap/scheduled-jobs.js'
import healthRoutes from './presentation/routes/health.routes.js'
import shareRoutes from './presentation/routes/share.routes.js'
import { requestLogger } from './presentation/middleware/request-logger.middleware.js'
import { adminMiddleware } from './presentation/middleware/auth.middleware.js'
import { createRateLimiter } from './presentation/middleware/rate-limit.middleware.js'
import { Pool } from 'pg'
import gameRoutes from './presentation/routes/game.routes.js'
import leaderboardRoutes from './presentation/routes/leaderboard.routes.js'
import adminRoutes from './presentation/routes/admin.routes.js'
import geoFetchRoutes from './presentation/routes/geo-fetch.routes.js'
import userRoutes from './presentation/routes/user.routes.js'
import achievementRoutes from './presentation/routes/achievement.routes.js'
import dailyLoginRoutes from './presentation/routes/daily-login.routes.js'
import rewardsRoutes from './presentation/routes/rewards.routes.js'
import referralRoutes from './presentation/routes/referral.routes.js'
import ogRoutes from './presentation/routes/og.routes.js'
import geoRoutes from './presentation/routes/geo.routes.js'
import featuresRoutes from './presentation/routes/features.routes.js'
import geoGamersRoutes from './presentation/routes/geogamers.routes.js'
import screenshotReportRoutes from './presentation/routes/screenshot-report.routes.js'
import pushRoutes from './presentation/routes/push.routes.js'
import billingRoutes from './presentation/routes/billing.routes.js'
import billingWebhookRoutes from './presentation/routes/billing-webhook.routes.js'
import koeRoutes from './presentation/routes/koe.routes.js'
import publicV1Routes from './presentation/routes/public.routes.js'
import streamerKeysRoutes from './presentation/routes/streamer-keys.routes.js'
import agentGeoRoutes from './presentation/routes/agent-geo.routes.js'
import agentSettingsRoutes from './presentation/routes/agent-settings.routes.js'
import adminAgentKeysRoutes from './presentation/routes/admin-agent-keys.routes.js'
import { testRedisConnection } from './infrastructure/queue/connection.js'
import {
  importQueue,
  geoQueue,
  pushQueue,
  webhookQueue,
  describeGuessQueue,
  importQueueEvents,
  geoQueueEvents,
  pushQueueEvents,
  webhookQueueEvents,
} from './infrastructure/queue/queues.js'
import { importWorker } from './infrastructure/queue/workers/import.worker.js'
import { geoWorker } from './infrastructure/queue/workers/geo.worker.js'
import { pushWorker } from './infrastructure/queue/workers/push.worker.js'
import { webhookWorker } from './infrastructure/queue/workers/webhook-delivery.worker.js'
import { describeGuessWorker } from './infrastructure/queue/workers/describe-guess.worker.js'
import { db } from './infrastructure/database/connection.js'
import { initializeSocketIO } from './infrastructure/socket/socket.js'

validateEnv()

logger.info(
  {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    corsOrigin: env.CORS_ORIGIN,
    apiUrl: env.API_URL,
    databaseUrl: env.DATABASE_URL.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@'),
    redisUrl: env.REDIS_URL,
    emailFrom: env.EMAIL_FROM,
    hasResendApiKey: !!env.RESEND_API_KEY,
    hasRawgApiKey: !!env.RAWG_API_KEY,
    betterAuthSecretLength: env.BETTER_AUTH_SECRET.length,
  },
  'configuration loaded'
)

const app = express()

app.set('trust proxy', 1)

app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
}))

app.use('/api/billing/webhook', billingWebhookRoutes)

app.use(express.json({ limit: '256kb' }))
app.use(express.urlencoded({ extended: true, limit: '256kb' }))

const dbPool = new Pool({
  connectionString: env.DATABASE_URL,
})

app.delete('/api/auth/admin/delete-user', adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.body

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_USER_ID', message: 'User ID is required' },
      })
    }

    if (userId === req.userId) {
      return res.status(400).json({
        success: false,
        error: { code: 'CANNOT_DELETE_SELF', message: 'You cannot delete your own account' },
      })
    }

    const userCheck = await dbPool.query('SELECT id, role FROM "user" WHERE id = $1', [userId])
    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      })
    }

    await dbPool.query('DELETE FROM "user" WHERE id = $1', [userId])

    logger.info({ deletedUserId: userId, deletedBy: req.userId }, 'user deleted by admin')

    res.json({
      success: true,
      data: { deleted: true },
    })
  } catch (error) {
    logger.error({ error: String(error) }, 'failed to delete user')
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to delete user',
      },
    })
  }
})

app.use('/api/auth/forgot-password', createRateLimiter({ windowMs: 15 * 60_000, max: 5 }))
app.use('/api/auth/send-verification-email', createRateLimiter({ windowMs: 15 * 60_000, max: 5 }))
app.use('/api/auth/sign-up', createRateLimiter({ windowMs: 15 * 60_000, max: 10 }))

app.use('/api/auth', (req, res, next) => {
  try {
    toNodeHandler(auth)(req, res).catch((error: Error) => {
      logger.error({ error: error.message, stack: error.stack, url: req.url }, 'better-auth error')
      res.status(500).json({
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: env.NODE_ENV === 'development' ? error.message : 'Authentication error',
        },
      })
    })
  } catch (error) {
    logger.error({ error: String(error), url: req.url }, 'better-auth sync error')
    next(error)
  }
})

app.use(requestLogger)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadsPath = path.resolve(__dirname, '..', '..', '..', 'uploads')
app.use('/uploads', express.static(uploadsPath))

const avatarsPath = path.resolve(uploadsPath, 'avatars')
import fs from 'fs'
if (!fs.existsSync(avatarsPath)) {
  fs.mkdirSync(avatarsPath, { recursive: true })
}

app.use(healthRoutes)

app.use('/api/game', gameRoutes)
app.use('/api/leaderboard', leaderboardRoutes)
app.use('/api/admin/geo-fetch', geoFetchRoutes)
app.use('/api/admin/agent-keys', adminAgentKeysRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/user', userRoutes)
app.use('/api/achievements', achievementRoutes)
app.use('/api/daily-login', dailyLoginRoutes)
app.use('/api/inventory', dailyLoginRoutes)
app.use('/api/rewards', rewardsRoutes)
app.use('/api/referral', referralRoutes)
app.use('/api/og', ogRoutes)
app.use('/api/features', featuresRoutes)
if (env.GEO_COMMUNITY_ENABLED === 'true') {
  app.use('/api/geo', geoRoutes)
}
if (env.GEOGAMERS_ENABLED === 'true') {
  app.use('/api/geogamers', geoGamersRoutes)
}
app.use('/api/screenshot-reports', screenshotReportRoutes)
app.use('/api/push', pushRoutes)
app.use('/api/billing', billingRoutes)
app.use('/api/koe', koeRoutes)
app.use('/api/public/v1', publicV1Routes)
app.use('/api/streamer-keys', streamerKeysRoutes)
app.use('/api/agent/v1/geo', agentGeoRoutes)
app.use('/api/agent/v1/settings', agentSettingsRoutes)

const frontendPath = path.resolve(__dirname, '..', '..', '..', 'packages', 'frontend', 'dist')
app.use(express.static(frontendPath))

app.use(shareRoutes)

app.use('/api', (_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'API endpoint not found' },
  })
})

app.use((_req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'))
})

app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(
    {
      error: err.message,
      stack: env.NODE_ENV === 'development' ? err.stack : undefined,
      method: req.method,
      url: req.url,
    },
    'unhandled error'
  )
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    },
  })
})

async function start(): Promise<void> {
  logger.info({ env: env.NODE_ENV }, 'starting server')

  const dbConnected = await testConnection()
  if (!dbConnected) {
    logger.warn('database connection failed - some features may not work')
  } else {
    const migrated = await runMigrations()
    if (!migrated) {
      logger.warn('database migration failed - schema may be outdated')
    }
  }

  const redisConnected = await testRedisConnection()
  if (!redisConnected) {
    logger.warn('redis connection failed - job queue may not work')
  } else {
    await registerScheduledJobs()
  }

  const httpServer = createServer(app)
  const io = initializeSocketIO(httpServer)

  httpServer.listen(env.PORT, () => {
    logger.info(
      {
        port: env.PORT,
        env: env.NODE_ENV,
        corsOrigin: env.CORS_ORIGIN,
        logLevel: env.LOG_LEVEL,
      },
      'server started with Socket.IO'
    )
  })

  let shuttingDown = false
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info({ signal }, 'received shutdown signal, draining connections')

    const closeWithTimeout = <T,>(label: string, op: () => Promise<T>, ms = 8000) =>
      Promise.race([
        op().catch((err) => logger.warn({ err: String(err), label }, 'shutdown step failed')),
        new Promise<void>((resolve) =>
          setTimeout(() => {
            logger.warn({ label, ms }, 'shutdown step timed out')
            resolve()
          }, ms)
        ),
      ])

    await closeWithTimeout(
      'httpServer',
      () => new Promise<void>((resolve) => httpServer.close(() => resolve()))
    )
    if (io) {
      await closeWithTimeout('socket.io', () => new Promise<void>((resolve) => io.close(() => resolve())))
    }

    await Promise.all([
      closeWithTimeout('importWorker.pause', () => importWorker.pause()),
      closeWithTimeout('geoWorker.pause', () => geoWorker.pause()),
      closeWithTimeout('pushWorker.pause', () => pushWorker.pause()),
      closeWithTimeout('webhookWorker.pause', () => webhookWorker.pause()),
      closeWithTimeout('describeGuessWorker.pause', () => describeGuessWorker.pause()),
    ])

    await Promise.all([
      closeWithTimeout('importWorker', () => importWorker.close(), 15_000),
      closeWithTimeout('geoWorker', () => geoWorker.close(), 15_000),
      closeWithTimeout('pushWorker', () => pushWorker.close(), 15_000),
      closeWithTimeout('webhookWorker', () => webhookWorker.close(), 15_000),
      closeWithTimeout('describeGuessWorker', () => describeGuessWorker.close(), 15_000),
    ])
    await Promise.all([
      closeWithTimeout('importQueue', () => importQueue.close()),
      closeWithTimeout('geoQueue', () => geoQueue.close()),
      closeWithTimeout('pushQueue', () => pushQueue.close()),
      closeWithTimeout('webhookQueue', () => webhookQueue.close()),
      closeWithTimeout('describeGuessQueue', () => describeGuessQueue.close()),
      closeWithTimeout('importQueueEvents', () => importQueueEvents.close()),
      closeWithTimeout('geoQueueEvents', () => geoQueueEvents.close()),
      closeWithTimeout('pushQueueEvents', () => pushQueueEvents.close()),
      closeWithTimeout('webhookQueueEvents', () => webhookQueueEvents.close()),
    ])
    await closeWithTimeout('db', () => db.destroy())

    logger.info('shutdown complete')
    process.exit(0)
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason: String(reason) }, 'unhandled promise rejection')
    void shutdown('SIGTERM')
  })
  process.on('uncaughtException', (err) => {
    logger.fatal({ err: String(err) }, 'uncaught exception')
    void shutdown('SIGTERM')
  })
}

start().catch((err) => {
  logger.fatal({ error: String(err) }, 'failed to start server')
  process.exit(1)
})
