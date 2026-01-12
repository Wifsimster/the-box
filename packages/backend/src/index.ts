import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { createServer } from 'http'
import { toNodeHandler } from 'better-auth/node'
import { env, validateEnv } from './config/env.js'
import { testConnection, runMigrations } from './infrastructure/database/connection.js'
import { initializeSocket } from './infrastructure/socket/socket.js'
import { auth } from './infrastructure/auth/auth.js'
import { logger } from './infrastructure/logger/logger.js'
import { requestLogger } from './presentation/middleware/request-logger.middleware.js'
import gameRoutes from './presentation/routes/game.routes.js'
import leaderboardRoutes from './presentation/routes/leaderboard.routes.js'
import adminRoutes from './presentation/routes/admin.routes.js'
import userRoutes from './presentation/routes/user.routes.js'
import { setSocketInstance } from './infrastructure/queue/workers/import.worker.js'
import { testRedisConnection } from './infrastructure/queue/connection.js'
import { importQueue } from './infrastructure/queue/queues.js'

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
const httpServer = createServer(app)

// Initialize Socket.io
export const io = initializeSocket(httpServer)

// Set socket instance for job worker
setSocketInstance(io)

// CORS middleware
app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
}))

// Mount better-auth handler BEFORE express.json()
// This handles all /api/auth/* routes automatically
app.all('/api/auth/*splat', toNodeHandler(auth))

// JSON parsing middleware (after better-auth)
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

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
    try {
      const repeatableJobs = await importQueue.getRepeatableJobs()
      for (const job of repeatableJobs) {
        if (job.name === 'sync-new-games') {
          await importQueue.removeRepeatableByKey(job.key)
          logger.info('removed deprecated sync-new-games recurring job')
        }
      }
    } catch (error) {
      logger.warn({ error: String(error) }, 'failed to clean up deprecated recurring jobs')
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
  }

  httpServer.listen(env.PORT, () => {
    logger.info(
      {
        port: env.PORT,
        env: env.NODE_ENV,
        corsOrigin: env.CORS_ORIGIN,
        logLevel: env.LOG_LEVEL,
      },
      'server started'
    )
  })
}

start().catch((err) => {
  logger.fatal({ error: String(err) }, 'failed to start server')
  process.exit(1)
})
