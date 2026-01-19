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
import { requestLogger } from './presentation/middleware/request-logger.middleware.js'
import { adminMiddleware } from './presentation/middleware/auth.middleware.js'
import { Pool } from 'pg'
import gameRoutes from './presentation/routes/game.routes.js'
import leaderboardRoutes from './presentation/routes/leaderboard.routes.js'
import adminRoutes from './presentation/routes/admin.routes.js'
import userRoutes from './presentation/routes/user.routes.js'
import achievementRoutes from './presentation/routes/achievement.routes.js'
import { testRedisConnection } from './infrastructure/queue/connection.js'
import { importQueue } from './infrastructure/queue/queues.js'
import './infrastructure/queue/workers/import.worker.js'
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

// JSON parsing middleware
app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
}))

// JSON parsing middleware
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

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

// Static file serving for uploads (screenshots)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadsPath = path.resolve(__dirname, '..', '..', '..', 'uploads')
app.use('/uploads', express.static(uploadsPath))

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// API Routes
// Auth routes handled by better-auth at /api/auth/*
app.use('/api/game', gameRoutes)
app.use('/api/leaderboard', leaderboardRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/user', userRoutes)
app.use('/api/achievements', achievementRoutes)

// Serve frontend static files (after API routes)
const frontendPath = path.resolve(__dirname, '..', '..', '..', 'packages', 'frontend', 'dist')
app.use(express.static(frontendPath))

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
    // Clean up deprecated recurring jobs
    const deprecatedJobs = [
      'sync-new-games',
      // Tournament feature was removed
      'create-weekly-tournament',
      'create-monthly-tournament',
      'end-weekly-tournament',
      'end-monthly-tournament',
      'send-tournament-reminders',
    ]
    try {
      const repeatableJobs = await importQueue.getRepeatableJobs()
      for (const job of repeatableJobs) {
        if (deprecatedJobs.includes(job.name)) {
          await importQueue.removeRepeatableByKey(job.key)
          logger.info({ jobName: job.name }, 'removed deprecated recurring job')
        }
      }
    } catch (error) {
      logger.warn({ error: String(error) }, 'failed to clean up deprecated recurring jobs')
    }

    // Log delayed jobs at startup to diagnose stale scheduled jobs
    try {
      const delayedJobs = await importQueue.getJobs(['delayed'])
      const waitingJobs = await importQueue.getJobs(['waiting'])
      const repeatableJobs = await importQueue.getRepeatableJobs()

      if (delayedJobs.length > 0) {
        logger.info({
          count: delayedJobs.length,
          jobs: delayedJobs.map(j => ({
            id: j.id,
            name: j.name,
            delay: j.delay,
            timestamp: j.timestamp,
            processedOn: j.processedOn,
          }))
        }, 'found delayed jobs at startup')
      }

      if (waitingJobs.length > 0) {
        logger.info({
          count: waitingJobs.length,
          jobs: waitingJobs.map(j => ({ id: j.id, name: j.name }))
        }, 'found waiting jobs at startup')
      }

      logger.info({
        repeatableJobs: repeatableJobs.map(j => ({
          name: j.name,
          key: j.key,
          next: j.next ? new Date(j.next).toISOString() : null,
          pattern: j.pattern,
        }))
      }, 'repeatable jobs configuration at startup')
    } catch (error) {
      logger.warn({ error: String(error) }, 'failed to log job queue state at startup')
    }

    // Schedule recurring daily challenge creation (midnight UTC)
    try {
      await importQueue.add(
        'create-daily-challenge',
        {},
        {
          repeat: { pattern: '0 0 * * *' }, // Cron: midnight UTC daily
          jobId: 'create-daily-challenge-recurring',
        }
      )
      logger.info('scheduled recurring create-daily-challenge job (daily at midnight UTC)')
    } catch (error) {
      logger.warn({ error: String(error) }, 'failed to schedule recurring daily challenge job')
    }

    // Schedule recurring sync-all-games job (weekly on Sundays at 2 AM UTC)
    try {
      await importQueue.add(
        'sync-all-games',
        {
          batchSize: 100,
          minMetacritic: 70,
          screenshotsPerGame: 3,
          updateExistingMetadata: true,
        },
        {
          repeat: { pattern: '0 2 * * 0' }, // Cron: 2 AM UTC every Sunday
          jobId: 'sync-all-games-recurring',
        }
      )
      logger.info('scheduled recurring sync-all-games job (weekly on Sundays at 2 AM UTC)')
    } catch (error) {
      logger.warn({ error: String(error) }, 'failed to schedule recurring sync-all-games job')
    }

    // Schedule recurring cleanup-anonymous-users job (daily at 1 AM UTC)
    try {
      await importQueue.add(
        'cleanup-anonymous-users',
        {},
        {
          repeat: { pattern: '0 1 * * *' }, // Cron: 1 AM UTC daily
          jobId: 'cleanup-anonymous-users-recurring',
        }
      )
      logger.info('scheduled recurring cleanup-anonymous-users job (daily at 1 AM UTC)')
    } catch (error) {
      logger.warn({ error: String(error) }, 'failed to schedule recurring cleanup-anonymous-users job')
    }

    // Schedule recurring recalculate-scores job (daily at 3 AM UTC)
    try {
      await importQueue.add(
        'recalculate-scores',
        { batchSize: 100, dryRun: false },
        {
          repeat: { pattern: '0 3 * * *' }, // Cron: 3 AM UTC daily
          jobId: 'recalculate-scores-recurring',
        }
      )
      logger.info('scheduled recurring recalculate-scores job (daily at 3 AM UTC)')
    } catch (error) {
      logger.warn({ error: String(error) }, 'failed to schedule recurring recalculate-scores job')
    }
  }

  // Create HTTP server and initialize Socket.IO
  const httpServer = createServer(app)
  initializeSocketIO(httpServer)

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
}

start().catch((err) => {
  logger.fatal({ error: String(err) }, 'failed to start server')
  process.exit(1)
})
