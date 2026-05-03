import { Router } from 'express'
import { userService } from '../../domain/services/index.js'
import { billingService } from '../../domain/services/billing.service.js'
import { authMiddleware } from '../middleware/auth.middleware.js'
import { requirePremium } from '../middleware/require-premium.middleware.js'
import { userRepository } from '../../infrastructure/repositories/user.repository.js'
import { avatarUpload, getAvatarUrl, deleteAvatarFile } from '../middleware/upload.middleware.js'
import { logger } from '../../infrastructure/logger/logger.js'
import { db } from '../../infrastructure/database/connection.js'
import { PREMIUM_THEME_KEYS, DEFAULT_THEME_KEY, isValidThemeKey } from '../../config/themes.js'
import type { AdvancedStats, PublicProfile } from '@the-box/types'

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

// ===== Premium-only: advanced profile stats =====
//
// Aggregates over the caller's completed daily sessions only; catch-up
// sessions are excluded so the numbers line up with the leaderboard view
// rather than counting practice runs as ranked play. Single endpoint
// returning everything the AdvancedStatsPanel renders so the panel does
// one round-trip on mount instead of a fan-out per stat.
router.get('/advanced-stats', authMiddleware, requirePremium, async (req, res, next) => {
  try {
    const userId = req.userId!

    // Score aggregates across completed, non-catch-up daily sessions.
    const scoreRow = await db('game_sessions')
      .where({ user_id: userId, is_completed: true, is_catch_up: false })
      .select<{
        best: string | null
        avg: string | null
        total: string | null
        perfect: string | null
      }>(
        db.raw('MAX(total_score) as best'),
        db.raw('AVG(total_score) as avg'),
        db.raw('COUNT(*) as total'),
        db.raw('COUNT(*) FILTER (WHERE total_score = 2000) as perfect'),
      )
      .first()

    // Solve-time percentiles + mean over correct guesses, joined to the
    // user's tier sessions so we don't pick up other players' guesses.
    const timeRow = await db('guesses')
      .join('tier_sessions', 'guesses.tier_session_id', 'tier_sessions.id')
      .join('game_sessions', 'tier_sessions.game_session_id', 'game_sessions.id')
      .where('game_sessions.user_id', userId)
      .andWhere('game_sessions.is_completed', true)
      .andWhere('game_sessions.is_catch_up', false)
      .andWhere('guesses.is_correct', true)
      .select<{
        p25: string | null
        median: string | null
        p75: string | null
        mean: string | null
      }>(
        db.raw(
          'PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY guesses.time_taken_ms) as p25',
        ),
        db.raw(
          'PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY guesses.time_taken_ms) as median',
        ),
        db.raw(
          'PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY guesses.time_taken_ms) as p75',
        ),
        db.raw('AVG(guesses.time_taken_ms) as mean'),
      )
      .first()

    // Hint usage: per-type counts. Filter to the four hint types we
    // surface in the matrix; "free" entries (no power_up_used) are
    // ignored. Same join shape as the time aggregation.
    const hintRows = await db('guesses')
      .join('tier_sessions', 'guesses.tier_session_id', 'tier_sessions.id')
      .join('game_sessions', 'tier_sessions.game_session_id', 'game_sessions.id')
      .where('game_sessions.user_id', userId)
      .whereIn('guesses.power_up_used', [
        'hint_year',
        'hint_publisher',
        'hint_developer',
        'hint_genre',
      ])
      .groupBy('guesses.power_up_used')
      .select<Array<{ power_up_used: string; count: string }>>(
        'guesses.power_up_used',
        db.raw('COUNT(*) as count'),
      )

    const hintUsage = {
      hint_year: 0,
      hint_publisher: 0,
      hint_developer: 0,
      hint_genre: 0,
    }
    for (const row of hintRows) {
      const key = row.power_up_used as keyof typeof hintUsage
      if (key in hintUsage) hintUsage[key] = Number(row.count)
    }

    // Last-six-months progression. Bucketing on completed_at gives the
    // calendar months the user actually finished sessions in; an empty
    // month is omitted (the panel decides whether to fill gaps).
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
    sixMonthsAgo.setDate(1)
    sixMonthsAgo.setHours(0, 0, 0, 0)

    const monthlyRows = await db('game_sessions')
      .where({ user_id: userId, is_completed: true, is_catch_up: false })
      .andWhere('completed_at', '>=', sixMonthsAgo)
      .groupByRaw("to_char(date_trunc('month', completed_at), 'YYYY-MM')")
      .orderByRaw("to_char(date_trunc('month', completed_at), 'YYYY-MM') ASC")
      .select<Array<{ month: string; total: string; sessions: string }>>(
        db.raw("to_char(date_trunc('month', completed_at), 'YYYY-MM') as month"),
        db.raw('SUM(total_score) as total'),
        db.raw('COUNT(*) as sessions'),
      )

    const user = await userRepository.findById(userId)
    const stats: AdvancedStats = {
      bestScore: Number(scoreRow?.best ?? 0),
      averageScore: Math.round(Number(scoreRow?.avg ?? 0)),
      totalCompletedSessions: Number(scoreRow?.total ?? 0),
      perfectSessions: Number(scoreRow?.perfect ?? 0),
      solveTimeMs: {
        p25: Math.round(Number(timeRow?.p25 ?? 0)),
        median: Math.round(Number(timeRow?.median ?? 0)),
        p75: Math.round(Number(timeRow?.p75 ?? 0)),
        mean: Math.round(Number(timeRow?.mean ?? 0)),
      },
      hintUsage,
      monthlyScores: monthlyRows.map((r) => ({
        month: r.month,
        totalScore: Number(r.total),
        sessionCount: Number(r.sessions),
      })),
      streaks: {
        current: user?.currentStreak ?? 0,
        longest: user?.longestStreak ?? 0,
      },
    }

    res.json({ success: true, data: stats })
  } catch (error) {
    next(error)
  }
})

// ===== Premium-only: UI theme switch =====
//
// Free users can only set `default`. Anything else needs an active
// entitlement; we 402 to let the frontend route to the upsell modal,
// matching how `requirePremium` behaves on other gated endpoints.
// Validation against the catalog happens here rather than relying on
// a Postgres enum so adding a theme stays a code-only change.
router.put('/theme', authMiddleware, async (req, res, next) => {
  try {
    const { theme } = (req.body ?? {}) as { theme?: unknown }
    if (!isValidThemeKey(theme)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_THEME', message: 'Unknown theme key' },
      })
      return
    }
    if (theme !== DEFAULT_THEME_KEY) {
      const isPremium = await billingService.isPremium(req.userId!)
      if (!isPremium) {
        res.status(402).json({
          success: false,
          error: {
            code: 'PREMIUM_REQUIRED',
            message: 'This theme requires The Box Premium',
          },
        })
        return
      }
      // Belt-and-braces: theme must be in the premium catalog. Catches a
      // future bug where someone adds a key to VALID_KEYS without putting
      // it in either default or PREMIUM_THEME_KEYS.
      if (!(PREMIUM_THEME_KEYS as readonly string[]).includes(theme)) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_THEME', message: 'Theme not in catalog' },
        })
        return
      }
    }
    const updated = await userRepository.updateSelectedTheme(req.userId!, theme)
    if (!updated) {
      res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      })
      return
    }
    logger.info({ userId: req.userId, theme }, 'theme updated')
    res.json({ success: true, data: updated })
  } catch (error) {
    next(error)
  }
})

export default router
