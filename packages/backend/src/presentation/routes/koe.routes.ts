import { Router } from 'express'
import { createHmac } from 'node:crypto'
import { env } from '../../config/env.js'
import { authMiddleware } from '../middleware/auth.middleware.js'

const router = Router()

/**
 * GET /api/koe/identity
 *
 * Returns the HMAC-SHA256(userId) hex digest used by the Koe widget for
 * identity verification. Without KOE_IDENTITY_SECRET configured the
 * endpoint returns 204 so the widget falls back to unverified mode.
 */
router.get('/identity', authMiddleware, (req, res, next) => {
    try {
        if (!env.KOE_IDENTITY_SECRET) {
            res.status(204).end()
            return
        }

        const userHash = createHmac('sha256', env.KOE_IDENTITY_SECRET)
            .update(req.userId!)
            .digest('hex')

        res.json({
            success: true,
            data: { userHash },
        })
    } catch (error) {
        next(error)
    }
})

export default router
