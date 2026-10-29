import { Router } from 'express'
import {
  DailyLoginError,
} from '../../domain/services/index.js'
import {
  dailyLoginService,
} from '../../composition/services.js'
import { authMiddleware } from '../middleware/auth.middleware.js'

const router = Router()

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
