import { Router } from 'express'
import { z } from 'zod'
import { authMiddleware } from '../middleware/auth.middleware.js'
import { validateBody, validateParams } from '../middleware/validation.middleware.js'
import { apiKeyRepository } from '../../infrastructure/repositories/api-key.repository.js'
import { webhookRepository } from '../../infrastructure/repositories/webhook.repository.js'
import { validateWebhookUrl } from '../../domain/services/webhook-signer.service.js'
import { isReservedSlug } from '../../domain/services/sandbox.service.js'
import { env } from '../../config/env.js'
import { db } from '../../infrastructure/database/connection.js'
import { logger } from '../../infrastructure/logger/logger.js'
import type {
  ApiKeyCreated,
  ApiKeySummary,
  PublicEventType,
  WebhookCreated,
  WebhookSummary,
} from '@the-box/types'

// Private-session routes for the Streamer Kit settings page. Owners:
//   - flip their public_profile_enabled toggle
//   - claim a public_slug
//   - mint / list / revoke their own API keys
//   - register / list / revoke webhooks
//
// Lives under /api/streamer-keys/* — NOT under /api/public/v1, because these
// are session-authenticated, not key-authenticated. Behind the same Better
// Auth wall as the rest of the private surface. The webhook endpoints here
// and the key-authed ones under /api/public/v1/webhooks share one repository.

const router = Router()

router.use(authMiddleware)

const log = logger.child({ router: 'streamer-keys' })

const SLUG_RE = /^[a-z0-9_-]{3,32}$/

