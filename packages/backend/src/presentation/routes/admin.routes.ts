import { Router } from 'express'
import { z } from 'zod'
import { adminService, jobService } from '../../domain/services/index.js'
import { adminMiddleware } from '../middleware/auth.middleware.js'
import {
  startBatchImport,
  pauseImport,
  resumeImport,
  getActiveImport,
  getImportState,
} from '../../infrastructure/queue/workers/batch-import-logic.js'
import {
  startSyncAll,
  pauseSyncAll,
  resumeSyncAll,
  cancelSyncAll,
  getActiveSyncAll,
  getSyncAllState,
} from '../../infrastructure/queue/workers/sync-all-logic.js'
import {
  startRecalculateScores,
  pauseRecalculateScores,
  resumeRecalculateScores,
  getActiveRecalculateScores,
  getRecalculateScoresState,
} from '../../infrastructure/queue/workers/recalculate-scores-logic.js'
import {
  startTopupScreenshots,
  pauseTopupScreenshots,
  resumeTopupScreenshots,
  cancelTopupScreenshots,
  getActiveTopupScreenshots,
  getTopupScreenshotsState,
} from '../../infrastructure/queue/workers/topup-screenshots-logic.js'
import { resend } from '../../infrastructure/auth/auth.js'
import { env } from '../../config/env.js'
import { db } from '../../infrastructure/database/connection.js'
import { routeLogger } from '../../infrastructure/logger/logger.js'
import { createRateLimiter } from '../middleware/rate-limit.middleware.js'
import {
  geoScreenshotRepository,
  geoPinRepository,
  geoMapRepository,
  geoIngestFailureRepository,
  screenshotReportRepository,
  emailLogRepository,
} from '../../infrastructure/repositories/index.js'
import { GEO_CONSENSUS_VERSION } from '../../domain/services/index.js'
import { isMapEligibleByGenre } from '../../domain/services/geo-metadata.service.js'
import { geoQueue, type GeoJobData } from '../../infrastructure/queue/queues.js'
import { findRegistryEntryBySlug } from '../../infrastructure/queue/workers/geo-registry-import-logic.js'

// Cap even admin-triggered sends so a mistake or compromised admin
// account can't spray mail on Resend's dime. Keyed by user id so two
// admins don't starve each other out.
const testEmailLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 10,
  key: (req) => req.userId ?? req.ip ?? 'unknown',
})

const router = Router()

// All admin routes require authentication
router.use(adminMiddleware)

// === Games ===

// List all games with pagination and search
router.get('/games', async (req, res, next) => {
  try {
    const page = parseInt(req.query['page'] as string) || 1
    const limit = parseInt(req.query['limit'] as string) || 10
    const search = req.query['search'] as string | undefined
    const sortBy = (req.query['sortBy'] as string) || 'name'
    const sortOrder = (req.query['sortOrder'] as 'asc' | 'desc') || 'asc'

    const result = await adminService.getGamesPaginated({
      page,
      limit,
      search,
      sortBy,
      sortOrder,
    })

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    next(error)
  }
})

// Add a game
const createGameSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  aliases: z.array(z.string()).optional(),
  releaseYear: z.number().optional(),
  developer: z.string().optional(),
  publisher: z.string().optional(),
  genres: z.array(z.string()).optional(),
  platforms: z.array(z.string()).optional(),
  coverImageUrl: z.string().url().optional(),
})

router.post('/games', async (req, res, next) => {
  try {
    const data = createGameSchema.parse(req.body)
    const game = await adminService.createGame(data)

    res.status(201).json({
      success: true,
      data: { game },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.issues[0]?.message },
      })
      return
    }
    next(error)
  }
})

// Update a game
router.put('/games/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params['id']!, 10)
    const data = createGameSchema.partial().parse(req.body)
    const game = await adminService.updateGame(id, data)

    if (!game) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Game not found' },
      })
      return
    }

    res.json({
      success: true,
      data: { game },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.issues[0]?.message },
      })
      return
    }
    next(error)
  }
})

// Delete a game
router.delete('/games/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params['id']!, 10)
    await adminService.deleteGame(id)

    res.json({
      success: true,
      data: { deleted: true },
    })
  } catch (error) {
    next(error)
  }
})

// Sync a game from RAWG API
router.post('/games/:id/sync-rawg', async (req, res, next) => {
  try {
    const id = parseInt(req.params['id']!, 10)
    const game = await adminService.syncGameFromRawg(id)

    if (!game) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Game not found' },
      })
      return
    }

    res.json({
      success: true,
      data: { game },
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found on RAWG')) {
      res.status(404).json({
        success: false,
        error: { code: 'RAWG_NOT_FOUND', message: error.message },
      })
      return
    }
    next(error)
  }
})

// Get screenshots for a game
router.get('/games/:id/screenshots', async (req, res, next) => {
  try {
    const id = parseInt(req.params['id']!, 10)
    const screenshots = await adminService.getScreenshotsByGameId(id)

    res.json({
      success: true,
      data: { screenshots },
    })
  } catch (error) {
    next(error)
  }
})

// === Screenshots ===

// List all screenshots
router.get('/screenshots', async (_req, res, next) => {
  try {
    const screenshots = await adminService.getAllScreenshots()

    res.json({
      success: true,
      data: { screenshots },
    })
  } catch (error) {
    next(error)
  }
})

// Add a screenshot
const createScreenshotSchema = z.object({
  gameId: z.number(),
  imageUrl: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  difficulty: z.number().min(1).max(3).default(2),
  haov: z.number().default(180),
  vaov: z.number().default(90),
  locationHint: z.string().optional(),
})

router.post('/screenshots', async (req, res, next) => {
  try {
    const data = createScreenshotSchema.parse(req.body)
    const screenshot = await adminService.createScreenshot(data)

    res.status(201).json({
      success: true,
      data: { screenshot },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.issues[0]?.message },
      })
      return
    }
    next(error)
  }
})

// === Challenges ===

// List all challenges
router.get('/challenges', async (_req, res, next) => {
  try {
    const challenges = await adminService.getAllChallenges()

    res.json({
      success: true,
      data: { challenges },
    })
  } catch (error) {
    next(error)
  }
})

// Create a challenge
const createChallengeSchema = z.object({
  challengeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  screenshotIds: z.array(z.number()).length(10),
})

router.post('/challenges', async (req, res, next) => {
  try {
    const data = createChallengeSchema.parse(req.body)
    const result = await adminService.createChallenge(data)

    res.status(201).json({
      success: true,
      data: result,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.issues[0]?.message },
      })
      return
    }
    next(error)
  }
})

// Reroll a daily challenge's screenshots
const rerollChallengeSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  minMetacritic: z.number().min(70).max(100).optional(),
})

router.post('/challenges/reroll', async (req, res, next) => {
  try {
    const { date, minMetacritic } = rerollChallengeSchema.parse(req.body)
    const result = await adminService.rerollDailyChallenge(date, minMetacritic)

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.issues[0]?.message },
      })
      return
    }
    if (error instanceof Error) {
      if (error.message.includes('No challenge found') || error.message.includes('No tier found')) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        })
        return
      }
      if (error.message.includes('Not enough available screenshots')) {
        res.status(400).json({
          success: false,
          error: { code: 'INSUFFICIENT_SCREENSHOTS', message: error.message },
        })
        return
      }
    }
    next(error)
  }
})

// Reset admin's own daily session (allows replaying the challenge)
const resetSessionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

