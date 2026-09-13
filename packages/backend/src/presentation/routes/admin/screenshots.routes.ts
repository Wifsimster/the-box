import { Router } from 'express'
import { z } from 'zod'
import {
  adminService,
} from '../../../composition/services.js'

const router = Router()

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


export default router
