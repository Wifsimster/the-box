import { Router } from 'express'
import {
  billingService,
} from '../../../composition/services.js'
import { userRepository } from '../../../infrastructure/repositories/user.repository.js'
import { routeLogger } from '../../../infrastructure/logger/logger.js'
import { sendPremiumGrantedEmail } from '../../../infrastructure/email/premium-granted-email.js'
import { emitUserPremiumGranted } from '../../../infrastructure/socket/socket.js'

const router = Router()

// === Users billing (premium status + admin grant/revoke) ===
//
// Better-auth's /admin/list-users only knows about the `user` table, so the
// admin UI fetches billing entitlement separately for the visible page. The
// grant/revoke endpoints flip `supporter_lifetime_at` directly — they do not
// touch Stripe, so they're safe even if billing is misconfigured. Supporter
// lifetime takes priority over recurring subs in `getEntitlement`, so a
// granted user stays premium even if they later cancel a paid subscription.

router.get('/users/billing', async (req, res, next) => {
  try {
    const raw = typeof req.query['userIds'] === 'string' ? req.query['userIds'] : ''
    const userIds = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (userIds.length === 0) {
      res.json({ success: true, data: { entitlements: {} } })
      return
    }
    if (userIds.length > 100) {
      res.status(400).json({
        success: false,
        error: { code: 'TOO_MANY_IDS', message: 'max 100 user ids' },
      })
      return
    }

    const entries = await Promise.all(
      userIds.map(async (id) => {
        const entitlement = await billingService.getEntitlement(id)
        return [id, entitlement] as const
      }),
    )
    const entitlements = Object.fromEntries(entries)
    res.json({ success: true, data: { entitlements } })
  } catch (err) {
    next(err)
  }
})

router.post('/users/:userId/grant-supporter', async (req, res, next) => {
  try {
    const userId = req.params['userId']
    if (!userId) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_USER_ID', message: 'userId required' },
      })
      return
    }
    const grantedAt = new Date()
    const newlyGranted = await userRepository.grantSupporterLifetime(userId, grantedAt)
    const entitlement = await billingService.getEntitlement(userId)
    routeLogger.warn(
      { adminId: req.userId, targetUserId: userId, newlyGranted },
      'admin granted supporter lifetime',
    )

    // Fire one-shot notifications only on the transition from non-premium →
    // premium so a duplicate grant click doesn't re-spam the user.
    if (newlyGranted) {
      emitUserPremiumGranted({
        userId,
        tier: 'supporter_lifetime',
        grantedAt: grantedAt.toISOString(),
      })

      const target = await userRepository.findById(userId)
      if (target?.email && !target.isGuest) {
        // Don't block the admin response on the mail provider; failures are
        // already captured in `email_log` by the sendEmail chokepoint.
        void sendPremiumGrantedEmail({
          userId,
          to: target.email,
          displayName: target.displayName ?? target.username,
        }).catch((err) => {
          routeLogger.warn(
            { err, targetUserId: userId },
            'premium-granted email send failed',
          )
        })
      }
    }

    res.json({ success: true, data: { entitlement } })
  } catch (err) {
    next(err)
  }
})

router.post('/users/:userId/revoke-supporter', async (req, res, next) => {
  try {
    const userId = req.params['userId']
    if (!userId) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_USER_ID', message: 'userId required' },
      })
      return
    }
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : 'admin manual revoke'
    await userRepository.revokeSupporterLifetime(userId, reason)
    const entitlement = await billingService.getEntitlement(userId)
    routeLogger.warn(
      { adminId: req.userId, targetUserId: userId },
      'admin revoked supporter lifetime',
    )
    res.json({ success: true, data: { entitlement } })
  } catch (err) {
    next(err)
  }
})

export default router