router.post('/challenges/reset-session', async (req, res, next) => {
  try {
    const { date } = resetSessionSchema.parse(req.body)
    const userId = req.user!.id
    const result = await adminService.resetMyDailySession(userId, date)

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.issues[0]?.message },
      })
      return
    }
    if (error instanceof Error && error.message.includes('No challenge found')) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      })
      return
    }
    next(error)
  }
})

// === Jobs ===

// List all jobs
router.get('/jobs', async (_req, res, next) => {
  try {
    const jobs = await jobService.listJobs()

    res.json({
      success: true,
      data: { jobs, total: jobs.length },
    })
  } catch (error) {
    next(error)
  }
})

// Get job stats
router.get('/jobs/stats', async (_req, res, next) => {
  try {
    const stats = await jobService.getQueueStats()

    res.json({
      success: true,
      data: { stats },
    })
  } catch (error) {
    next(error)
  }
})

// Get recurring jobs info (scheduled jobs)
router.get('/jobs/recurring', async (_req, res, next) => {
  try {
    const recurringJobs = await jobService.getRecurringJobs()

    res.json({
      success: true,
      data: { recurringJobs },
    })
  } catch (error) {
    next(error)
  }
})

// Get specific job
router.get('/jobs/:id', async (req, res, next) => {
  try {
    const job = await jobService.getJob(req.params['id']!)

    if (!job) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Job not found' },
      })
      return
    }

    res.json({
      success: true,
      data: { job },
    })
  } catch (error) {
    next(error)
  }
})

// Create import job
const createJobSchema = z.object({
  type: z.enum(['import-games', 'import-screenshots', 'create-daily-challenge']),
  data: z
    .object({
      targetGames: z.number().min(1).max(1000).optional(),
      screenshotsPerGame: z.number().min(1).max(10).optional(),
      minMetacritic: z.number().min(0).max(100).optional(),
    })
    .optional(),
})

router.post('/jobs', async (req, res, next) => {
  try {
    const { type, data } = createJobSchema.parse(req.body)
    const job = await jobService.createJob(type, data)

    res.status(201).json({
      success: true,
      data: { job },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.issues[0]?.message },
      })
      return
    }
    next(error)
  }
})

// Clear completed jobs (must be before /jobs/:id to avoid matching "completed" as an id)
router.delete('/jobs/completed', async (_req, res, next) => {
  try {
    const count = await jobService.clearCompleted()

    res.json({
      success: true,
      data: { cleared: count },
    })
  } catch (error) {
    next(error)
  }
})

// Remove recurring job (must be before /jobs/:id to handle repeat: prefix)
router.delete('/jobs/repeat\\::key', async (req, res, next) => {
  try {
    const key = `repeat:${req.params[':key']!}`
    const removed = await jobService.removeRecurringJob(key)

    if (!removed) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Recurring job not found or could not be removed' },
      })
      return
    }

    res.json({
      success: true,
      data: { removed: true },
    })
  } catch (error) {
    next(error)
  }
})

// Cancel a job
router.delete('/jobs/:id', async (req, res, next) => {
  try {
    const cancelled = await jobService.cancelJob(req.params['id']!)

    if (!cancelled) {
      res.status(400).json({
        success: false,
        error: { code: 'CANNOT_CANCEL', message: 'Job cannot be cancelled in current state' },
      })
      return
    }

    res.json({
      success: true,
      data: { cancelled: true },
    })
  } catch (error) {
    next(error)
  }
})

// Shortcut: Start import-games job
router.post('/jobs/import-games', async (req, res, next) => {
  try {
    const data = {
      targetGames: req.body?.targetGames || 200,
      screenshotsPerGame: req.body?.screenshotsPerGame || 5,
      minMetacritic: req.body?.minMetacritic ?? 70,
    }
    const job = await jobService.createJob('import-games', data)

    res.status(201).json({
      success: true,
      data: { job },
    })
  } catch (error) {
    next(error)
  }
})

// Shortcut: Start import-screenshots job
router.post('/jobs/import-screenshots', async (_req, res, next) => {
  try {
    const job = await jobService.createJob('import-screenshots', {})

    res.status(201).json({
      success: true,
      data: { job },
    })
  } catch (error) {
    next(error)
  }
})

// Shortcut: Start create-daily-challenge job
router.post('/jobs/create-daily-challenge', async (_req, res, next) => {
  try {
    const job = await jobService.createJob('create-daily-challenge', {})

    res.status(201).json({
      success: true,
      data: { job },
    })
  } catch (error) {
    next(error)
  }
})

// Shortcut: Start cleanup-anonymous-users job
router.post('/jobs/cleanup-anonymous-users', async (_req, res, next) => {
  try {
    const job = await jobService.createJob('cleanup-anonymous-users', {})

    res.status(201).json({
      success: true,
      data: { job },
    })
  } catch (error) {
    next(error)
  }
})

// Shortcut: Start clear-daily-data job
router.post('/jobs/clear-daily-data', async (_req, res, next) => {
  try {
    const job = await jobService.createJob('clear-daily-data', {})

    res.status(201).json({
      success: true,
      data: { job },
    })
  } catch (error) {
    next(error)
  }
})

// Manual trigger: Import games
router.post('/jobs/import-games/trigger', async (req, res, next) => {
  try {
    const data = {
      targetGames: req.body?.targetGames || 50,
      screenshotsPerGame: req.body?.screenshotsPerGame || 5,
      minMetacritic: req.body?.minMetacritic ?? 70,
    }
    const job = await jobService.createJob('import-games', data)

    res.status(201).json({
      success: true,
      data: { job },
    })
  } catch (error) {
    next(error)
  }
})

// Manual trigger: Import screenshots
router.post('/jobs/import-screenshots/trigger', async (_req, res, next) => {
  try {
    const job = await jobService.createJob('import-screenshots', {})

    res.status(201).json({
      success: true,
      data: { job },
    })
  } catch (error) {
    next(error)
  }
})

// === Full Import (Batch Processing) ===

// Start a new full import
const startFullImportSchema = z.object({
  batchSize: z.number().min(10).max(500).default(100),
  screenshotsPerGame: z.number().min(1).max(10).default(5),
  minMetacritic: z.number().min(0).max(100).default(70),
})

router.post('/jobs/full-import/start', async (req, res, next) => {
  try {
    // Check if there's already an active import
    const activeImport = await getActiveImport()
    if (activeImport) {
      res.status(409).json({
        success: false,
        error: { code: 'IMPORT_IN_PROGRESS', message: 'An import is already in progress or paused' },
        data: { importState: activeImport },
      })
      return
    }

    const config = startFullImportSchema.parse(req.body)
    const { importState, job } = await startBatchImport(config)

    res.status(201).json({
      success: true,
      data: { importState, job: { id: job.id, name: job.name } },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.issues[0]?.message },
      })
      return
    }
    next(error)
  }
})

// Get current active import state
router.get('/jobs/full-import/current', async (_req, res, next) => {
  try {
    const importState = await getActiveImport()

    res.json({
      success: true,
      data: { importState }, // null if no active import
    })
  } catch (error) {
    next(error)
  }
})

// Get import state by ID
router.get('/jobs/full-import/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params['id']!, 10)
    const importState = await getImportState(id)

    if (!importState) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Import state not found' },
      })
      return
    }

    res.json({
      success: true,
      data: { importState },
    })
  } catch (error) {
    next(error)
  }
})

// Pause an ongoing import
router.post('/jobs/full-import/:id/pause', async (req, res, next) => {
  try {
    const id = parseInt(req.params['id']!, 10)
    const importState = await pauseImport(id)

    res.json({
      success: true,
      data: { importState },
    })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        })
        return
      }
      if (error.message.includes('Cannot pause')) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_STATE', message: error.message },
        })
        return
      }
    }
    next(error)
  }
})

