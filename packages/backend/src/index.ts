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
import { createRateLimiter } from './presentation/middleware/rate-limit.middleware.js'
import { Pool } from 'pg'
import gameRoutes from './presentation/routes/game.routes.js'
import leaderboardRoutes from './presentation/routes/leaderboard.routes.js'
import adminRoutes from './presentation/routes/admin.routes.js'
import userRoutes from './presentation/routes/user.routes.js'
import achievementRoutes from './presentation/routes/achievement.routes.js'
import dailyLoginRoutes from './presentation/routes/daily-login.routes.js'
import referralRoutes from './presentation/routes/referral.routes.js'
import ogRoutes from './presentation/routes/og.routes.js'
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

// Trust the first proxy hop (Traefik in production, Vite proxy in dev)
// so `req.ip` reflects the real client address for rate limiting.
app.set('trust proxy', 1)

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
app.use('/api/daily-login', dailyLoginRoutes)
app.use('/api/inventory', dailyLoginRoutes)
app.use('/api/referral', referralRoutes)
app.use('/api/og', ogRoutes)

// Serve frontend static files (after API routes)
const frontendPath = path.resolve(__dirname, '..', '..', '..', 'packages', 'frontend', 'dist')
app.use(express.static(frontendPath))

// Share routes: serve index.html with per-challenge OG meta tags injected so
// link previews are unique per shared day (defeats static-logo preview caching).
function buildShareMeta(req: express.Request): { title: string; description: string; imageUrl: string; pageUrl: string } {
  const dateParam = typeof req.query.date === 'string' ? req.query.date : ''
  const isoMatch = /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
  const date = isoMatch ? dateParam : new Date().toISOString().split('T')[0]!
  const lang = (req.params.lang === 'en' ? 'en' : 'fr')
  const locale = lang === 'en' ? 'en-US' : 'fr-FR'
  const readable = new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  })
  const title = lang === 'en'
    ? `The Box — ${readable} challenge`
    : `The Box — défi du ${readable}`
  const description = lang === 'en'
    ? 'Can you beat my score on today\u2019s screenshot challenge?'
    : 'Arriveras-tu \u00e0 battre mon score sur le d\u00e9fi du jour ?'
  const base = env.API_URL.replace(/\/$/, '')
  const imageUrl = `${base}/api/og/daily.svg?date=${encodeURIComponent(date)}&lang=${lang}`
  const pageUrl = `${base}/share/daily?date=${encodeURIComponent(date)}&lang=${lang}`
  return { title, description, imageUrl, pageUrl }
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

