import { Router } from 'express'
import { z } from 'zod'
import {
  startBatchImport,
  pauseImport,
  resumeImport,
  getActiveImport,
  getImportState,
} from '../../../infrastructure/queue/workers/batch-import-logic.js'
import {
  startSyncAll,
  pauseSyncAll,
  resumeSyncAll,
  cancelSyncAll,
  getActiveSyncAll,
  getSyncAllState,
} from '../../../infrastructure/queue/workers/sync-all-logic.js'
import {
  startRecalculateScores,
  pauseRecalculateScores,
  resumeRecalculateScores,
  getActiveRecalculateScores,
  getRecalculateScoresState,
} from '../../../infrastructure/queue/workers/recalculate-scores-logic.js'

const router = Router()

const startFullImportSchema = z.object({
  batchSize: z.number().min(10).max(500).default(100),
  screenshotsPerGame: z.number().min(1).max(10).default(5),
  minMetacritic: z.number().min(0).max(100).default(70),
})

router.post('/jobs/full-import/start', async (req, res, next) => {
  try {
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

router.get('/jobs/full-import/current', async (_req, res, next) => {
  try {
    const importState = await getActiveImport()

    res.json({
      success: true,
      data: { importState },
    })
  } catch (error) {
    next(error)
  }
})

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

const startSyncAllSchema = z.object({
  batchSize: z.number().min(10).max(500).default(100),
  screenshotsPerGame: z.number().min(1).max(10).default(5),
  minMetacritic: z.number().min(0).max(100).default(70),
  updateExistingMetadata: z.boolean().default(true),
})

router.post('/jobs/sync-all/start', async (req, res, next) => {
  try {
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

router.get('/jobs/sync-all/current', async (_req, res, next) => {
  try {
    const syncState = await getActiveSyncAll()

    res.json({
      success: true,
      data: { syncState },
    })
  } catch (error) {
    next(error)
  }
})

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

const startRecalculateScoresSchema = z.object({
  batchSize: z.number().min(10).max(1000).default(100),
  dryRun: z.boolean().default(false),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
})

router.post('/jobs/recalculate-scores/start', async (req, res, next) => {
  try {
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

router.get('/jobs/recalculate-scores/current', async (_req, res, next) => {
  try {
    const recalculateState = await getActiveRecalculateScores()

    res.json({
      success: true,
      data: { recalculateState },
    })
  } catch (error) {
    next(error)
  }
})

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


export default router
