import { Router } from 'express'
import { geoAdminRepository } from '../../../infrastructure/repositories/index.js'
import { z } from 'zod'
import { recordAdminGeoAudit } from '../../middleware/admin-audit.js'
import { routeLogger } from '../../../infrastructure/logger/logger.js'

const router = Router()

// Wipes every piece of scraping progress + scraped data so the next run
// starts from zero. Keeps operator curation choices (`games.geo_curated`)
// and player-generated data (scores, leaderboards). User-visible impact:
// the daily geo challenge will return NO_CHALLENGE until a new map is
// imported and a challenge is scheduled.
//
// Cascade order matters here:
//   - geo_challenge.geo_screenshot_meta_id is ON DELETE RESTRICT, so it must
//     go first, otherwise the geo_map delete would fail when the cascade
//     reaches geo_screenshot_meta.
//   - geo_map cascades to geo_screenshot_candidate + geo_screenshot_meta,
//     and those cascade to geo_pin / screenshot_reports.geo_* in turn.

// Destructive nuke that wipes every piece of scraping progress. Requires the
// caller to send `{ confirm: 'RESET' }` so a stray click / CSRF can't silently
// blow away the whole geo dataset. Audit-logged before the destructive work so
// the trail survives even if the transaction crashes mid-flight.
const scrapingResetBodySchema = z.object({
  confirm: z.literal('RESET'),
})

router.post('/scraping/reset', async (req, res, next) => {
  try {
    const parse = scrapingResetBodySchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'CONFIRMATION_REQUIRED',
          message: "send { confirm: 'RESET' } to perform this destructive operation",
        },
      })
      return
    }

    routeLogger.warn(
      { adminId: req.userId },
      'admin requested scraping/reset',
    )
    const result = await geoAdminRepository.resetAllScrapingState()

    await recordAdminGeoAudit(req, {
      action: 'scraping.reset',
      target: { kind: 'global' },
      after: result,
    })
    routeLogger.warn(
      { adminId: req.userId, ...result },
      'admin reset scraping state from zero',
    )
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/geogamers/health — content-readiness dashboard for the
// GeoGamers daily scheduler. Surfaces the same eligibility the worker gates on
// so an admin can see "starved" before a day silently skips, plus today's
// challenge and the current season's player count.

export default router