app.get('/share/daily', (req, res, next) => {
  try {
    const meta = buildShareMeta(req)
    const html = fs.readFileSync(path.join(frontendPath, 'index.html'), 'utf-8')
    const patched = html
      .replace(/(<meta property="og:title"[^>]*content=")[^"]*(")/, `$1${escapeHtmlAttr(meta.title)}$2`)
      .replace(/(<meta property="og:description"[^>]*content=")[^"]*(")/, `$1${escapeHtmlAttr(meta.description)}$2`)
      .replace(/(<meta property="og:image"[^>]*content=")[^"]*(")/, `$1${escapeHtmlAttr(meta.imageUrl)}$2`)
      .replace(/(<meta property="og:url"[^>]*content=")[^"]*(")/, `$1${escapeHtmlAttr(meta.pageUrl)}$2`)
      .replace(/(<meta name="twitter:title"[^>]*content=")[^"]*(")/, `$1${escapeHtmlAttr(meta.title)}$2`)
      .replace(/(<meta name="twitter:description"[^>]*content=")[^"]*(")/, `$1${escapeHtmlAttr(meta.description)}$2`)
      .replace(/(<meta name="twitter:image"[^>]*content=")[^"]*(")/, `$1${escapeHtmlAttr(meta.imageUrl)}$2`)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=600')
    res.send(patched)
  } catch (error) {
    logger.warn({ error: String(error) }, 'share meta injection failed, falling back to SPA')
    next()
  }
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
    // Clean up deprecated and stale recurring jobs
    // Also remove active recurring jobs so they can be re-added with correct timezone config
    const deprecatedJobs = [
      'sync-new-games',
      // Tournament feature was removed
      'create-weekly-tournament',
      'create-monthly-tournament',
      'end-weekly-tournament',
      'end-monthly-tournament',
      'send-tournament-reminders',
    ]
    const activeRecurringJobs = [
      'create-daily-challenge',
      'sync-all-games',
      'cleanup-anonymous-users',
      'recalculate-scores',
      'streak-risk-email',
      'relance-email',
    ]
    try {
      const repeatableJobs = await importQueue.getRepeatableJobs()
      for (const job of repeatableJobs) {
        if (deprecatedJobs.includes(job.name)) {
          await importQueue.removeRepeatableByKey(job.key)
          logger.info({ jobName: job.name }, 'removed deprecated recurring job')
        } else if (activeRecurringJobs.includes(job.name)) {
          // Remove active jobs so they can be re-added with updated config (e.g., timezone)
          await importQueue.removeRepeatableByKey(job.key)
          logger.debug({ jobName: job.name }, 'removed recurring job for re-registration')
        }
      }
    } catch (error) {
      logger.warn({ error: String(error) }, 'failed to clean up recurring jobs')
    }

    // Schedule recurring daily challenge creation (midnight UTC)
    try {
      await importQueue.add(
        'create-daily-challenge',
        {},
        {
          repeat: { pattern: '0 0 * * *', tz: 'UTC' }, // Cron: midnight UTC daily
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
          repeat: { pattern: '0 2 * * 0', tz: 'UTC' }, // Cron: 2 AM UTC every Sunday
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
          repeat: { pattern: '0 1 * * *', tz: 'UTC' }, // Cron: 1 AM UTC daily
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
          repeat: { pattern: '0 3 * * *', tz: 'UTC' }, // Cron: 3 AM UTC daily
          jobId: 'recalculate-scores-recurring',
        }
      )
      logger.info('scheduled recurring recalculate-scores job (daily at 3 AM UTC)')
    } catch (error) {
      logger.warn({ error: String(error) }, 'failed to schedule recurring recalculate-scores job')
    }

    // Schedule recurring streak-risk win-back email (daily at 19:00 UTC ~ evening Europe)
    // Runs in the window where users can still salvage their streak before midnight UTC.
    try {
      await importQueue.add(
        'streak-risk-email',
        {},
        {
          repeat: { pattern: '0 19 * * *', tz: 'UTC' },
          jobId: 'streak-risk-email-recurring',
        }
      )
      logger.info('scheduled recurring streak-risk-email job (daily at 19:00 UTC)')
    } catch (error) {
      logger.warn({ error: String(error) }, 'failed to schedule recurring streak-risk-email job')
    }

    // Schedule recurring relance (re-engagement) email for users with an
    // unclaimed daily reward (daily at 17:00 UTC ~ early evening Europe).
    // Runs two hours before the streak-risk job and the worker's eligibility
    // query enforces mutual exclusion so the same user never gets both
    // marketing emails inside a single calendar day.
    try {
      await importQueue.add(
        'relance-email',
        {},
        {
          repeat: { pattern: env.RELANCE_EMAIL_CRON, tz: 'UTC' },
          jobId: 'relance-email-recurring',
        }
      )
      logger.info({ pattern: env.RELANCE_EMAIL_CRON }, 'scheduled recurring relance-email job')
    } catch (error) {
      logger.warn({ error: String(error) }, 'failed to schedule recurring relance-email job')
    }

    // Log final repeatable jobs configuration with next run times
    try {
      const repeatableJobs = await importQueue.getRepeatableJobs()
      logger.info({
        repeatableJobs: repeatableJobs.map(j => ({
          name: j.name,
          pattern: j.pattern,
          tz: j.tz,
          next: j.next ? new Date(j.next).toISOString() : null,
        }))
      }, 'repeatable jobs scheduled')
    } catch (error) {
      logger.warn({ error: String(error) }, 'failed to log repeatable jobs state')
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
