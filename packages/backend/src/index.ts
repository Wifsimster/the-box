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
import geoFetchRoutes from './presentation/routes/geo-fetch.routes.js'
import userRoutes from './presentation/routes/user.routes.js'
import achievementRoutes from './presentation/routes/achievement.routes.js'
import dailyLoginRoutes from './presentation/routes/daily-login.routes.js'
import rewardsRoutes from './presentation/routes/rewards.routes.js'
import referralRoutes from './presentation/routes/referral.routes.js'
import ogRoutes, { parseGeoRunScores } from './presentation/routes/og.routes.js'
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
import { testRedisConnection, tryAcquireBootLock } from './infrastructure/queue/connection.js'
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
import { pushService } from './domain/services/index.js'
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

// Lightweight liveness check. Always 200 so an orchestrator knows the
// process is up; downstream dependency status lives on /healthz.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Readiness check. Probes the dependencies the app actually needs to serve
// requests (Postgres, Redis) and reports the optional capability flags
// (web push, email) so dashboards can alert on a misconfigured environment
// instead of waiting for the first user to hit a 503.
app.get('/healthz', async (_req, res) => {
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
  const imageUrl = `${base}/api/og/daily.png?date=${encodeURIComponent(date)}&lang=${lang}`
  const pageUrl = `${base}/share/daily?date=${encodeURIComponent(date)}&lang=${lang}`
  return { title, description, imageUrl, pageUrl }
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Serve the SPA shell with the given OG/Twitter meta patched in — link
// preview bots don't run JS, so the tags must be in the raw HTML.
function serveShareShell(
  res: express.Response,
  next: express.NextFunction,
  meta: { title: string; description: string; imageUrl: string; pageUrl: string },
): void {
  try {
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
}

app.get('/share/daily', (req, res, next) => {
  serveShareShell(res, next, buildShareMeta(req))
})

// Geo free-play run recap share. Scores travel in the URL (runs are
// client-side only — nothing is stored server-side), the OG image is
// derived from the same query by /api/og/geo-run.png.
app.get('/share/geo-run', (req, res, next) => {
  const scores = parseGeoRunScores(req.query.scores)
  if (!scores) {
    // Malformed link: fall through to the SPA shell with default meta
    // rather than 400ing a human click.
    next()
    return
  }
  const lang = req.query.lang === 'en' ? 'en' : 'fr'
  const total = scores.reduce((sum, s) => sum + s, 0)
  const max = scores.length * 2000
  const locale = lang === 'en' ? 'en-US' : 'fr-FR'
  const totalText = `${total.toLocaleString(locale)} / ${max.toLocaleString(locale)}`
  const base = env.API_URL.replace(/\/$/, '')
  const query = `scores=${encodeURIComponent(scores.join(','))}&lang=${lang}`
  serveShareShell(res, next, {
    title: lang === 'en' ? `The Box — Geo run: ${totalText}` : `The Box — Run Géo : ${totalText}`,
    description:
      lang === 'en'
        ? `Can you beat my ${scores.length}-round screenshot-location run?`
        : `Peux-tu battre mon run de ${scores.length} captures à localiser ?`,
    imageUrl: `${base}/api/og/geo-run.png?${query}`,
    pageUrl: `${base}/share/geo-run?${query}`,
  })
})

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
      'evening-nudge',
      'relance-email',
      'inactive-user-reminder',
      'streak-freeze-grant',
      'reactivation-scan',
      'milestone-account-age',
      'leaderboard-payout-monthly',
      'prune-push-subscriptions',
    ]
    // Recurring-job re-registration runs at most once per rolling
    // deploy. Without this lock, two containers can interleave their
    // remove/add and leave the queue with either zero or two of a
    // recurring job. 60s is comfortably longer than the slowest
    // re-registration loop in this section. Containers that don't
    // hold the lock skip the entire schedule block below; the cron
    // that the registrar wrote will fire for everyone via Redis.
    const hasRecurringRegistrar = await tryAcquireBootLock('recurring-jobs', 60)
    if (!hasRecurringRegistrar) {
      logger.info('another container holds the recurring-job lock; skipping re-registration')
    }
    if (hasRecurringRegistrar) {
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
    }
    // Re-add block below is also gated on the lock. We use an early
    // skip-style label rather than wrapping every `importQueue.add`
    // because the existing code is one long sequence of independent
    // try/catch blocks.
    if (hasRecurringRegistrar) {

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

    // Schedule recurring GeoGamers challenge creation (00:05 UTC, just after
    // the classic daily job to spread load). Only when the feature is enabled.
    if (env.GEOGAMERS_ENABLED === 'true') {
      try {
        await importQueue.add(
          'create-geogamers-challenge',
          {},
          {
            repeat: { pattern: '5 0 * * *', tz: 'UTC' }, // Cron: 00:05 UTC daily
            jobId: 'create-geogamers-challenge-recurring',
          }
        )
        logger.info('scheduled recurring create-geogamers-challenge job (daily at 00:05 UTC)')
      } catch (error) {
        logger.warn({ error: String(error) }, 'failed to schedule recurring geogamers challenge job')
      }

      // Close the prior season on the 1st at 00:35 UTC (after the classic
      // leaderboard payout at 00:30) and grant season frames to eligible
      // top finishers. Idempotent via reward_grants.
      try {
        await importQueue.add(
          'geogamers-season-payout',
          {},
          {
            repeat: { pattern: '35 0 1 * *', tz: 'UTC' },
            jobId: 'geogamers-season-payout-recurring',
          }
        )
        logger.info('scheduled recurring geogamers-season-payout job (1st @ 00:35 UTC)')
      } catch (error) {
        logger.warn({ error: String(error) }, 'failed to schedule recurring geogamers season payout job')
      }
    }

    // Schedule recurring sync-all-games job (weekly on Sundays at 2 AM UTC)
    try {
      await importQueue.add(
        'sync-all-games',
        {
          batchSize: 100,
          minMetacritic: 70,
          screenshotsPerGame: 5,
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

    // Schedule recurring evening-nudge push (daily at 18:00 UTC ~ evening
    // Europe). Personalizes the "play today's challenge" reminder with the
    // current title holder. Runs an hour before the streak-risk email; its
    // candidate query excludes users who will get that email, so no user is
    // double-nudged. A later slot means the leader/score is more "real" while
    // still leaving a comfortable window before the midnight UTC reset.
    try {
      await importQueue.add(
        'evening-nudge',
        {},
        {
          repeat: { pattern: '0 18 * * *', tz: 'UTC' },
          jobId: 'evening-nudge-recurring',
        }
      )
      logger.info('scheduled recurring evening-nudge job (daily at 18:00 UTC)')
    } catch (error) {
      logger.warn({ error: String(error) }, 'failed to schedule recurring evening-nudge job')
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

    // Schedule recurring inactive-user-reminder — long-horizon win-back for
    // users who have not played AND have not refreshed an auth session in
    // N days. Default schedule is weekly (Mondays 16:00 UTC) to avoid
    // piling reminders on already-gone users; the worker also enforces a
    // 30-day per-user cooldown internally.
    try {
      await importQueue.add(
        'inactive-user-reminder',
        {},
        {
          repeat: { pattern: env.INACTIVE_USER_REMINDER_CRON, tz: 'UTC' },
          jobId: 'inactive-user-reminder-recurring',
        }
      )
      logger.info(
        { pattern: env.INACTIVE_USER_REMINDER_CRON, days: env.INACTIVE_USER_REMINDER_DAYS },
        'scheduled recurring inactive-user-reminder job'
      )
    } catch (error) {
      logger.warn({ error: String(error) }, 'failed to schedule recurring inactive-user-reminder job')
    }

    // Daily reactivation-scan — 03:00 UTC. Targets users who have not
    // played in the last 7 days, splits 10% to a holdout cohort
    // (deterministic per user_id), stages a chest via rewardsService.grant
    // (autoUnlock=false — the chest unlocks on the user's next guess), and
    // emails BOTH cohorts a warm welcome-back. Per-user cadence is 28
    // days (enforced via a NOT EXISTS clause in the candidate query).
    // Copy follows a strict ban-list — see infrastructure/email/reactivation-email.ts.
    try {
      await importQueue.add(
        'reactivation-scan',
        {},
        {
          repeat: { pattern: '0 3 * * *', tz: 'UTC' },
          jobId: 'reactivation-scan-recurring',
        }
      )
      logger.info('scheduled recurring reactivation-scan job (daily at 03:00 UTC)')
    } catch (error) {
      logger.warn({ error: String(error) }, 'failed to schedule recurring reactivation-scan job')
    }

    // Monthly streak-freeze grant — 1st of each month at 06:00 UTC. Grants
    // 1× streak_freeze to every active user (last_played_at within 60 days)
    // who is below the per-user cap (2). Idempotent on YYYY-MM source_ref.
    // Streak freezes auto-consume in daily-login when a user misses exactly
    // one day; they are NEVER purchasable (see docs/game-flow.md).
    try {
      await importQueue.add(
        'streak-freeze-grant',
        {},
        {
          repeat: { pattern: '0 6 1 * *', tz: 'UTC' },
          jobId: 'streak-freeze-grant-recurring',
        }
      )
      logger.info('scheduled recurring streak-freeze-grant job (monthly, 1st @ 06:00 UTC)')
    } catch (error) {
      logger.warn({ error: String(error) }, 'failed to schedule recurring streak-freeze-grant job')
    }

    // Daily milestone-account-age — 04:00 UTC. Scans active users
    // (last_played_at < 60 days) old enough to have crossed the smallest
    // account-age threshold (365 d) and evaluates account-age milestones
    // for each. Per-user idempotency comes from the existing
    // user_achievements unique constraint, so re-runs are no-ops once
    // a user has earned a milestone.
    try {
      await importQueue.add(
        'milestone-account-age',
        {},
        {
          repeat: { pattern: '0 4 * * *', tz: 'UTC' },
          jobId: 'milestone-account-age-recurring',
        }
      )
      logger.info('scheduled recurring milestone-account-age job (daily at 04:00 UTC)')
    } catch (error) {
      logger.warn({ error: String(error) }, 'failed to schedule recurring milestone-account-age job')
    }

    // Daily prune of stale push subscriptions — 02:00 UTC. Hard-deletes
    // rows the fan-out worker has already deactivated (410/404 from the
    // push provider) once they've been silent for >30 days. Without this
    // the table grows monotonically with churned browsers / reinstalls.
    try {
      await importQueue.add(
        'prune-push-subscriptions',
        {},
        {
          repeat: { pattern: '0 2 * * *', tz: 'UTC' },
          jobId: 'prune-push-subscriptions-recurring',
        },
      )
      logger.info('scheduled recurring prune-push-subscriptions job (daily at 02:00 UTC)')
    } catch (error) {
      logger.warn({ error: String(error) }, 'failed to schedule recurring prune-push-subscriptions job')
    }

    // Daily data-retention sweep — 04:15 UTC. Hard-deletes personal-data
    // bearing audit / log rows past their per-table retention windows
    // (RGPD Art. 5(1)(e) storage limitation): email_log >1y,
    // admin_audit_log >2y, webhook_deliveries >30d, stripe_event_log >1y.
    try {
      await importQueue.add(
        'data-retention',
        {},
        {
          repeat: { pattern: '15 4 * * *', tz: 'UTC' },
          jobId: 'data-retention-recurring',
        },
      )
      logger.info('scheduled recurring data-retention job (daily at 04:15 UTC)')
    } catch (error) {
      logger.warn({ error: String(error) }, 'failed to schedule recurring data-retention job')
    }

    // Monthly leaderboard payout — 1st of each month at 00:30 UTC. Awards
    // a time-stamped cosmetic frame (`frame_top100_YYYY_MM`) to the top
    // 100 players of the PRIOR calendar month. Idempotent on YYYY-MM
    // source_ref via reward_grants unique constraint, so re-running the
    // cron the same day is a no-op. Per the rewards meeting (Nour's
    // recognition-tier framing): cosmetic only, never points/cash, never
    // a countdown UI on the leaderboard page.
    try {
      await importQueue.add(
        'leaderboard-payout-monthly',
        {},
        {
          repeat: { pattern: '30 0 1 * *', tz: 'UTC' },
          jobId: 'leaderboard-payout-monthly-recurring',
        }
      )
      logger.info('scheduled recurring leaderboard-payout-monthly job (1st @ 00:30 UTC)')
    } catch (error) {
      logger.warn({ error: String(error) }, 'failed to schedule recurring leaderboard-payout-monthly job')
    }

    // One-shot announcement email for the new referral feature.
    // The worker keys off `user.referral_announcement_email_sent_at`, so
    // re-enqueueing on every boot is safe — already-mailed users are
    // filtered out at the SQL level. The stable `jobId` prevents the
    // queue from holding multiple pending copies between deploys.
    try {
      await importQueue.add(
        'referral-announcement-email',
        {},
        {
          jobId: 'referral-announcement-email-oneshot',
          removeOnComplete: true,
          removeOnFail: false,
        }
      )
      logger.info('enqueued one-shot referral-announcement-email job')
    } catch (error) {
      logger.warn({ error: String(error) }, 'failed to enqueue referral-announcement-email job')
    }

    // Geo recurring jobs. Sweep stale repeatables from previous boots before
    // re-registering the metadata-resolve and ingest-tick crons below.
    try {
      const existing = await geoQueue.getRepeatableJobs()
      for (const job of existing) {
        if (
          job.name === 'schedule-daily-challenge' ||
          job.name === 'resolve-metadata' ||
          job.name === 'ingest-tick' ||
          job.name === 'backfill-tick'
        ) {
          await geoQueue.removeRepeatableByKey(job.key)
        }
      }

      // Auto-resolve metadata for curated games every 30 min: HEADs Fandom +
      // Steam storesearch and fills in steam_app_id / wiki_subdomain.
      await geoQueue.add(
        'resolve-metadata',
        { kind: 'resolve-metadata' },
        {
          repeat: { every: 30 * 60 * 1000 },
          jobId: 'geo-resolve-metadata-recurring',
        }
      )
      logger.info('scheduled recurring resolve-metadata geo job (every 30 min)')

      // Ingest tick every 15 min: enqueues per-game fandom/steam imports
      // for curated games that are missing maps or low on candidates.
      await geoQueue.add(
        'ingest-tick',
        { kind: 'ingest-tick' },
        {
          repeat: { every: 15 * 60 * 1000 },
          jobId: 'geo-ingest-tick-recurring',
        }
      )
      logger.info('scheduled recurring ingest-tick geo job (every 15 min)')

      // Backfill discovery every 30 min (issue #331, phase 6). Off by default —
      // the stale-sweep above still removes it if it was previously registered
      // and the flag was since turned off. Unlike ingest-tick (which tops up
      // every resolved game), this concentrates on sub-threshold games ranked
      // by distance-to-eligibility so effort moves the eligible-count needle.
      if (env.GEO_BACKFILL_ENABLED === 'true') {
        const backfillBatch = Number(env.GEO_BACKFILL_BATCH) || 10
        await geoQueue.add(
          'backfill-tick',
          { kind: 'backfill-tick', batchSize: backfillBatch },
          {
            repeat: { every: 30 * 60 * 1000 },
            jobId: 'geo-backfill-tick-recurring',
          }
        )
        logger.info(
          { batchSize: backfillBatch },
          'scheduled recurring backfill-tick geo job (every 30 min)',
        )
      }
    } catch (error) {
      logger.warn({ error: String(error) }, 'failed to register recurring geo jobs')
    }
    } // end if (hasRecurringRegistrar) — registration block

    // Log final repeatable jobs configuration with next run times
    try {
      const repeatableJobs = await importQueue.getRepeatableJobs()
      const geoRepeatableJobs = await geoQueue.getRepeatableJobs()
      logger.info({
        repeatableJobs: [...repeatableJobs, ...geoRepeatableJobs].map(j => ({
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