// Resume a paused import
router.post('/jobs/full-import/:id/resume', async (req, res, next) => {
  try {
    const id = parseInt(req.params['id']!, 10)
    const { importState, job } = await resumeImport(id)

    res.json({
      success: true,
      data: { importState, job: { id: job.id, name: job.name } },
    })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        })
        return
      }
      if (error.message.includes('Cannot resume')) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_STATE', message: error.message },
        })
        return
      }
    }
    next(error)
  }
})

// === Sync All Games (Find missing + Update existing) ===

// Start a new sync-all job
const startSyncAllSchema = z.object({
  batchSize: z.number().min(10).max(500).default(100),
  screenshotsPerGame: z.number().min(1).max(10).default(5),
  minMetacritic: z.number().min(0).max(100).default(70),
  updateExistingMetadata: z.boolean().default(true),
})

router.post('/jobs/sync-all/start', async (req, res, next) => {
  try {
    // Check if there's already an active sync
    const activeSyncAll = await getActiveSyncAll()
    if (activeSyncAll) {
      res.status(409).json({
        success: false,
        error: { code: 'SYNC_IN_PROGRESS', message: 'A sync-all job is already in progress or paused' },
        data: { syncState: activeSyncAll },
      })
      return
    }

    const config = startSyncAllSchema.parse(req.body)
    const { syncState, job } = await startSyncAll(config)

    res.status(201).json({
      success: true,
      data: { syncState, job: { id: job.id, name: job.name } },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.issues[0]?.message },
      })
      return
    }
    next(error)
  }
})

// Get current active sync-all state
router.get('/jobs/sync-all/current', async (_req, res, next) => {
  try {
    const syncState = await getActiveSyncAll()

    res.json({
      success: true,
      data: { syncState }, // null if no active sync
    })
  } catch (error) {
    next(error)
  }
})

// Get sync-all state by ID
router.get('/jobs/sync-all/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params['id']!, 10)
    const syncState = await getSyncAllState(id)

    if (!syncState) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Sync state not found' },
      })
      return
    }

    res.json({
      success: true,
      data: { syncState },
    })
  } catch (error) {
    next(error)
  }
})

// Pause an ongoing sync-all
router.post('/jobs/sync-all/:id/pause', async (req, res, next) => {
  try {
    const id = parseInt(req.params['id']!, 10)
    const syncState = await pauseSyncAll(id)

    res.json({
      success: true,
      data: { syncState },
    })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        })
        return
      }
      if (error.message.includes('Cannot pause')) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_STATE', message: error.message },
        })
        return
      }
    }
    next(error)
  }
})

// Resume a paused sync-all
router.post('/jobs/sync-all/:id/resume', async (req, res, next) => {
  try {
    const id = parseInt(req.params['id']!, 10)
    const { syncState, job } = await resumeSyncAll(id)

    res.json({
      success: true,
      data: { syncState, job: { id: job.id, name: job.name } },
    })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        })
        return
      }
      if (error.message.includes('Cannot resume')) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_STATE', message: error.message },
        })
        return
      }
    }
    next(error)
  }
})

// Cancel a sync-all (marks as failed so a new one can be started)
router.post('/jobs/sync-all/:id/cancel', async (req, res, next) => {
  try {
    const id = parseInt(req.params['id']!, 10)
    const syncState = await cancelSyncAll(id)

    res.json({
      success: true,
      data: { syncState },
    })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        })
        return
      }
      if (error.message.includes('Cannot cancel')) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_STATE', message: error.message },
        })
        return
      }
    }
    next(error)
  }
})

// === Recalculate Scores ===

// Start a new score recalculation job
const startRecalculateScoresSchema = z.object({
  batchSize: z.number().min(10).max(1000).default(100),
  dryRun: z.boolean().default(false),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
})

router.post('/jobs/recalculate-scores/start', async (req, res, next) => {
  try {
    // Check if there's already an active recalculation
    const activeRecalculate = await getActiveRecalculateScores()
    if (activeRecalculate) {
      res.status(409).json({
        success: false,
        error: { code: 'RECALCULATE_IN_PROGRESS', message: 'A score recalculation is already in progress or paused' },
        data: { recalculateState: activeRecalculate },
      })
      return
    }

    const config = startRecalculateScoresSchema.parse(req.body)
    const { recalculateState, job } = await startRecalculateScores(config)

    res.status(201).json({
      success: true,
      data: { recalculateState, job: { id: job.id, name: job.name } },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.issues[0]?.message },
      })
      return
    }
    next(error)
  }
})

// Get current active recalculation state
router.get('/jobs/recalculate-scores/current', async (_req, res, next) => {
  try {
    const recalculateState = await getActiveRecalculateScores()

    res.json({
      success: true,
      data: { recalculateState }, // null if no active recalculation
    })
  } catch (error) {
    next(error)
  }
})

// Get recalculation state by ID
router.get('/jobs/recalculate-scores/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params['id']!, 10)
    const recalculateState = await getRecalculateScoresState(id)

    if (!recalculateState) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Recalculation state not found' },
      })
      return
    }

    res.json({
      success: true,
      data: { recalculateState },
    })
  } catch (error) {
    next(error)
  }
})

// Pause an ongoing recalculation
router.post('/jobs/recalculate-scores/:id/pause', async (req, res, next) => {
  try {
    const id = parseInt(req.params['id']!, 10)
    const recalculateState = await pauseRecalculateScores(id)

    res.json({
      success: true,
      data: { recalculateState },
    })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        })
        return
      }
      if (error.message.includes('Cannot pause')) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_STATE', message: error.message },
        })
        return
      }
    }
    next(error)
  }
})

// Resume a paused recalculation
router.post('/jobs/recalculate-scores/:id/resume', async (req, res, next) => {
  try {
    const id = parseInt(req.params['id']!, 10)
    const { recalculateState, job } = await resumeRecalculateScores(id)

    res.json({
      success: true,
      data: { recalculateState, job: { id: job.id, name: job.name } },
    })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        })
        return
      }
      if (error.message.includes('Cannot resume')) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_STATE', message: error.message },
        })
        return
      }
    }
    next(error)
  }
})

// === Top-Up Screenshots (Backfill existing games) ===

const startTopupScreenshotsSchema = z.object({
  batchSize: z.number().min(10).max(500).default(50),
  targetScreenshotsPerGame: z.number().min(1).max(10).default(5),
})

router.post('/jobs/topup-screenshots/start', async (req, res, next) => {
  try {
    const active = await getActiveTopupScreenshots()
    if (active) {
      res.status(409).json({
        success: false,
        error: { code: 'TOPUP_IN_PROGRESS', message: 'A topup-screenshots job is already in progress or paused' },
        data: { topupState: active },
      })
      return
    }

    const config = startTopupScreenshotsSchema.parse(req.body)
    const { topupState, job } = await startTopupScreenshots(config)

    res.status(201).json({
      success: true,
      data: { topupState, job: { id: job.id, name: job.name } },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.issues[0]?.message },
      })
      return
    }
    next(error)
  }
})

router.get('/jobs/topup-screenshots/current', async (_req, res, next) => {
  try {
    const topupState = await getActiveTopupScreenshots()
    res.json({ success: true, data: { topupState } })
  } catch (error) {
    next(error)
  }
})

router.get('/jobs/topup-screenshots/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params['id']!, 10)
    const topupState = await getTopupScreenshotsState(id)

    if (!topupState) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Topup state not found' },
      })
      return
    }

    res.json({ success: true, data: { topupState } })
  } catch (error) {
    next(error)
  }
})

