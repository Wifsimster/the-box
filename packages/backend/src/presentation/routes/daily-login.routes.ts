import { Router } from 'express'
import { dailyLoginService, DailyLoginError } from '../../domain/services/index.js'
import { authMiddleware } from '../middleware/auth.middleware.js'

const router = Router()

/**
 * GET /api/daily-login/status
 * Get current user's daily login status, streak, and today's reward
 */
router.get('/status', authMiddleware, async (req, res, next) => {
    try {
        const userId = req.userId!

        const status = await dailyLoginService.getStatus(userId)

        res.json({
            success: true,
            data: status,
        })
    } catch (error) {
        next(error)
    }
})

/**
 * POST /api/daily-login/claim
 * Claim today's reward
 */
router.post('/claim', authMiddleware, async (req, res, next) => {
    try {
        const userId = req.userId!

        const result = await dailyLoginService.claimReward(userId)

        res.json({
            success: true,
            data: result,
        })
    } catch (error) {
        if (error instanceof DailyLoginError) {
            return res.status(400).json({
                success: false,
                error: { code: error.code, message: error.message },
            })
        }
        next(error)
    }
})

/**
 * GET /api/daily-login/rewards
 * Get all reward definitions (public)
 */
router.get('/rewards', async (_req, res, next) => {
    try {
        const rewards = await dailyLoginService.getAllRewards()

        res.json({
            success: true,
            data: rewards,
        })
    } catch (error) {
        next(error)
    }
})

/**
 * GET /api/daily-login/inventory (or /api/inventory when mounted separately)
 * Get current user's inventory
 */
router.get('/', authMiddleware, async (req, res, next) => {
    try {
        const userId = req.userId!

        const inventory = await dailyLoginService.getUserInventory(userId)

        res.json({
            success: true,
            data: inventory,
        })
    } catch (error) {
        next(error)
    }
})

export default router
