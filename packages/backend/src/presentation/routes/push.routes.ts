import { Router } from 'express'
import type { Request } from 'express'
import { z } from 'zod'
import { env } from '../../config/env.js'
import { pushSubscriptionRepository } from '../../infrastructure/repositories/index.js'
import { pushService } from '../../domain/services/push.service.js'
import { authMiddleware } from '../middleware/auth.middleware.js'
import { validateBody } from '../middleware/validation.middleware.js'
import { createRateLimiter } from '../middleware/rate-limit.middleware.js'

const router = Router()

// Maximum active push subscriptions per user. A typical user has 1–3 (phone +
// laptop ± work browser); the cap is generous enough not to bother real
// users while preventing a session-authed attacker from bloating the table
// with bogus endpoints to amplify fan-out load.
const MAX_ACTIVE_DEVICES_PER_USER = 20

// Per-session rate limit on the write endpoints. Keyed by user when an
// authenticated session is present (cheaper than IP for legit users behind
// shared NAT), falling back to IP for the public vapid-public-key route.
const userKey = (req: Request): string => req.userId ?? req.ip ?? 'unknown'
const subscribeLimiter = createRateLimiter({ windowMs: 60_000, max: 10, key: userKey })
const unsubscribeLimiter = createRateLimiter({ windowMs: 60_000, max: 30, key: userKey })

// Public: the frontend needs the VAPID public key to call
// PushManager.subscribe(applicationServerKey: ...). Returns 503 when push is
// not configured so the client can hide the opt-in UI cleanly instead of
// surfacing a parse error.
router.get('/vapid-public-key', (_req, res) => {
  if (!pushService.isConfigured()) {
    res.status(503).json({
      success: false,
      error: { code: 'PUSH_NOT_CONFIGURED', message: 'web push not configured' },
    })
    return
  }
  res.json({ success: true, data: { publicKey: env.VAPID_PUBLIC_KEY } })
})

// Hostnames operated by the major browser push providers. We restrict
// `endpoint` to these so an attacker who has a valid session can't register
// arbitrary URLs (e.g. attacker-controlled hosts) that would turn the
// fan-out worker into an authenticated outbound webhook generator. The list
// reflects the public push services as of 2026; new browsers/providers go
// here when they ship.
const ALLOWED_PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^updates-autopush\.stage\.mozaws\.net$/,
  /\.notify\.windows\.com$/,
  /\.push\.apple\.com$/,
  /^web\.push\.apple\.com$/,
]

function isAllowedPushEndpoint(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  return ALLOWED_PUSH_HOSTS.some((pattern) => pattern.test(url.hostname))
}

const subscribeBodySchema = z.object({
  endpoint: z
    .string()
    .url()
    .max(2000)
    .refine(isAllowedPushEndpoint, {
      message: 'endpoint host is not an allowed push provider',
    }),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(50),
  }),
  userAgent: z.string().max(500).optional(),
})

router.post(
  '/subscribe',
  authMiddleware,
  subscribeLimiter,
  validateBody(subscribeBodySchema),
  async (req, res, next) => {
    try {
      const userId = req.userId!
      const body = req.body as z.infer<typeof subscribeBodySchema>
      // Cap check only applies to genuinely-new endpoints. An existing row
      // (same browser re-subscribing, or the same endpoint moving between
      // accounts on this device) goes through the upsert path and replaces
      // in place, so it doesn't count toward the cap.
      const existing = await pushSubscriptionRepository.findByEndpoint(body.endpoint)
      if (!existing) {
        const activeCount = await pushSubscriptionRepository.countActiveForUser(userId)
        if (activeCount >= MAX_ACTIVE_DEVICES_PER_USER) {
          res.status(429).json({
            success: false,
            error: {
              code: 'PUSH_DEVICE_CAP_REACHED',
              message: `at most ${MAX_ACTIVE_DEVICES_PER_USER} active devices per user`,
            },
          })
          return
        }
      }
      const row = await pushSubscriptionRepository.upsert({
        userId,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: body.userAgent,
      })
      res.json({ success: true, data: { id: row.id, isActive: row.is_active } })
    } catch (err) {
      next(err)
    }
  },
)

const unsubscribeBodySchema = z.object({
  endpoint: z.string().url().max(2000),
})

// DELETE with a body (RFC 9110 allows it, Express + JSON parser handle it).
// We accept the endpoint in the body rather than a query param because the
// endpoint URL can be long and contains a per-device token we'd rather not
// log via access logs that capture the request line.
router.delete(
  '/subscribe',
  authMiddleware,
  unsubscribeLimiter,
  validateBody(unsubscribeBodySchema),
  async (req, res, next) => {
    try {
      const userId = req.userId!
      const body = req.body as z.infer<typeof unsubscribeBodySchema>
      const removed = await pushSubscriptionRepository.deleteByEndpoint(body.endpoint, userId)
      res.json({ success: true, data: { removed } })
    } catch (err) {
      next(err)
    }
  },
)

export default router