router.post('/jobs/topup-screenshots/:id/pause', async (req, res, next) => {
  try {
    const id = parseInt(req.params['id']!, 10)
    const topupState = await pauseTopupScreenshots(id)
    res.json({ success: true, data: { topupState } })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: error.message } })
        return
      }
      if (error.message.includes('Cannot pause')) {
        res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: error.message } })
        return
      }
    }
    next(error)
  }
})

router.post('/jobs/topup-screenshots/:id/resume', async (req, res, next) => {
  try {
    const id = parseInt(req.params['id']!, 10)
    const { topupState, job } = await resumeTopupScreenshots(id)
    res.json({ success: true, data: { topupState, job: { id: job.id, name: job.name } } })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: error.message } })
        return
      }
      if (error.message.includes('Cannot resume')) {
        res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: error.message } })
        return
      }
    }
    next(error)
  }
})

router.post('/jobs/topup-screenshots/:id/cancel', async (req, res, next) => {
  try {
    const id = parseInt(req.params['id']!, 10)
    const topupState = await cancelTopupScreenshots(id)
    res.json({ success: true, data: { topupState } })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: error.message } })
        return
      }
      if (error.message.includes('Cannot cancel')) {
        res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: error.message } })
        return
      }
    }
    next(error)
  }
})

// === Email Settings ===

// Get email configuration status
router.get('/email/config', async (_req, res, next) => {
  try {
    const hasApiKey = !!env.RESEND_API_KEY
    const configured = hasApiKey && !!resend

    res.json({
      success: true,
      data: {
        configured,
        hasApiKey,
        emailFrom: env.EMAIL_FROM,
      },
    })
  } catch (error) {
    next(error)
  }
})

// Send test email
const testEmailSchema = z.object({
  email: z.string().email().optional(),
})

router.post('/email/test', testEmailLimiter, async (req, res, next) => {
  try {
    const user = req.user
    const { email } = testEmailSchema.parse(req.body)

    // Use provided email or fallback to user's email
    const recipientEmail = email || user?.email

    if (!recipientEmail) {
      res.status(400).json({
        success: false,
        error: { code: 'NO_EMAIL', message: 'No email address provided and user email not found' },
      })
      return
    }

    if (!resend) {
      res.status(400).json({
        success: false,
        error: { code: 'NOT_CONFIGURED', message: 'Email service is not configured. Please set RESEND_API_KEY.' },
      })
      return
    }

    const subject = 'Test Email - The Box'
    const { data, error } = await resend.emails.send({
      from: `The Box <${env.EMAIL_FROM}>`,
      to: recipientEmail,
      subject,
      html: `
        <h1>Test Email</h1>
        <p>This is a test email from The Box admin panel.</p>
        <p>If you received this email, your email configuration is working correctly!</p>
        <p>Sent at: ${new Date().toISOString()}</p>
      `,
    })

    if (error) {
      await emailLogRepository.record({
        userId: user?.id ?? null,
        recipient: recipientEmail,
        type: 'admin-test',
        subject,
        status: 'failed',
        errorMessage: error.message,
      })
      res.status(500).json({
        success: false,
        error: {
          code: 'EMAIL_ERROR',
          message: error.message || 'Failed to send email',
          details: error.name || 'unknown_error',
        },
      })
      return
    }

    await emailLogRepository.record({
      userId: user?.id ?? null,
      recipient: recipientEmail,
      type: 'admin-test',
      subject,
      status: 'sent',
      providerMessageId: data?.id ?? null,
    })

    res.json({
      success: true,
      data: { sent: true, to: recipientEmail, emailId: data?.id },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.issues[0]?.message },
      })
      return
    }
    if (error instanceof Error) {
      res.status(500).json({
        success: false,
        error: { code: 'EMAIL_ERROR', message: error.message },
      })
      return
    }
    next(error)
  }
})

// === Email Log ===

const emailTypeValues = [
  'password-reset',
  'verification',
  'streak-risk',
  'relance',
  'inactive-reminder',
  'referral-announcement',
  'admin-test',
] as const

const emailLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(['sent', 'failed', 'skipped']).optional(),
  type: z.enum(emailTypeValues).optional(),
  userId: z.string().min(1).optional(),
  search: z.string().min(1).max(320).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
})

router.get('/email-log', async (req, res, next) => {
  try {
    const params = emailLogQuerySchema.parse(req.query)
    const result = await emailLogRepository.list(params)
    res.json({
      success: true,
      data: {
        entries: result.entries.map((row) => ({
          id: row.id,
          userId: row.user_id,
          recipient: row.recipient,
          type: row.type,
          subject: row.subject,
          status: row.status,
          providerMessageId: row.provider_message_id,
          errorMessage: row.error_message,
          sentAt: row.sent_at instanceof Date ? row.sent_at.toISOString() : String(row.sent_at),
        })),
        total: result.total,
        page: result.page,
        limit: result.limit,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.issues[0]?.message },
      })
      return
    }
    next(error)
  }
})

// === Growth Stats ===
// Aggregate view of the lead-gen surfaces: referral conversions, opt-in
// rates for marketing emails, and how many streak-risk nudges went out
// recently. Kept as one endpoint so the dashboard can render with a
// single round-trip.
router.get('/growth-stats', async (_req, res, next) => {
  try {
    const [
      referralTotalsRow,
      consentTotalsRow,
      streakEmail24hRow,
      streakEmail7dRow,
      topReferrers,
      mostRecentStreakEmailRow,
      relanceEmail24hRow,
      relanceEmail7dRow,
      mostRecentRelanceEmailRow,
    ] = await Promise.all([
      db('user')
        .count<{ count: string }>({ count: '*' })
        .whereNotNull('referred_by')
        .first(),
      db('user')
        .select<{ consented: string; total: string }>(
          db.raw(`COUNT(*) FILTER (WHERE email_marketing_consent = true) AS consented`),
          db.raw(`COUNT(*) AS total`)
        )
        .whereNot('email', 'like', '%@guest.thebox.local')
        .first(),
      db('user')
        .count<{ count: string }>({ count: '*' })
        .whereRaw(`last_streak_risk_email_at > NOW() - INTERVAL '24 hours'`)
        .first(),
      db('user')
        .count<{ count: string }>({ count: '*' })
        .whereRaw(`last_streak_risk_email_at > NOW() - INTERVAL '7 days'`)
        .first(),
      db.raw<{ rows: Array<{ referrer_id: string; username: string | null; name: string; count: string }> }>(
        `SELECT u.id AS referrer_id, u.username, u.name, COUNT(*)::text AS count
         FROM "user" r
         JOIN "user" u ON u.id = r.referred_by
         WHERE r.referred_by IS NOT NULL
         GROUP BY u.id, u.username, u.name
         ORDER BY COUNT(*) DESC
         LIMIT 10`
      ),
      db('user')
        .max<{ last: Date | null }>({ last: 'last_streak_risk_email_at' })
        .first(),
      db('user')
        .count<{ count: string }>({ count: '*' })
        .whereRaw(`last_relance_email_at > NOW() - INTERVAL '24 hours'`)
        .first(),
      db('user')
        .count<{ count: string }>({ count: '*' })
        .whereRaw(`last_relance_email_at > NOW() - INTERVAL '7 days'`)
        .first(),
      db('user')
        .max<{ last: Date | null }>({ last: 'last_relance_email_at' })
        .first(),
    ])

    const totalUsers = Number(consentTotalsRow?.total ?? 0)
    const consentedUsers = Number(consentTotalsRow?.consented ?? 0)

    res.json({
      success: true,
      data: {
        referrals: {
          claimedTotal: Number(referralTotalsRow?.count ?? 0),
          topReferrers: topReferrers.rows.map((row) => ({
            userId: row.referrer_id,
            displayName: row.username ?? row.name,
            count: Number(row.count),
          })),
        },
        consent: {
          consentedUsers,
          totalNonGuestUsers: totalUsers,
          ratePercent: totalUsers === 0 ? 0 : Math.round((consentedUsers / totalUsers) * 1000) / 10,
        },
        streakRiskEmail: {
          sentLast24h: Number(streakEmail24hRow?.count ?? 0),
          sentLast7d: Number(streakEmail7dRow?.count ?? 0),
          lastSentAt: mostRecentStreakEmailRow?.last?.toISOString() ?? null,
        },
        relanceEmail: {
          sentLast24h: Number(relanceEmail24hRow?.count ?? 0),
          sentLast7d: Number(relanceEmail7dRow?.count ?? 0),
          lastSentAt: mostRecentRelanceEmailRow?.last?.toISOString() ?? null,
        },
      },
    })
  } catch (error) {
    next(error)
  }
})

