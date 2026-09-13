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
import adminAgentKeysRoutes from './presentation/routes/admin-agent-keys.routes.js'
import { testRedisConnection } from './infrastructure/queue/connection.js'
import {
  importQueue,
  geoQueue,
  pushQueue,
  webhookQueue,
  importQueueEvents,
  geoQueueEvents,
  pushQueueEvents,
  webhookQueueEvents,
} from './infrastructure/queue/queues.js'
import { importWorker } from './infrastructure/queue/workers/import.worker.js'
import { geoWorker } from './infrastructure/queue/workers/geo.worker.js'
import { pushWorker } from './infrastructure/queue/workers/push.worker.js'
import { webhookWorker } from './infrastructure/queue/workers/webhook-delivery.worker.js'
import { db } from './infrastructure/database/connection.js'
import { initializeSocketIO } from './infrastructure/socket/socket.js'

// Validate environment
validateEnv()

// Log configuration on startup
logger.info(
  {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    corsOrigin: env.CORS_ORIGIN,
    apiUrl: env.API_URL,
    databaseUrl: env.DATABASE_URL.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@'), // Hide password
    redisUrl: env.REDIS_URL,
    emailFrom: env.EMAIL_FROM,
    hasResendApiKey: !!env.RESEND_API_KEY,
    hasRawgApiKey: !!env.RAWG_API_KEY,
    betterAuthSecretLength: env.BETTER_AUTH_SECRET.length,
  },
  'configuration loaded'
)

const app = express()

// Trust the first proxy hop (Traefik in production, Vite proxy in dev)
// so `req.ip` reflects the real client address for rate limiting.
app.set('trust proxy', 1)

// JSON parsing middleware
app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
}))

// Stripe webhooks must mount BEFORE the global JSON parser — signature
// verification needs the exact raw bytes Stripe sent. The route applies
// its own express.raw() so only this path skips JSON parsing.
app.use('/api/billing/webhook', billingWebhookRoutes)

// JSON parsing middleware. Explicit 256kb limit pins the default rather
// than relying on Express's implicit 100kb — leaves headroom for the
// largest realistic request (admin game import payloads) without
// exposing a memory-exhaustion vector.
app.use(express.json({ limit: '256kb' }))
app.use(express.urlencoded({ extended: true, limit: '256kb' }))

// Database pool for user deletion
const dbPool = new Pool({
  connectionString: env.DATABASE_URL,
})

// Custom route for delete-user (must be before better-auth handler)
app.delete('/api/auth/admin/delete-user', adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.body

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_USER_ID', message: 'User ID is required' },
      })
    }

    // Prevent self-deletion
    if (userId === req.userId) {
      return res.status(400).json({
        success: false,
        error: { code: 'CANNOT_DELETE_SELF', message: 'You cannot delete your own account' },
      })
    }

    // Check if user exists
    const userCheck = await dbPool.query('SELECT id, role FROM "user" WHERE id = $1', [userId])
    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      })
    }

    // Delete user - CASCADE will handle related records (sessions, accounts, game_sessions, etc.)
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

// Mount better-auth handler with error handling
// This handles all /api/auth/* routes automatically
//
// Targeted rate limits go first so they short-circuit before better-auth
// sees the request. These catch the email-triggering routes that an
// unauthenticated attacker can hit to burn Resend quota or mail-bomb
// arbitrary addresses. High-frequency routes like /get-session are left
// alone — they don't send email and users hit them on every page load.
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

// Request logging (after body parsing for potential body logging)
app.use(requestLogger)

// Static file serving for uploads (screenshots and avatars)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadsPath = path.resolve(__dirname, '..', '..', '..', 'uploads')
app.use('/uploads', express.static(uploadsPath))

// Ensure avatars directory exists
const avatarsPath = path.resolve(uploadsPath, 'avatars')
import fs from 'fs'
if (!fs.existsSync(avatarsPath)) {
  fs.mkdirSync(avatarsPath, { recursive: true })
}

// Liveness + readiness probes. Mounted at the root: an orchestrator
// probes these before any application concern exists.
app.use(healthRoutes)

