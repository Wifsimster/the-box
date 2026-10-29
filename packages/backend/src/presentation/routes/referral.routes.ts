import { Router } from 'express'
import {
  ReferralError,
} from '../../domain/services/index.js'
import {
  referralService,
} from '../../composition/services.js'
import { authMiddleware } from '../middleware/auth.middleware.js'

const router = Router()

router.post('/claim', authMiddleware, async (req, res, next) => {
  try {
    const { code } = req.body ?? {}

    if (typeof code !== 'string' || code.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_CODE', message: 'Referral code is required' },
      })
    }

    const result = await referralService.claim(req.userId!, code)

    res.json({ success: true, data: result })
  } catch (error) {
    if (error instanceof ReferralError) {
      const notFound = error.code === 'USER_NOT_FOUND' || error.code === 'REFERRER_NOT_FOUND'
      const status = notFound ? 404 : 400
      return res.status(status).json({
        success: false,
        error: { code: error.code, message: error.message },
      })
    }
    next(error)
  }
})

router.get('/stats', authMiddleware, async (req, res, next) => {
  try {
    const stats = await referralService.getStats(req.userId!)
    res.json({ success: true, data: stats })
  } catch (error) {
    next(error)
  }
})

export default router