// === Geolocation mode (admin review) ===

router.get('/geo/candidates', async (req, res, next) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const limit = req.query.limit ? Math.min(200, Number(req.query.limit)) : 50
    const candidates = await geoScreenshotRepository.listCandidatesForReview({
      status: status as 'pending' | 'collecting' | 'promoted' | 'rejected' | undefined,
      limit,
    })
    res.json({ success: true, data: candidates })
  } catch (err) {
    next(err)
  }
})

router.get('/geo/candidates/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID' } })
      return
    }
    const candidate = await geoScreenshotRepository.findCandidateById(id)
    if (!candidate) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } })
      return
    }
    const [pins, map, meta] = await Promise.all([
      geoPinRepository.listByCandidate(id),
      geoMapRepository.findById(candidate.geoMapId),
      geoScreenshotRepository.findMetaByCandidateId(id),
    ])
    res.json({ success: true, data: { candidate, pins, map, meta } })
  } catch (err) {
    next(err)
  }
})

const overrideBodySchema = z.object({
  canonicalX: z.number().min(0).max(1),
  canonicalY: z.number().min(0).max(1),
})

router.post('/geo/candidates/:id/override', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID' } })
      return
    }
    const parse = overrideBodySchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parse.error.issues[0]?.message },
      })
      return
    }

    const candidate = await geoScreenshotRepository.findCandidateById(id)
    if (!candidate) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } })
      return
    }

    // If a meta already exists (consensus-promoted or previous override), the
    // safest behaviour is to reject — admins should delete the meta explicitly
    // rather than silently shift canonical coordinates under players.
    const existing = await geoScreenshotRepository.findMetaByCandidateId(id)
    if (existing) {
      res.status(409).json({
        success: false,
        error: { code: 'ALREADY_PROMOTED', message: 'candidate already promoted' },
      })
      return
    }

    const meta = await geoScreenshotRepository.promoteCandidateToMeta({
      candidateId: id,
      geoMapId: candidate.geoMapId,
      canonicalX: parse.data.canonicalX,
      canonicalY: parse.data.canonicalY,
      confidence: 1.0,
      consensusVersion: GEO_CONSENSUS_VERSION,
      promotedVia: 'admin',
      promotedBy: req.userId,
    })

    res.json({ success: true, data: meta })
  } catch (err) {
    next(err)
  }
})

// Auto-ingestion is driven by recurring `resolve-metadata` and `ingest-tick`
// jobs (see index.ts). The endpoints below give the admin a read-only view of
// the dataset's health plus a small set of manual-override actions: flagging
// games as curated (in/out of the auto pipeline) and forcing a re-import for
// a single game when the heuristics get something wrong.

router.get('/geo/health', async (_req, res, next) => {
  try {
    const [counts, lastFandom, lastSteam, nextChallenge, queueCounts] =
      await Promise.all([
        db
          .raw<{
            rows: Array<{
              curated: string
              resolved: string
              with_map: string
              total: string
            }>
          }>(
            `
            SELECT
              COUNT(*) FILTER (WHERE g.geo_curated)::text AS curated,
              COUNT(*) FILTER (WHERE g.geo_curated AND g.geo_metadata_status = 'resolved')::text AS resolved,
              COUNT(*) FILTER (
                WHERE g.geo_curated
                  AND EXISTS (
                    SELECT 1 FROM geo_map m
                    WHERE m.game_id = g.id AND m.is_active = true
                  )
              )::text AS with_map,
              COUNT(*)::text AS total
            FROM games g
            `,
          )
          .then(
            (r) => (r as unknown as { rows: Array<{ curated: string; resolved: string; with_map: string; total: string }> }).rows[0]!,
          ),
        db('geo_map')
          .where('source', 'fandom')
          .orderBy('created_at', 'desc')
          .first<{ created_at: Date }>('created_at'),
        db('geo_screenshot_candidate')
          .where('source', 'steam')
          .orderBy('created_at', 'desc')
          .first<{ created_at: Date }>('created_at'),
        db('geo_challenge')
          .where('challenge_date', '>=', new Date().toISOString().slice(0, 10))
          .orderBy('challenge_date', 'asc')
          .first<{ id: number; challenge_date: string }>('id', 'challenge_date'),
        geoQueue.getJobCounts('active', 'waiting', 'delayed', 'failed'),
      ])

    const failures = await geoIngestFailureRepository.listAll()

    res.json({
      success: true,
      data: {
        coverage: {
          curated: Number(counts.curated),
          resolved: Number(counts.resolved),
          withMap: Number(counts.with_map),
          total: Number(counts.total),
        },
        lastFandomImportAt: lastFandom?.created_at ?? null,
        lastSteamImportAt: lastSteam?.created_at ?? null,
        nextChallenge: nextChallenge
          ? { id: nextChallenge.id, date: nextChallenge.challenge_date }
          : null,
        queue: queueCounts,
        failures: failures.map((f) => ({
          gameId: f.game_id,
          source: f.source,
          reason: f.reason,
          attemptCount: f.attempt_count,
          lastAttemptAt: f.last_attempt_at,
          retryAfter: f.retry_after,
        })),
      },
    })
  } catch (err) {
    next(err)
  }
})

// Lists games for the admin "curate / suggest" UI. With `curated=true` it
// returns the existing curated set with ingestion status (resolved metadata,
// active map present, candidate count). With `curated=false` it proposes
// non-curated games ranked by Metacritic (descending) — that signal correlates
// well with "famous game with a Fandom wiki and Steam listing", which is the
// shape the auto-ingester can actually handle. Cap matches the bulk-curate
// endpoint (500) so the Jeux/Cartes tabs can load the whole moderation list
// in one shot.
const gamesQuerySchema = z.object({
  curated: z.enum(['true', 'false']).default('true'),
  limit: z.coerce.number().int().positive().max(500).default(20),
})

