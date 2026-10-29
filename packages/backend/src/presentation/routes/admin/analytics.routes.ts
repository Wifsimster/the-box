import { Router } from 'express'
import {
  adminAnalyticsService,
} from '../../../composition/services.js'

const router = Router()

router.get('/growth-stats', async (_req, res, next) => {
  try {
    res.json({ success: true, data: await adminAnalyticsService.getGrowthStats() })
  } catch (error) {
    next(error)
  }
})

router.get('/user-analytics', async (_req, res, next) => {
  try {
    res.json({ success: true, data: await adminAnalyticsService.getUserAnalytics() })
  } catch (error) {
    next(error)
  }
})

export default router
