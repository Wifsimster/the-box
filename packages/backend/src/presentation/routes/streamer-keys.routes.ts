import { Router } from 'express'
import { z } from 'zod'
import { authMiddleware } from '../middleware/auth.middleware.js'
import { validateBody, validateParams } from '../middleware/validation.middleware.js'
import { apiKeyRepository } from '../../infrastructure/repositories/api-key.repository.js'
import { db } from '../../infrastructure/database/connection.js'
import { logger } from '../../infrastructure/logger/logger.js'
import type { ApiKeyCreated, ApiKeySummary } from '@the-box/types'

// Private-session routes for the Streamer Kit settings page. Owners:
//   - flip their public_profile_enabled toggle
//   - claim a public_slug
//   - mint / list / revoke their own API keys
//
// Lives under /api/streamer-keys/* — NOT under /api/public/v1, because these
// are session-authenticated, not key-authenticated. Behind the same Better
// Auth wall as the rest of the private surface.

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

    // Empty slug while opting in is allowed: the user can flip the toggle on,
    // pick a slug later. But opting in WITHOUT a slug means nobody can find
    // them via the public API — that's fine, it's an opt-in to the model,
    // not a commitment to a handle.
    const update: Record<string, unknown> = {
      public_profile_enabled: body.publicProfileEnabled,
    }
    if (body.publicSlug !== undefined) {
      update['public_slug'] = body.publicSlug?.toLowerCase() ?? null
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

export default router
