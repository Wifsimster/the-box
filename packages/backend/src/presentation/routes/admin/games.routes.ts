import { Router } from 'express'
import { z } from 'zod'
import { adminService } from '../../../domain/services/index.js'

const router = Router()

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


export default router