// ─────────────────────────────────────────────────────────────────────
// GET /api/streamer-keys/me — current settings + key list
// ─────────────────────────────────────────────────────────────────────
router.get('/me', async (req, res, next) => {
  try {
    const userId = req.userId!
    const userRow = await db('user')
      .where('id', userId)
      .select<{ public_profile_enabled: boolean; public_slug: string | null }>(
        'public_profile_enabled',
        'public_slug'
      )
      .first()
    const keys = await apiKeyRepository.findByUser(userId)
    const summaries: ApiKeySummary[] = keys.map(apiKeyRepository.mapRow)
    res.json({
      success: true,
      data: {
        publicProfileEnabled: userRow?.public_profile_enabled ?? false,
        publicSlug: userRow?.public_slug ?? null,
        keys: summaries,
      },
    })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// PUT /api/streamer-keys/settings — toggle profile + claim slug
// ─────────────────────────────────────────────────────────────────────
const settingsSchema = z.object({
  publicProfileEnabled: z.boolean(),
  publicSlug: z
    .string()
    .regex(SLUG_RE, 'Slug must be 3-32 chars [a-z0-9_-]')
    .nullable()
    .optional(),
})

router.put('/settings', validateBody(settingsSchema), async (req, res, next) => {
  try {
    const userId = req.userId!
    const body = req.body as z.infer<typeof settingsSchema>

    // Reserved slugs (`boxbot` and friends) can't be claimed — the public
    // routes short-circuit `boxbot` to the sandbox simulation, so a real
    // user owning it would be permanently shadowed.
    const requestedSlug = body.publicSlug?.toLowerCase() ?? null
    if (requestedSlug && isReservedSlug(requestedSlug)) {
      res.status(409).json({
        success: false,
        error: { code: 'SLUG_RESERVED', message: 'That slug is reserved' },
      })
      return
    }

    // Empty slug while opting in is allowed: the user can flip the toggle on,
    // pick a slug later. But opting in WITHOUT a slug means nobody can find
    // them via the public API — that's fine, it's an opt-in to the model,
    // not a commitment to a handle.
    const update: Record<string, unknown> = {
      public_profile_enabled: body.publicProfileEnabled,
    }
    if (body.publicSlug !== undefined) {
      update['public_slug'] = requestedSlug
    }

    try {
      await db('user').where('id', userId).update(update)
    } catch (err) {
      // Postgres unique-violation on public_slug — surface a clean 409.
      const code = (err as { code?: string })?.code
      if (code === '23505') {
        res.status(409).json({
          success: false,
          error: { code: 'SLUG_TAKEN', message: 'That slug is already taken' },
        })
        return
      }
      throw err
    }

    res.json({ success: true, data: { ok: true } })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// POST /api/streamer-keys — mint a new key
// ─────────────────────────────────────────────────────────────────────
const createKeySchema = z.object({
  label: z.string().trim().min(1).max(64),
  mode: z.enum(['live', 'test']).default('live'),
})

router.post('/', validateBody(createKeySchema), async (req, res, next) => {
  try {
    const userId = req.userId!
    const body = req.body as z.infer<typeof createKeySchema>

    // Cap the number of live keys per user. 10 is generous for the
    // "OBS + Streamer.bot + Nightbot + spare" use case and stops a
    // compromised session from minting an effectively unlimited fleet.
    const existing = await apiKeyRepository.findByUser(userId)
    const liveCount = existing.filter((k) => k.is_active && k.mode === 'live').length
    if (body.mode === 'live' && liveCount >= 10) {
      res.status(400).json({
        success: false,
        error: { code: 'TOO_MANY_KEYS', message: 'Revoke an existing key before creating a new one' },
      })
      return
    }

    const { row, plaintext } = await apiKeyRepository.create({
      userId,
      label: body.label,
      mode: body.mode,
    })
    log.info({ userId, keyId: row.id, mode: row.mode }, 'api key minted')

    const payload: ApiKeyCreated = {
      ...apiKeyRepository.mapRow(row),
      plaintext,
    }
    res.status(201).json({ success: true, data: payload })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// DELETE /api/streamer-keys/:id — revoke
// ─────────────────────────────────────────────────────────────────────
const idParamsSchema = z.object({ id: z.coerce.number().int().positive() })

router.delete('/:id', validateParams(idParamsSchema), async (req, res, next) => {
  try {
    const userId = req.userId!
    const { id } = req.params as unknown as z.infer<typeof idParamsSchema>
    const owned = await apiKeyRepository.findOwnedById(userId, id)
    if (!owned) {
      res.status(404).json({ success: false, error: { code: 'KEY_NOT_FOUND' } })
      return
    }
    const ok = await apiKeyRepository.revoke(id, userId)
    if (!ok) {
      res.status(409).json({ success: false, error: { code: 'ALREADY_REVOKED' } })
      return
    }
    log.info({ userId, keyId: id }, 'api key revoked')
    res.json({ success: true, data: { ok: true } })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// Webhooks — session-authed CRUD for the settings page. Same repository
// and SSRF guard as the key-authed /api/public/v1/webhooks endpoints;
// the only difference is the auth method (session cookie here, bearer
// key there).
// ─────────────────────────────────────────────────────────────────────

const WEBHOOK_EVENTS: PublicEventType[] = [
  'session.started',
  'session.completed',
  'screenshot.scored',
  'rank.changed',
]

router.get('/webhooks', async (req, res, next) => {
  try {
    const rows = await webhookRepository.findByUser(req.userId!)
    const data: WebhookSummary[] = rows.map(webhookRepository.mapWebhook)
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

const createWebhookSchema = z.object({
  url: z.string().url().max(2048),
  label: z.string().trim().min(1).max(64),
  events: z
    .array(z.enum(WEBHOOK_EVENTS as [PublicEventType, ...PublicEventType[]]))
    .max(16)
    .default([]),
})

router.post('/webhooks', validateBody(createWebhookSchema), async (req, res, next) => {
  try {
    const userId = req.userId!
    const body = req.body as z.infer<typeof createWebhookSchema>

    const validation = validateWebhookUrl(body.url, env.API_URL)
    if (!validation.ok) {
      res.status(400).json({
        success: false,
        error: { code: validation.code ?? 'INVALID_URL', message: 'URL rejected by SSRF guard' },
      })
      return
    }

    const existing = await webhookRepository.findByUser(userId)
    if (existing.filter((w) => w.is_active).length >= 10) {
      res.status(400).json({
        success: false,
        error: { code: 'TOO_MANY_WEBHOOKS', message: 'Revoke an existing webhook first' },
      })
      return
    }

    const { row, secret } = await webhookRepository.create({
      userId,
      url: body.url,
      label: body.label,
      events: body.events,
    })
    log.info({ userId, webhookId: row.id }, 'webhook registered')

    const payload: WebhookCreated = { ...webhookRepository.mapWebhook(row), secret }
    res.status(201).json({ success: true, data: payload })
  } catch (err) {
    next(err)
  }
})

router.delete('/webhooks/:id', validateParams(idParamsSchema), async (req, res, next) => {
  try {
    const userId = req.userId!
    const { id } = req.params as unknown as z.infer<typeof idParamsSchema>
    const owned = await webhookRepository.findOwnedById(userId, id)
    if (!owned) {
      res.status(404).json({ success: false, error: { code: 'WEBHOOK_NOT_FOUND' } })
      return
    }
    const ok = await webhookRepository.revoke(id, userId)
    if (!ok) {
      res.status(409).json({ success: false, error: { code: 'ALREADY_REVOKED' } })
      return
    }
    log.info({ userId, webhookId: id }, 'webhook revoked')
    res.json({ success: true, data: { ok: true } })
  } catch (err) {
    next(err)
  }
})

export default router
