import { Router } from 'express'
import {
  billingService,
  playerStatsService,
  userService,
} from '../../composition/services.js'
import { authMiddleware } from '../middleware/auth.middleware.js'
import { requirePremium } from '../middleware/require-premium.middleware.js'
import { userRepository } from '../../infrastructure/repositories/user.repository.js'
import { gdprRepository } from '../../infrastructure/repositories/gdpr.repository.js'
import { isDisplayNameSafe } from '../../domain/services/display-name-safety.js'
import { avatarUpload, getAvatarUrl, deleteAvatarFile } from '../middleware/upload.middleware.js'
import { logger } from '../../infrastructure/logger/logger.js'
import { db } from '../../infrastructure/database/connection.js'
import { getStripe, isStripeConfigured } from '../../infrastructure/stripe/stripe.client.js'
import { PREMIUM_THEME_KEYS, DEFAULT_THEME_KEY, isValidThemeKey } from '../../config/themes.js'

const router = Router()

// Public profile — no auth. Exposes a deliberately minimal subset of user
// data plus recent completed sessions so players can link-share their profile
// (and their friends can visit it without logging in).
router.get('/public/:username', async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
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

    const profile = await playerStatsService.getPublicProfile(user)

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
  res.setHeader('Cache-Control', 'no-store')
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
  res.setHeader('Cache-Control', 'no-store')
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
    res.json({ success: true, data: await playerStatsService.getAdvancedStats(req.userId!) })
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

// ===== RGPD Art. 16: right to rectification =====
//
// Lets the caller correct their own display name and/or username. At least
// one field must be present. Validation mirrors registration: display names
// pass the safety gate, usernames are alnum/underscore 3–20 and globally
// unique. `display_username` is kept in sync by the repository.
router.put('/profile', authMiddleware, async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as { displayName?: unknown; username?: unknown }
    const fields: { displayName?: string; username?: string } = {}

    if (body.displayName !== undefined) {
      if (typeof body.displayName !== 'string') {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_DISPLAY_NAME', message: 'displayName must be a string' },
        })
      }
      const trimmed = body.displayName.trim()
      if (trimmed.length < 1 || trimmed.length > 32 || !isDisplayNameSafe(trimmed)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_DISPLAY_NAME', message: 'Display name is invalid' },
        })
      }
      fields.displayName = trimmed
    }

    if (body.username !== undefined) {
      if (typeof body.username !== 'string' || !/^[a-zA-Z0-9_]{3,20}$/.test(body.username)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_USERNAME', message: 'Username is invalid' },
        })
      }
      // Uniqueness: a row with this username belonging to someone else blocks it.
      const existing = await userRepository.findByUsername(body.username)
      if (existing && existing.id !== req.userId) {
        return res.status(409).json({
          success: false,
          error: { code: 'USERNAME_TAKEN', message: 'This username is already taken' },
        })
      }
      fields.username = body.username
    }

    if (fields.displayName === undefined && fields.username === undefined) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_FIELDS', message: 'At least one field is required' },
      })
    }

    const updated = await userRepository.updateProfile(req.userId!, fields)
    if (!updated) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      })
    }

    logger.info({ userId: req.userId, fields }, 'user profile updated')
    res.json({ success: true, data: updated })
  } catch (error) {
    next(error)
  }
})

// ===== RGPD Art. 15 & 20: data access / portability =====
//
// Streams the full export object as a downloadable JSON attachment. The
// repository excludes all secret material (push keys, api-key/webhook
// hashes, auth credentials). Deliberately NOT wrapped in the usual
// {success,data} envelope — it's a file, not an API payload.
router.get('/export', authMiddleware, async (req, res, next) => {
  try {
    const data = await gdprRepository.exportUserData(req.userId!)
    const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    res.setHeader('Content-Type', 'application/json')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="the-box-data-export-${date}.json"`
    )
    res.setHeader('Cache-Control', 'no-store')
    logger.info({ userId: req.userId }, 'user data exported')
    res.send(JSON.stringify(data, null, 2))
  } catch (error) {
    next(error)
  }
})

// ===== RGPD Art. 17: right to erasure (self-service) =====
//
// Hard-deletes the caller's account after a typed-username confirmation.
// CASCADE foreign keys remove sessions, accounts, and all game/geo data —
// the same mechanism the admin delete path relies on.
router.delete('/account', authMiddleware, async (req, res, next) => {
  try {
    const { confirmUsername } = (req.body ?? {}) as { confirmUsername?: unknown }

    const user = await userRepository.findById(req.userId!)
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      })
    }

    if (typeof confirmUsername !== 'string' || confirmUsername !== user.username) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CONFIRMATION_MISMATCH',
          message: 'Username confirmation does not match',
        },
      })
    }

    // Block deletion while a live recurring subscription is still billing, so
    // we never orphan an active subscription in Stripe (the user row — and its
    // stripe_customer_id — is about to be hard-deleted). Supporter-lifetime
    // (source 'supporter') is one-time and doesn't block; a subscription
    // already set to cancel at period end doesn't either, since the cleanup
    // below cancels the remainder.
    const entitlement = await billingService.getEntitlement(req.userId!)
    if (
      entitlement.source === 'subscription' &&
      entitlement.isPremium &&
      !entitlement.cancelAtPeriodEnd
    ) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'SUBSCRIPTION_ACTIVE',
          message:
            'Cancel your active subscription in the billing portal before deleting your account.',
        },
      })
    }

    // Capture the Stripe customer id before the row (and the id with it) is
    // deleted so the cleanup below can remove the customer.
    const stripeCustomerId = await userRepository.getStripeCustomerId(req.userId!)

    // CASCADE removes sessions / accounts / game data, mirroring the admin
    // delete path. The cascaded `session` rows are enough to log the user out.
    await db('user').where('id', req.userId).del()

    logger.info({ userId: req.userId }, 'user self-deleted account')

    // Best-effort Stripe customer cleanup. Done after the DB delete so a Stripe
    // outage can't block account deletion; deleting the customer also cancels
    // any lingering (cancel-at-period-end) subscription. Log-and-continue on
    // failure — the account is already gone and a stale Stripe customer is
    // harmless (and re-reconciled via the customer.deleted webhook otherwise).
    if (stripeCustomerId && isStripeConfigured()) {
      try {
        await getStripe().customers.del(stripeCustomerId)
        logger.info(
          { userId: req.userId, stripeCustomerId },
          'stripe customer deleted after account deletion',
        )
      } catch (err) {
        logger.error(
          { userId: req.userId, stripeCustomerId, err: String(err) },
          'failed to delete stripe customer after account deletion',
        )
      }
    }

    res.json({ success: true, data: { deleted: true } })
  } catch (error) {
    next(error)
  }
})

export default router