router.get('/geo/games', async (req, res, next) => {
  try {
    const parse = gamesQuerySchema.safeParse(req.query)
    if (!parse.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parse.error.issues[0]?.message },
      })
      return
    }
    const curated = parse.data.curated === 'true'
    const limit = parse.data.limit

    if (curated) {
      const result = await db.raw<{
        rows: Array<{
          id: number
          name: string
          slug: string
          release_year: number | null
          developer: string | null
          metacritic: number | null
          genres: string[] | null
          geo_metadata_status: string
          steam_app_id: number | null
          wiki_subdomain: string | null
          has_map: boolean
          candidate_count: number
        }>
      }>(
        `
        SELECT
          g.id,
          g.name,
          g.slug,
          g.release_year,
          g.developer,
          g.metacritic,
          g.genres,
          g.geo_metadata_status,
          g.steam_app_id,
          g.wiki_subdomain,
          (m.id IS NOT NULL) AS has_map,
          COALESCE(c.cnt, 0)::int AS candidate_count
        FROM games g
        LEFT JOIN LATERAL (
          SELECT id FROM geo_map
          WHERE game_id = g.id AND is_active = true
          ORDER BY created_at DESC
          LIMIT 1
        ) m ON true
        LEFT JOIN (
          SELECT game_id, COUNT(*)::int AS cnt
          FROM geo_screenshot_candidate
          WHERE is_active IS NOT FALSE
          GROUP BY game_id
        ) c ON c.game_id = g.id
        WHERE g.geo_curated = true
        ORDER BY g.name
        LIMIT ?
        `,
        [limit],
      )
      const rows = (result as unknown as { rows: typeof result.rows }).rows
      res.json({
        success: true,
        data: {
          games: rows.map((r) => ({
            id: r.id,
            name: r.name,
            slug: r.slug,
            releaseYear: r.release_year,
            developer: r.developer,
            metacritic: r.metacritic,
            genres: r.genres,
            mapEligibility: isMapEligibleByGenre(r.genres),
            metadataStatus: r.geo_metadata_status,
            steamAppId: r.steam_app_id,
            wikiSubdomain: r.wiki_subdomain,
            hasMap: r.has_map,
            candidateCount: r.candidate_count,
          })),
        },
      })
      return
    }

    const rows = await db('games')
      .where('geo_curated', false)
      .whereNotNull('metacritic')
      .orderBy('metacritic', 'desc')
      .orderBy('name')
      .limit(limit)
      .select<
        Array<{
          id: number
          name: string
          slug: string
          release_year: number | null
          developer: string | null
          metacritic: number | null
          genres: string[] | null
        }>
      >('id', 'name', 'slug', 'release_year', 'developer', 'metacritic', 'genres')

    res.json({
      success: true,
      data: {
        games: rows.map((r) => ({
          id: r.id,
          name: r.name,
          slug: r.slug,
          releaseYear: r.release_year,
          developer: r.developer,
          metacritic: r.metacritic,
          genres: r.genres,
          mapEligibility: isMapEligibleByGenre(r.genres),
        })),
      },
    })
  } catch (err) {
    next(err)
  }
})

// ---------- Per-game tier diagnosis ----------

// Returns the four-tier ingestion state for a single game so the admin can see
// at a glance which tiers were tried, which tombstoned, and which would run
// next. Drives the Maps tab's side panel.
router.get('/geo/games/:id/sources', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID' } })
      return
    }

    const game = await db('games')
      .where({ id })
      .first<{
        id: number
        name: string
        slug: string
        wiki_subdomain: string | null
        wiki_page_title: string | null
        wikidata_qid: string | null
      }>('id', 'name', 'slug', 'wiki_subdomain', 'wiki_page_title', 'wikidata_qid')
    if (!game) {
      res.status(404).json({ success: false, error: { code: 'GAME_NOT_FOUND' } })
      return
    }

    const [activeMap, registryEntry, failures] = await Promise.all([
      geoMapRepository.findActiveByGameId(id),
      findRegistryEntryBySlug(game.slug),
      db('geo_ingest_failure')
        .where({ game_id: id })
        .select<
          Array<{
            source: string
            reason: string
            attempt_count: number
            last_attempt_at: Date
            retry_after: Date
          }>
        >('source', 'reason', 'attempt_count', 'last_attempt_at', 'retry_after'),
    ])

    const failureBySource = new Map(failures.map((f) => [f.source, f]))
    const now = Date.now()

    const tier = (
      key: 'registry' | 'fandom' | 'wikidata' | 'manual',
      state:
        | { status: 'matched'; via: string; license?: string; sourceUrl?: string }
        | { status: 'tombstoned'; reason: string; attempts: number; retryAfter: Date }
        | { status: 'untried'; reason?: string }
        | { status: 'eligible' },
    ) => ({ tier: key, ...state })

    const sources: Array<ReturnType<typeof tier>> = []

    // Tier 1 — Registry
    if (activeMap?.source === 'registry') {
      sources.push(
        tier('registry', {
          status: 'matched',
          via: 'curated registry',
          license: activeMap.license,
          sourceUrl: activeMap.sourceUrl,
        }),
      )
    } else if (registryEntry) {
      const tomb = failureBySource.get('registry')
      if (tomb && tomb.retry_after.getTime() > now) {
        sources.push(
          tier('registry', {
            status: 'tombstoned',
            reason: tomb.reason,
            attempts: tomb.attempt_count,
            retryAfter: tomb.retry_after,
          }),
        )
      } else {
        sources.push(tier('registry', { status: 'eligible' }))
      }
    } else {
      sources.push(
        tier('registry', { status: 'untried', reason: 'no registry entry for slug' }),
      )
    }

    // Tier 2 — Fandom
    if (activeMap?.source === 'fandom') {
      sources.push(
        tier('fandom', {
          status: 'matched',
          via: `${game.wiki_subdomain ?? '?'}.fandom.com`,
          license: activeMap.license,
          sourceUrl: activeMap.sourceUrl,
        }),
      )
    } else if (game.wiki_subdomain && game.wiki_page_title) {
      const tomb = failureBySource.get('fandom')
      if (tomb && tomb.retry_after.getTime() > now) {
        sources.push(
          tier('fandom', {
            status: 'tombstoned',
            reason: tomb.reason,
            attempts: tomb.attempt_count,
            retryAfter: tomb.retry_after,
          }),
        )
      } else {
        sources.push(tier('fandom', { status: 'eligible' }))
      }
    } else {
      sources.push(
        tier('fandom', { status: 'untried', reason: 'no wiki_subdomain / Map: page resolved' }),
      )
    }

    // Tier 3 — Wikidata
    if (activeMap?.source === 'wikidata') {
      sources.push(
        tier('wikidata', {
          status: 'matched',
          via: game.wikidata_qid ?? 'P242',
          license: activeMap.license,
          sourceUrl: activeMap.sourceUrl,
        }),
      )
    } else if (game.wikidata_qid) {
      const tomb = failureBySource.get('wikidata')
      if (tomb && tomb.retry_after.getTime() > now) {
        sources.push(
          tier('wikidata', {
            status: 'tombstoned',
            reason: tomb.reason,
            attempts: tomb.attempt_count,
            retryAfter: tomb.retry_after,
          }),
        )
      } else {
        sources.push(tier('wikidata', { status: 'eligible' }))
      }
    } else {
      sources.push(
        tier('wikidata', { status: 'untried', reason: 'wikidata_qid unresolved' }),
      )
    }

    // Tier 4 — Manual
    if (activeMap?.source === 'manual') {
      sources.push(
        tier('manual', {
          status: 'matched',
          via: 'admin upload',
          license: activeMap.license,
          sourceUrl: activeMap.sourceUrl,
        }),
      )
    } else {
      sources.push(tier('manual', { status: 'untried' }))
    }

    res.json({
      success: true,
      data: {
        gameId: game.id,
        gameName: game.name,
        slug: game.slug,
        activeMap: activeMap
          ? {
              id: activeMap.id,
              source: activeMap.source,
              imageUrl: activeMap.imageUrl,
              license: activeMap.license,
              attribution: activeMap.attribution,
              widthPx: activeMap.widthPx,
              heightPx: activeMap.heightPx,
              region: activeMap.region,
            }
          : null,
        sources,
      },
    })
  } catch (err) {
    next(err)
  }
})

const curatedBodySchema = z.object({
  gameId: z.number().int().positive(),
  curated: z.boolean(),
})

