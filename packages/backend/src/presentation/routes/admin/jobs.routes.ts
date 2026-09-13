import { Router } from 'express'
import { z } from 'zod'
import {
  jobService,
} from '../../../composition/services.js'

const router = Router()

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


export default router
