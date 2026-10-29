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
import type { CountryCode } from '@the-box/types'
import { parseCountryInput } from './country-input.js'
import {
  avatarUploadSingle,
  avatarsPath,
  getAvatarUrl,
  deleteAvatarFile,
} from '../middleware/upload.middleware.js'
import { createAvatarUploadHandler } from './avatar-upload.handler.js'
import { normalizeAvatarImage } from '../../infrastructure/images/avatar-image.js'
import { logger } from '../../infrastructure/logger/logger.js'
import { getStripe, isStripeConfigured } from '../../infrastructure/stripe/stripe.client.js'
import { PREMIUM_THEME_KEYS, DEFAULT_THEME_KEY, isValidThemeKey } from '../../config/themes.js'

const router = Router()

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

router.get('/history', authMiddleware, async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  try {
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

router.post(
  '/avatar',
  authMiddleware,
  avatarUploadSingle,
  createAvatarUploadHandler({
    avatarsDir: avatarsPath,
    normalizeImage: normalizeAvatarImage,
    findCurrentAvatarUrl: async (userId) => (await userRepository.findById(userId))?.avatarUrl,
    updateAvatarUrl: (userId, avatarUrl) => userRepository.updateAvatarUrl(userId, avatarUrl),
    deleteAvatarFile,
    toAvatarUrl: getAvatarUrl,
    onUploaded: (userId, avatarUrl) => logger.info({ userId, avatarUrl }, 'avatar uploaded'),
  })
)

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

router.delete('/avatar', authMiddleware, async (req, res, next) => {
  try {
    const currentUser = await userRepository.findById(req.userId!)
    const oldAvatarUrl = currentUser?.avatarUrl

    const updatedUser = await userRepository.updateAvatarUrl(req.userId!, null)

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

router.get('/advanced-stats', authMiddleware, requirePremium, async (req, res, next) => {
  try {
    res.json({ success: true, data: await playerStatsService.getAdvancedStats(req.userId!) })
  } catch (error) {
    next(error)
  }
})

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

router.put('/profile', authMiddleware, async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as { displayName?: unknown; username?: unknown; country?: unknown }
    const fields: { displayName?: string; username?: string; country?: CountryCode | null } = {}

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
      const existing = await userRepository.findByUsername(body.username)
      if (existing && existing.id !== req.userId) {
        return res.status(409).json({
          success: false,
          error: { code: 'USERNAME_TAKEN', message: 'This username is already taken' },
        })
      }
      fields.username = body.username
    }

    if (body.country !== undefined) {
      const parsed = parseCountryInput(body.country)
      if (!parsed.ok) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_COUNTRY', message: 'country must be an ISO 3166-1 alpha-2 code or null' },
        })
      }
      fields.country = parsed.country
    }

    if (fields.displayName === undefined && fields.username === undefined && fields.country === undefined) {
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

router.get('/export', authMiddleware, async (req, res, next) => {
  try {
    const data = await gdprRepository.exportUserData(req.userId!)
    const date = new Date().toISOString().slice(0, 10)
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

    const stripeCustomerId = await userRepository.getStripeCustomerId(req.userId!)

    await userRepository.deleteAccount(req.userId!)

    logger.info({ userId: req.userId }, 'user self-deleted account')

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