// API Routes
// Auth routes handled by better-auth at /api/auth/*
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
// Community geo surface (free play + contribution) — mounted only while the
// community dataset-building loop is active. Unmounting sunsets the player
// routes without touching the geo data layer: ingestion, the agent sourcing
// API and GeoGamers don't go through /api/geo.
if (env.GEO_COMMUNITY_ENABLED === 'true') {
  app.use('/api/geo', geoRoutes)
}
// GeoGamers mode — mounted only when enabled so the API surface stays dark
// until there's enough consensus-confirmed content to schedule challenges.
if (env.GEOGAMERS_ENABLED === 'true') {
  app.use('/api/geogamers', geoGamersRoutes)
}
app.use('/api/screenshot-reports', screenshotReportRoutes)
app.use('/api/push', pushRoutes)
app.use('/api/billing', billingRoutes)
app.use('/api/koe', koeRoutes)
// Public, opt-in, key-authenticated read API for streamer integrations.
// Mounted with its own CORS + rate-limit stack inside the router — see
// public.routes.ts. Lives at /api/public/v1 so future versions can land
// alongside without breaking pinned clients.
app.use('/api/public/v1', publicV1Routes)
// Session-authenticated key-management surface for the Streamer Kit
// settings page. Owners flip the public-profile toggle, claim a slug,
// and manage their keys here.
app.use('/api/streamer-keys', streamerKeysRoutes)
// Agent content-sourcing surface (issue #331). Key-authenticated with
// admin-minted geo-agent keys. Always mounted; the whole surface is gated
// per-request by GEO_AGENT_API_ENABLED (returns 503 AGENT_API_DISABLED when
// off) so it can be killed by env flip + redeploy without a code change.
app.use('/api/agent/v1/geo', agentGeoRoutes)

// Serve frontend static files (after API routes)
const frontendPath = path.resolve(__dirname, '..', '..', '..', 'packages', 'frontend', 'dist')
app.use(express.static(frontendPath))

// Share shells: index.html with per-share OG meta patched into the raw
// HTML. Must come AFTER express.static so the static index.html does not
// shadow them, and BEFORE the SPA fallback.
app.use(shareRoutes)

// Unmatched API routes must return JSON, not the SPA shell. Otherwise a request
// to a route that isn't mounted (e.g. `/api/geogamers/*` when the feature flag
// is off) would fall through to the HTML fallback below, and clients calling
// `res.json()` on it crash with "Unexpected token '<', "<!doctype "...".
app.use('/api', (_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'API endpoint not found' },
  })
})

// SPA fallback - serve index.html for all other routes (must be after API routes and static files)
app.use((_req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'))
})

// Error handling
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

// Start server
async function start(): Promise<void> {
  logger.info({ env: env.NODE_ENV }, 'starting server')

  // Test database connection
  const dbConnected = await testConnection()
  if (!dbConnected) {
    logger.warn('database connection failed - some features may not work')
  } else {
    // Run migrations automatically on startup
    const migrated = await runMigrations()
    if (!migrated) {
      logger.warn('database migration failed - schema may be outdated')
    }
  }

  // Test Redis connection
  const redisConnected = await testRedisConnection()
  if (!redisConnected) {
    logger.warn('redis connection failed - job queue may not work')
  } else {
    // Recurring BullMQ schedules live in bootstrap/scheduled-jobs.ts.
    await registerScheduledJobs()
  }

  // Create HTTP server and initialize Socket.IO
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

  // Graceful shutdown. Docker sends SIGTERM on rolling deploy and waits ~10s
  // before SIGKILL — close in dependency order so in-flight requests and
  // queued jobs aren't cut mid-write.
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

    // Stop accepting new connections and wait for in-flight HTTP requests
    // to finish. Without awaiting, the DB and Redis teardown below could
    // race with a request still writing.
    await closeWithTimeout(
      'httpServer',
      () => new Promise<void>((resolve) => httpServer.close(() => resolve()))
    )
    if (io) {
      await closeWithTimeout('socket.io', () => new Promise<void>((resolve) => io.close(() => resolve())))
    }

    // Stop workers from picking up new jobs BEFORE closing the queue
    // connections — without this, the worker poll-loop could grab a job,
    // start a transaction, and then have its Redis connection ripped
    // out from under it mid-write.
    await Promise.all([
      closeWithTimeout('importWorker.pause', () => importWorker.pause()),
      closeWithTimeout('geoWorker.pause', () => geoWorker.pause()),
      closeWithTimeout('pushWorker.pause', () => pushWorker.pause()),
      closeWithTimeout('webhookWorker.pause', () => webhookWorker.pause()),
    ])

    // Now drain — worker.close() waits for active jobs to finish (up to
    // the closeWithTimeout window). Give workers a longer fuse than the
    // socket/HTTP teardown because in-flight jobs may need to finish a
    // DB write before they can return cleanly.
    await Promise.all([
      closeWithTimeout('importWorker', () => importWorker.close(), 15_000),
      closeWithTimeout('geoWorker', () => geoWorker.close(), 15_000),
      closeWithTimeout('pushWorker', () => pushWorker.close(), 15_000),
      closeWithTimeout('webhookWorker', () => webhookWorker.close(), 15_000),
    ])
    await Promise.all([
      closeWithTimeout('importQueue', () => importQueue.close()),
      closeWithTimeout('geoQueue', () => geoQueue.close()),
      closeWithTimeout('pushQueue', () => pushQueue.close()),
      closeWithTimeout('webhookQueue', () => webhookQueue.close()),
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

  // Fail fast on unhandled errors so the orchestrator can restart us.
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
