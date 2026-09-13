import { Router } from 'express'
import { z } from 'zod'
import { recordAdminGeoAudit } from '../../middleware/admin-audit.js'
import {
  screenshotReportRepository,
} from '../../../infrastructure/repositories/index.js'

const router = Router()

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
// Zod-validated discriminated union: exactly one of screenshotId /
// geoScreenshotCandidateId must be present, both as positive integers.
// Without Zod, raw `Boolean(undefined) === Boolean(0)` was true, so a
// caller could legally send `screenshotId: 0` and skip the type coercion.
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