router.post('/geo/curated', async (req, res, next) => {
  try {
    const parse = curatedBodySchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parse.error.issues[0]?.message },
      })
      return
    }

    // Flipping curated→true also resets metadata_status so the resolver
    // picks the game up on its next tick, even if a previous attempt left
    // it as 'unresolved'.
    const update: Record<string, unknown> = { geo_curated: parse.data.curated }
    if (parse.data.curated) {
      update.geo_metadata_status = 'pending'
    }
    const updated = await db('games')
      .where({ id: parse.data.gameId })
      .update(update)

    if (updated === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } })
      return
    }

    if (parse.data.curated) {
      await geoIngestFailureRepository.clear(parse.data.gameId, 'metadata')
    }

    res.json({ success: true, data: { gameId: parse.data.gameId, curated: parse.data.curated } })
  } catch (err) {
    next(err)
  }
})

const reimportBodySchema = z.object({
  gameId: z.number().int().positive(),
})

// Bulk variant of /geo/curated for the unified Games tab. Accepts a mixed
// batch of curate-on / curate-off operations so an operator can onboard or
// retire dozens of games in one network round-trip. Each item is applied
// individually inside a transaction; partial-failure behavior matches the
// single-item route (flipping `geo_curated = true` resets metadata_status
// and clears the metadata tombstone so the resolver picks the game up on
// its next tick).
const curatedBulkBodySchema = z.object({
  items: z
    .array(
      z.object({
        gameId: z.number().int().positive(),
        curated: z.boolean(),
      }),
    )
    .min(1)
    .max(500),
})

router.post('/geo/curated/bulk', async (req, res, next) => {
  try {
    const parse = curatedBulkBodySchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parse.error.issues[0]?.message },
      })
      return
    }

    let updated = 0
    let notFound = 0
    await db.transaction(async (trx) => {
      for (const item of parse.data.items) {
        const update: Record<string, unknown> = { geo_curated: item.curated }
        if (item.curated) update.geo_metadata_status = 'pending'
        const n = await trx('games').where({ id: item.gameId }).update(update)
        if (n === 0) {
          notFound++
        } else {
          updated++
          if (item.curated) {
            await trx('geo_ingest_failure')
              .where({ game_id: item.gameId, source: 'metadata' })
              .del()
          }
        }
      }
    })

    res.json({ success: true, data: { updated, notFound } })
  } catch (err) {
    next(err)
  }
})

router.post('/geo/reimport', async (req, res, next) => {
  try {
    const parse = reimportBodySchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parse.error.issues[0]?.message },
      })
      return
    }
    // Wipe tombstones + force a metadata re-resolve. The recurring ingest
    // tick will re-enqueue per-source imports as soon as resolution lands.
    await Promise.all([
      geoIngestFailureRepository.clear(parse.data.gameId, 'registry'),
      geoIngestFailureRepository.clear(parse.data.gameId, 'fandom'),
      geoIngestFailureRepository.clear(parse.data.gameId, 'wikidata'),
      geoIngestFailureRepository.clear(parse.data.gameId, 'steam'),
      geoIngestFailureRepository.clear(parse.data.gameId, 'metadata'),
    ])
    await db('games')
      .where({ id: parse.data.gameId })
      .update({
        geo_metadata_status: 'pending',
        wiki_subdomain: null,
        wiki_page_title: null,
        steam_app_id: null,
        wikidata_qid: null,
      })

    const job = await geoQueue.add('resolve-metadata', {
      kind: 'resolve-metadata',
      batchSize: 1,
    })
    res.json({ success: true, data: { jobId: job.id } })
  } catch (err) {
    next(err)
  }
})

// Manual run-now triggers for the whole geo ingestion pipeline. The recurring
// resolver + tick workers already run on a schedule; these endpoints just
// short-circuit the wait so an operator can kick off a fresh pass immediately
// after curating games or after a reset. Both jobs are idempotent — clicking
// twice is harmless because the per-tier importers short-circuit on existing
// rows.
router.post('/geo/run', async (_req, res, next) => {
  try {
    // Large batch sizes so a single click sweeps the whole curated set.
    const resolveJob = await geoQueue.add('resolve-metadata', {
      kind: 'resolve-metadata',
      batchSize: 500,
    })
    const tickJob = await geoQueue.add('ingest-tick', {
      kind: 'ingest-tick',
      batchSize: 500,
    })
    res.json({
      success: true,
      data: { resolveJobId: resolveJob.id, tickJobId: tickJob.id },
    })
  } catch (err) {
    next(err)
  }
})

router.post('/geo/run/:gameId', async (req, res, next) => {
  try {
    const gameId = Number(req.params.gameId)
    if (!Number.isFinite(gameId) || gameId <= 0) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID' } })
      return
    }
    // Stable jobIds so a double-click while one is still in flight collapses
    // to a single run. BullMQ silently no-ops on duplicate ids. Hyphens (not
    // colons) — BullMQ's `Job.validateOptions` throws on jobIds containing
    // `:` unless they have exactly 3 colon-separated parts (a legacy
    // repeatable-job carve-out).
    const resolveJob = await geoQueue.add(
      'resolve-metadata',
      { kind: 'resolve-metadata', batchSize: 1, gameId },
      { jobId: `manual-resolve-${gameId}` },
    )
    const tickJob = await geoQueue.add(
      'ingest-tick',
      { kind: 'ingest-tick', batchSize: 1, gameId },
      { jobId: `manual-tick-${gameId}` },
    )
    res.json({
      success: true,
      data: { gameId, resolveJobId: resolveJob.id, tickJobId: tickJob.id },
    })
  } catch (err) {
    next(err)
  }
})

// Live-progress feed for the manual run UI. Returns active/waiting/delayed
// geo jobs grouped by gameId so the maps tab can highlight which rows are
// in flight at which tier. Polled at ~2s while a run is active.
router.get('/geo/run/state', async (_req, res, next) => {
  try {
    const [active, waiting, delayed, counts] = await Promise.all([
      geoQueue.getActive(0, 200),
      geoQueue.getWaiting(0, 200),
      geoQueue.getDelayed(0, 200),
      geoQueue.getJobCounts(
        'active',
        'waiting',
        'delayed',
        'failed',
        'completed',
      ),
    ])

    const byGame: Record<
      number,
      Array<{ kind: GeoJobData['kind']; state: 'active' | 'waiting' | 'delayed' }>
    > = {}
    // Global (no-gameId) jobs surfaced separately so the UI can show "batch
    // resolver running" alongside per-game progress.
    const globals: Array<{
      kind: GeoJobData['kind']
      state: 'active' | 'waiting' | 'delayed'
    }> = []

    const sweep = (
      jobs: typeof active,
      state: 'active' | 'waiting' | 'delayed',
    ) => {
      for (const job of jobs) {
        const data = job.data as GeoJobData
        // Skip noise jobs unrelated to the ingest pipeline.
        if (
          data.kind === 'evaluate-consensus' ||
          data.kind === 'promote-contributor-tier'
        ) {
          continue
        }
        const gameId =
          'gameId' in data && typeof data.gameId === 'number' ? data.gameId : null
        if (gameId === null) {
          globals.push({ kind: data.kind, state })
          continue
        }
        ;(byGame[gameId] ??= []).push({ kind: data.kind, state })
      }
    }
    sweep(active, 'active')
    sweep(waiting, 'waiting')
    sweep(delayed, 'delayed')

    // BullMQ types each `JobCountsKeyType` as optional even though
    // `getJobCounts` always returns the keys you asked for.
    const safeCounts = {
      active: counts.active ?? 0,
      waiting: counts.waiting ?? 0,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
      completed: counts.completed ?? 0,
    }
    const inflight = safeCounts.active + safeCounts.waiting + safeCounts.delayed
    res.json({
      success: true,
      data: {
        isActive: inflight > 0,
        counts: safeCounts,
        byGame,
        globals,
      },
    })
  } catch (err) {
    next(err)
  }
})

