import { Router } from 'express'
import { z } from 'zod'
import { env } from '../../config/env.js'
import { pushSubscriptionRepository } from '../../infrastructure/repositories/index.js'
import { pushService } from '../../domain/services/push.service.js'
import { authMiddleware } from '../middleware/auth.middleware.js'
import { validateBody } from '../middleware/validation.middleware.js'

const router = Router()

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

router.post('/subscribe', authMiddleware, validateBody(subscribeBodySchema), async (req, res, next) => {
  try {
    const userId = req.userId!
    const body = req.body as z.infer<typeof subscribeBodySchema>
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
})

const unsubscribeBodySchema = z.object({
  endpoint: z.string().url().max(2000),
})

// DELETE with a body (RFC 9110 allows it, Express + JSON parser handle it).
// We accept the endpoint in the body rather than a query param because the
// endpoint URL can be long and contains a per-device token we'd rather not
// log via access logs that capture the request line.
router.delete('/subscribe', authMiddleware, validateBody(unsubscribeBodySchema), async (req, res, next) => {
  try {
    const userId = req.userId!
    const body = req.body as z.infer<typeof unsubscribeBodySchema>
    const removed = await pushSubscriptionRepository.deleteByEndpoint(body.endpoint, userId)
    res.json({ success: true, data: { removed } })
  } catch (err) {
    next(err)
  }
})

export default router
