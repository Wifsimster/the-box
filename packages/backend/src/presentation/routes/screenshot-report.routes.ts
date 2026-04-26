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

// User-driven eligibility flag for any in-game capture, regardless of mode.
// Exactly one of `screenshotId` (main daily / catch-up) or
// `geoScreenshotCandidateId` (geo pin game) must be provided. Idempotent per
// (user, target) thanks to partial unique indexes on `screenshot_reports`;
// once enough distinct users hit it for the same target the repository
// auto-flips `is_active=false` so the capture stops appearing in every mode.
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

    // Reject orphaned reports up front; otherwise we'd silently accumulate
    // rows that admins can't act on without scrubbing the DB by hand.
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
