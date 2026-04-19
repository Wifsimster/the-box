import { Router } from 'express'
import { referralService, ReferralError } from '../../domain/services/index.js'
import { authMiddleware } from '../middleware/auth.middleware.js'

const router = Router()

/**
 * POST /api/referral/claim
 * Body: { code: string }
 * Grants referral power-up rewards to both the referee (caller) and
 * the referrer identified by `code`. One-shot per account.
 */
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
      const status = error.code === 'USER_NOT_FOUND' ? 404 : 400
      return res.status(status).json({
        success: false,
        error: { code: error.code, message: error.message },
      })
    }
    next(error)
  }
})

/**
 * GET /api/referral/stats
 * Returns claim status and number of successful referrals made.
 */
router.get('/stats', authMiddleware, async (req, res, next) => {
  try {
    const stats = await referralService.getStats(req.userId!)
    res.json({ success: true, data: stats })
  } catch (error) {
    next(error)
  }
})

export default router
