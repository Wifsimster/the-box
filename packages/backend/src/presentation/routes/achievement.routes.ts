import { Router } from 'express'
import { achievementService } from '../../domain/services/index.js'
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware.js'

const router = Router()

/**
 * GET /api/achievements
 * Get all achievements (public)
 */
router.get('/', async (_req, res, next) => {
    try {
        const achievements = await achievementService.getAllAchievementsWithProgress('')

        res.json({
            success: true,
            data: achievements.map(a => ({
                id: a.id,
                key: a.key,
                name: a.name,
                description: a.description,
                category: a.category,
                iconUrl: a.icon_url,
                points: a.points,
                tier: a.tier,
                isHidden: a.is_hidden,
            })),
        })
    } catch (error) {
        next(error)
    }
})

/**
 * GET /api/achievements/user/:userId
 * Get achievements for a specific user (with progress)
 */
router.get('/user/:userId', optionalAuthMiddleware, async (req, res, next) => {
    try {
        const { userId } = req.params

        if (!userId || Array.isArray(userId)) {
            return res.status(400).json({
                success: false,
                error: { code: 'INVALID_USER_ID', message: 'Invalid user ID' },
            })
        }

        const [achievements, stats] = await Promise.all([
            achievementService.getAllAchievementsWithProgress(userId),
            achievementService.getUserStats(userId),
        ])

        res.json({
            success: true,
            data: {
                achievements: achievements.map(a => ({
                    id: a.id,
                    key: a.key,
                    name: a.name,
                    description: a.description,
                    category: a.category,
                    iconUrl: a.icon_url,
                    points: a.points,
                    tier: a.tier,
                    isHidden: a.is_hidden,
                    earned: a.earned,
                    earnedAt: a.earnedAt?.toISOString() || null,
                    progress: a.progress,
                    progressMax: a.progressMax,
                })),
                stats,
            },
        })
    } catch (error) {
        next(error)
    }
})

/**
 * GET /api/achievements/me
 * Get current user's achievements (authenticated)
 */
router.get('/me', authMiddleware, async (req, res, next) => {
    try {
        const userId = req.userId!

        const [achievements, stats] = await Promise.all([
            achievementService.getAllAchievementsWithProgress(userId),
            achievementService.getUserStats(userId),
        ])

        res.json({
            success: true,
            data: {
                achievements: achievements.map(a => ({
                    id: a.id,
                    key: a.key,
                    name: a.name,
                    description: a.description,
                    category: a.category,
                    iconUrl: a.icon_url,
                    points: a.points,
                    tier: a.tier,
                    isHidden: a.is_hidden,
                    earned: a.earned,
                    earnedAt: a.earnedAt?.toISOString() || null,
                    progress: a.progress,
                    progressMax: a.progressMax,
                })),
                stats,
            },
        })
    } catch (error) {
        next(error)
    }
})

/**
 * GET /api/achievements/leaderboard
 * Get achievement points leaderboard
 */
router.get('/leaderboard', async (req, res, next) => {
    try {
        const limit = req.query['limit'] ? parseInt(req.query['limit'] as string) : 100
        const leaderboard = await achievementService.getLeaderboard(limit)

        res.json({
            success: true,
            data: leaderboard,
        })
    } catch (error) {
        next(error)
    }
})

export default router
