import { Router } from 'express'
import { z } from 'zod'
import {
  geoScreenshotRepository,
  screenshotReportRepository,
} from '../../infrastructure/repositories/index.js'
import { authMiddleware } from '../middleware/auth.middleware.js'
import { validateBody } from '../middleware/validation.middleware.js'
import type { ScreenshotReportReason } from '@the-box/types'

const SCREENSHOT_REPORT_REASONS = [
  'wrong_game',
  'low_quality',
  'not_recognizable',
  'inappropriate',
  'too_easy',
  'other',
] as const satisfies readonly ScreenshotReportReason[]

const router = Router()

const reportBodySchema = z
  .object({
    geoScreenshotCandidateId: z.number().int().positive().optional(),
    screenshotId: z.number().int().positive().optional(),
    reason: z.enum(SCREENSHOT_REPORT_REASONS),
    details: z.string().trim().max(500).optional(),
  })
  .refine(
    (v) => Boolean(v.geoScreenshotCandidateId) !== Boolean(v.screenshotId),
    'exactly one of geoScreenshotCandidateId or screenshotId is required',
  )

router.post('/', authMiddleware, validateBody(reportBodySchema), async (req, res, next) => {
  try {
    const userId = req.userId!
    const body = req.body as z.infer<typeof reportBodySchema>

    if (body.geoScreenshotCandidateId != null) {
      const candidate = await geoScreenshotRepository.findCandidateById(
        body.geoScreenshotCandidateId,
      )
      if (!candidate) {
        res.status(404).json({
          success: false,
          error: { code: 'CANDIDATE_NOT_FOUND', message: 'capture not found' },
        })
        return
      }
    }

    const outcome = await screenshotReportRepository.submit({
      userId,
      reason: body.reason,
      details: body.details,
      screenshotId: body.screenshotId,
      geoScreenshotCandidateId: body.geoScreenshotCandidateId,
    })

    res.json({
      success: true,
      data: {
        received: true,
        deactivated: outcome.deactivated,
        reportCount: outcome.reportCount,
      },
    })
  } catch (err) {
    next(err)
  }
})

export default router
