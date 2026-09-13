/**
 * Admin analytics endpoints.
 *
 * Transport only: call the service, serialize the report. The SQL lives in
 * `infrastructure/repositories/admin-analytics.repository.ts` and the rate
 * math in `domain/services/admin-analytics.service.ts`.
 */
import { Router } from 'express'
import {
  adminAnalyticsService,
} from '../../../composition/services.js'

const router = Router()

// Aggregate view of the lead-gen surfaces: referral conversions, opt-in
// rates for marketing emails, and how many nudges went out recently.
router.get('/growth-stats', async (_req, res, next) => {
  try {
    res.json({ success: true, data: await adminAnalyticsService.getGrowthStats() })
  } catch (error) {
    next(error)
  }
})

// Cross-cutting view of user engagement: how many people come back, how
// often they play, who's most active, and where they drop off.
router.get('/user-analytics', async (_req, res, next) => {
  try {
    res.json({ success: true, data: await adminAnalyticsService.getUserAnalytics() })
  } catch (error) {
    next(error)
  }
})

export default router
