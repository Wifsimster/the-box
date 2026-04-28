import { Router } from 'express'
import { userService } from '../../domain/services/index.js'
import { billingService } from '../../domain/services/billing.service.js'
import { authMiddleware } from '../middleware/auth.middleware.js'
import { userRepository } from '../../infrastructure/repositories/user.repository.js'
import { avatarUpload, getAvatarUrl, deleteAvatarFile } from '../middleware/upload.middleware.js'
import { logger } from '../../infrastructure/logger/logger.js'
import { db } from '../../infrastructure/database/connection.js'
import type { PublicProfile } from '@the-box/types'

const router = Router()

// Public profile — no auth. Exposes a deliberately minimal subset of user
// data plus recent completed sessions so players can link-share their profile
// (and their friends can visit it without logging in).
router.get('/public/:username', async (req, res, next) => {
  try {
    const username = req.params.username
    if (!username || username.length < 3) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_USERNAME', message: 'Invalid username' },
      })
    }

    const user = await userRepository.findByUsername(username)
    if (!user || user.isGuest) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      })
    }

    const recentRows = await db('game_sessions')
      .where('user_id', user.id)
      .andWhere('is_completed', true)
      .orderBy('completed_at', 'desc')
      .limit(5)
      .select<Array<{
        id: string
        total_score: number
        completed_at: Date | null
        daily_challenge_id: number
      }>>('id', 'total_score', 'completed_at', 'daily_challenge_id')

    const challengeIds = recentRows.map((r) => r.daily_challenge_id)
    const challengeRows = challengeIds.length
      ? await db('daily_challenges')
          .whereIn('id', challengeIds)
          .select<Array<{ id: number; challenge_date: string }>>(
            'id',
            db.raw('challenge_date::text as challenge_date')
          )
      : []
    const dateById = new Map(challengeRows.map((c) => [c.id, c.challenge_date]))

    const gamesPlayedRow = await db('game_sessions')
      .where('user_id', user.id)
      .andWhere('is_completed', true)
      .count<{ count: string }[]>('id as count')
      .first()
    const gamesPlayed = Number(gamesPlayedRow?.count ?? 0)

    const badgeRows = await db('user_inventory')
      .where('user_id', user.id)
      .andWhere('item_type', 'badge')
      .andWhere('quantity', '>', 0)
      .select<Array<{ item_key: string; quantity: number }>>('item_key', 'quantity')

    const profile: PublicProfile = {
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      totalScore: user.totalScore,
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak ?? 0,
      gamesPlayed,
      badges: badgeRows.map((r) => ({ key: r.item_key, quantity: r.quantity })),
      recentSessions: recentRows.map((r) => ({
        sessionId: r.id,
        challengeDate: dateById.get(r.daily_challenge_id) ?? '',
        totalScore: r.total_score,
        completedAt: r.completed_at ? r.completed_at.toISOString() : null,
      })),
    }

    res.json({ success: true, data: profile })
  } catch (error) {
    next(error)
  }
})

// Get current user's profile with stats
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const user = await userRepository.findById(req.userId!)

    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      })
    }

    res.json({
      success: true,
      data: user,
    })
  } catch (error) {
    next(error)
  }
})

// Get user's daily game history
router.get('/history', authMiddleware, async (req, res, next) => {
  try {
    // Premium users get the extended catch-up window in their missed
    // challenges list, so the UI surfaces playable archive entries
    // without the user having to know a deep-link challenge ID.
    const isPremium = await billingService.isPremium(req.userId!)
    const data = await userService.getGameHistory(req.userId!, isPremium)

    res.json({
      success: true,
      data,
    })
  } catch (error) {
    next(error)
  }
})

// Get detailed game session information
router.get('/history/:sessionId', authMiddleware, async (req, res, next) => {
  try {
    const { sessionId } = req.params
    if (!sessionId || Array.isArray(sessionId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_SESSION_ID', message: 'Invalid session ID' },
      })
    }
    const data = await userService.getGameSessionDetails(sessionId, req.userId!)

    res.json({
      success: true,
      data,
    })
  } catch (error) {
    next(error)
  }
})

// Upload avatar
router.post('/avatar', authMiddleware, avatarUpload.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_FILE', message: 'No file uploaded' },
      })
    }

    // Get current user to check for existing avatar
    const currentUser = await userRepository.findById(req.userId!)
    const oldAvatarUrl = currentUser?.avatarUrl

    // Update user with new avatar URL
    const avatarUrl = getAvatarUrl(req.file.filename)
    const updatedUser = await userRepository.updateAvatarUrl(req.userId!, avatarUrl)

    // Delete old avatar file if it exists and is a local upload
    if (oldAvatarUrl) {
      await deleteAvatarFile(oldAvatarUrl)
    }

    logger.info({ userId: req.userId, avatarUrl }, 'avatar uploaded')

    res.json({
      success: true,
      data: updatedUser,
    })
  } catch (error) {
    next(error)
  }
})

// Update email marketing consent. Opt-in only — the checkbox on
// signup/settings posts here to record the user's explicit choice.
router.put('/email-consent', authMiddleware, async (req, res, next) => {
  try {
    const { consent } = req.body ?? {}
    if (typeof consent !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_CONSENT', message: 'consent must be a boolean' },
      })
    }

    const updated = await userRepository.updateEmailMarketingConsent(req.userId!, consent)
    if (!updated) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      })
    }

    logger.info({ userId: req.userId, consent }, 'email consent updated')

    res.json({ success: true, data: updated })
  } catch (error) {
    next(error)
  }
})

// Delete avatar
router.delete('/avatar', authMiddleware, async (req, res, next) => {
  try {
    // Get current user to check for existing avatar
    const currentUser = await userRepository.findById(req.userId!)
    const oldAvatarUrl = currentUser?.avatarUrl

    // Remove avatar URL from user
    const updatedUser = await userRepository.updateAvatarUrl(req.userId!, null)

    // Delete old avatar file if it exists
    if (oldAvatarUrl) {
      await deleteAvatarFile(oldAvatarUrl)
    }

    logger.info({ userId: req.userId }, 'avatar deleted')

    res.json({
      success: true,
      data: updatedUser,
    })
  } catch (error) {
    next(error)
  }
})

export default router
