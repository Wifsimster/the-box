import { Router } from 'express'
import { z } from 'zod'
import { recordAdminGeoAudit } from '../../middleware/admin-audit.js'
import {
  screenshotReportRepository,
} from '../../../infrastructure/repositories/index.js'

const router = Router()

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

const reactivateBodySchema = z
  .union([
    z.object({
      screenshotId: z.number().int().positive(),
      geoScreenshotCandidateId: z.undefined().optional(),
    }),
    z.object({
      screenshotId: z.undefined().optional(),
      geoScreenshotCandidateId: z.number().int().positive(),
    }),
  ])
  .refine(
    (data) => Boolean(data.screenshotId) !== Boolean(data.geoScreenshotCandidateId),
    { message: 'exactly one of screenshotId or geoScreenshotCandidateId is required' },
  )

router.post('/screenshot-reports/reactivate', async (req, res, next) => {
  try {
    const parse = reactivateBodySchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message:
            parse.error.issues[0]?.message ??
            'exactly one of screenshotId or geoScreenshotCandidateId is required',
        },
      })
      return
    }
    const { screenshotId, geoScreenshotCandidateId } = parse.data
    const result = await screenshotReportRepository.reactivate({
      screenshotId,
      geoScreenshotCandidateId,
    })
    await recordAdminGeoAudit(req, {
      action: 'screenshot-report.reactivate',
      target: {
        kind: screenshotId ? 'screenshot' : 'geo-screenshot-candidate',
        id: screenshotId ?? geoScreenshotCandidateId,
      },
      after: result,
    })
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

export default router