router.post('/geo/schedule', async (_req, res, next) => {
  // Manual fallback: trigger the daily-challenge scheduler immediately.
  // The recurring 00:05 UTC job is the primary path; this is an escape
  // hatch when ops needs to refill the calendar mid-day.
  try {
    const job = await geoQueue.add('schedule-daily-challenge', {
      kind: 'schedule-daily-challenge',
    })
    res.json({ success: true, data: { jobId: job.id } })
  } catch (err) {
    next(err)
  }
})

// Demote a canonical meta back to an unlabeled candidate so an admin can
// re-promote with corrected coordinates. FK RESTRICT on geo_challenge means
// this 409s when any challenge references the meta — admins must unlink the
// challenge(s) first rather than silently breaking an active day.
router.delete('/geo/meta/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID' } })
      return
    }

    try {
      const result = await geoScreenshotRepository.deleteMeta(id)
      if (!result.deleted) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } })
        return
      }
      res.json({ success: true, data: result })
    } catch (dbErr) {
      const msg = String(dbErr)
      if (msg.includes('foreign key') || msg.includes('violates')) {
        res.status(409).json({
          success: false,
          error: {
            code: 'META_IN_USE',
            message: 'meta is referenced by a geo challenge — remove the challenge first',
          },
        })
        return
      }
      throw dbErr
    }
  } catch (err) {
    next(err)
  }
})

// ---------- Tier 3 manual map upload ----------

// Last-resort fallback when Tiers 1–2 (registry / Fandom / Wikidata) didn't
// produce a usable map. Admin supplies a URL they've verified themselves
// (publisher press kit, commissioned art, hand-drawn fan map with explicit
// permission), declares license + attribution, and we record it as a
// `source = 'manual'` row. No image processing happens server-side — the
// admin is responsible for hosting the asset somewhere stable.
const manualGeoMapBodySchema = z.object({
  gameId: z.number().int().positive(),
  imageUrl: z.string().url().max(1000),
  widthPx: z.number().int().positive().max(32_768),
  heightPx: z.number().int().positive().max(32_768),
  license: z.string().min(1).max(100),
  attribution: z.string().max(500).optional(),
  sourceUrl: z.string().url().max(1000).optional(),
  consensusRadius: z.number().min(0.001).max(1).optional(),
  // Optional region label (e.g. "Velen", "Act II") for multi-map games.
  // Omit / empty for the canonical world map. Stored on geo_map.region.
  region: z.string().trim().min(1).max(100).optional(),
  // If true, the existing active map for this game is deactivated first so
  // the new one becomes canonical without violating the unique
  // (game_id, image_url) constraint when the URLs differ.
  replaceActive: z.boolean().optional(),
})

router.post('/geo/maps/manual', async (req, res, next) => {
  try {
    const parse = manualGeoMapBodySchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parse.error.issues[0]?.message },
      })
      return
    }
    const data = parse.data

    const game = await db('games').where({ id: data.gameId }).first<{ id: number }>()
    if (!game) {
      res.status(404).json({ success: false, error: { code: 'GAME_NOT_FOUND' } })
      return
    }

    if (data.replaceActive) {
      const active = await geoMapRepository.findActiveByGameId(data.gameId)
      if (active) await geoMapRepository.deactivate(active.id)
    } else {
      const active = await geoMapRepository.findActiveByGameId(data.gameId)
      if (active) {
        res.status(409).json({
          success: false,
          error: {
            code: 'MAP_EXISTS',
            message:
              'an active geo_map already exists for this game; pass replaceActive=true to swap',
          },
        })
        return
      }
    }

    const map = await geoMapRepository.create({
      gameId: data.gameId,
      source: 'manual',
      sourceUrl: data.sourceUrl,
      imageUrl: data.imageUrl,
      widthPx: data.widthPx,
      heightPx: data.heightPx,
      license: data.license,
      attribution: data.attribution,
      consensusRadius: data.consensusRadius,
      region: data.region,
    })

    // Also clear all ingest tombstones for this game — manual upload is the
    // operator saying "I've solved this", so the auto-pipeline shouldn't keep
    // re-tombstoning it.
    await Promise.all([
      geoIngestFailureRepository.clear(data.gameId, 'registry'),
      geoIngestFailureRepository.clear(data.gameId, 'fandom'),
      geoIngestFailureRepository.clear(data.gameId, 'wikidata'),
    ])

    res.json({ success: true, data: map })
  } catch (err) {
    next(err)
  }
})

// ---------- Capture report moderation ----------

// Aggregated view of which captures have been reported. Defaults to all
// reports (so admins can see brewing problems before the threshold trips);
// pass `?onlyDeactivated=true` to focus on captures already pulled from
// rotation. `limit` caps the queue depth — typical moderation pages won't
// need more than a hundred at a time.
router.get('/screenshot-reports', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 100) || 100, 1), 500)
    const onlyDeactivated = String(req.query.onlyDeactivated ?? '') === 'true'
    const data = await screenshotReportRepository.listAggregated({ limit, onlyDeactivated })
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

// Reactivate a capture an admin reviewed and judged a false positive.
// Body: { screenshotId } | { geoScreenshotCandidateId } — exactly one.
// Drops the existing reports so a single 3-report wave doesn't immediately
// re-trip the threshold; the audit log still has the request via Pino.
router.post('/screenshot-reports/reactivate', async (req, res, next) => {
  try {
    const { screenshotId, geoScreenshotCandidateId } = req.body as {
      screenshotId?: number
      geoScreenshotCandidateId?: number
    }
    if (Boolean(screenshotId) === Boolean(geoScreenshotCandidateId)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_BODY',
          message: 'exactly one of screenshotId or geoScreenshotCandidateId is required',
        },
      })
      return
    }
    const result = await screenshotReportRepository.reactivate({
      screenshotId,
      geoScreenshotCandidateId,
    })
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

// Wipes every piece of scraping progress + scraped data so the next run
// starts from zero. Keeps operator curation choices (`games.geo_curated`)
// and player-generated data (scores, leaderboards). User-visible impact:
// the daily geo challenge will return NO_CHALLENGE until a new map is
// imported and a challenge is scheduled.
//
// Cascade order matters here:
//   - geo_challenge.geo_screenshot_meta_id is ON DELETE RESTRICT, so it must
//     go first, otherwise the geo_map delete would fail when the cascade
//     reaches geo_screenshot_meta.
//   - geo_map cascades to geo_screenshot_candidate + geo_screenshot_meta,
//     and those cascade to geo_pin / screenshot_reports.geo_* in turn.
router.post('/scraping/reset', async (req, res, next) => {
  try {
    const result = await db.transaction(async (trx) => {
      const importStates = await trx('import_states').delete()
      const ingestFailures = await trx('geo_ingest_failure').delete()

      await trx('games').update({
        geo_metadata_status: 'pending',
        geo_metadata_resolved_at: null,
        wiki_subdomain: null,
        wiki_page_title: null,
        steam_app_id: null,
        wikidata_qid: null,
      })

      const challenges = await trx('geo_challenge').delete()
      const maps = await trx('geo_map').delete()

      return { importStates, ingestFailures, challenges, maps }
    })

    routeLogger.warn(
      { adminId: req.userId, ...result },
      'admin reset scraping state from zero',
    )
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

export default router
