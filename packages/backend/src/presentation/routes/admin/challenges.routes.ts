import { Router } from 'express'
import { z } from 'zod'
import {
  adminService,
} from '../../../composition/services.js'

const router = Router()

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


export default router
