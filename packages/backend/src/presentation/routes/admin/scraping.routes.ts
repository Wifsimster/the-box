import { Router } from 'express'
import { geoAdminRepository } from '../../../infrastructure/repositories/index.js'
import { z } from 'zod'
import { recordAdminGeoAudit } from '../../middleware/admin-audit.js'
import { routeLogger } from '../../../infrastructure/logger/logger.js'

const router = Router()

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

export default router
