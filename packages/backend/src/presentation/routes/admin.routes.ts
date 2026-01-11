import { Router } from 'express'
import { z } from 'zod'
import { adminService } from '../../domain/services/index.js'
import { jobService } from '../../domain/services/job.service.js'
import { adminMiddleware } from '../middleware/auth.middleware.js'
import {
  startBatchImport,
  pauseImport,
  resumeImport,
  getActiveImport,
  getImportState,
} from '../../infrastructure/queue/workers/batch-import-logic.js'

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
})

router.post('/challenges/reroll', async (req, res, next) => {
  try {
    const { date } = rerollChallengeSchema.parse(req.body)
    const result = await adminService.rerollDailyChallenge(date)

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
  type: z.enum(['import-games', 'import-screenshots', 'sync-new-games']),
  data: z
    .object({
      targetGames: z.number().min(1).max(1000).optional(),
      screenshotsPerGame: z.number().min(1).max(10).optional(),
      minMetacritic: z.number().min(0).max(100).optional(),
      maxGames: z.number().min(1).max(100).optional(),
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
      screenshotsPerGame: req.body?.screenshotsPerGame || 3,
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

// Shortcut: Start sync-new-games job (fetch newest games from RAWG)
router.post('/jobs/sync-new-games', async (req, res, next) => {
  try {
    const data = {
      maxGames: req.body?.maxGames || 10,
      screenshotsPerGame: req.body?.screenshotsPerGame || 3,
    }
    const job = await jobService.createJob('sync-new-games', data)

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
      screenshotsPerGame: req.body?.screenshotsPerGame || 3,
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
  screenshotsPerGame: z.number().min(1).max(10).default(3),
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

export default router
