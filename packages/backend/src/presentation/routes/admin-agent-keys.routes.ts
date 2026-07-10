import { Router } from 'express'
import { z } from 'zod'
import { GEO_AGENT_SCOPES, type ApiKeyCreated, type ApiKeySummary } from '@the-box/types'
import { adminMiddleware } from '../middleware/auth.middleware.js'
import { validateBody, validateParams } from '../middleware/validation.middleware.js'
import { recordAdminGeoAudit } from '../middleware/admin-audit.js'
import { apiKeyRepository } from '../../infrastructure/repositories/api-key.repository.js'
import { logger } from '../../infrastructure/logger/logger.js'

// Admin-only management of geo-agent API keys (issue #331, phase 2). Distinct
// from the streamer self-service key surface (streamer-keys.routes.ts): those
// keys are user-minted and reach a streamer's own public data; these are minted
// by an admin, carry ONLY geo-agent:* scopes, and reach the agent content-
// sourcing surface (/api/agent/v1/geo). The two scope families are mutually
// exclusive on a single key — enforced here at mint time and re-checked by
// requireScope on every agent route.
//
// Mounted at /api/admin/agent-keys behind adminMiddleware. Every mint/revoke is
// written to admin_audit_log.

const router = Router()
router.use(adminMiddleware)

const log = logger.child({ router: 'admin-agent-keys' })

// A mint may request any non-empty subset of the geo-agent scopes. Default to
// read-only: ingest/propose are granted deliberately per key as phases 3–4
// ship, so a freshly minted key can never write until an admin opts it in.
const scopeEnum = z.enum(GEO_AGENT_SCOPES)
const createSchema = z.object({
  label: z.string().trim().min(1).max(64),
  mode: z.enum(['live', 'test']).default('live'),
  scopes: z.array(scopeEnum).nonempty().max(GEO_AGENT_SCOPES.length).optional(),
})

// Cap active agent keys so a mistake or a compromised admin session can't mint
// an unbounded fleet. Generous for the "one exploration key + one steady-state
// key + spare" shape.
const MAX_ACTIVE_AGENT_KEYS = 10

router.get('/', async (_req, res, next) => {
  try {
    const keys = await apiKeyRepository.listGeoAgentKeys()
    const data: ApiKeySummary[] = keys.map(apiKeyRepository.mapRow)
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

router.post('/', validateBody(createSchema), async (req, res, next) => {
  try {
    const adminId = req.userId!
    const body = req.body as z.infer<typeof createSchema>

    const active = await apiKeyRepository.listGeoAgentKeys()
    if (active.filter((k) => k.is_active).length >= MAX_ACTIVE_AGENT_KEYS) {
      res.status(400).json({
        success: false,
        error: {
          code: 'TOO_MANY_KEYS',
          message: 'Revoke an existing agent key before minting a new one',
        },
      })
      return
    }

    // De-dupe requested scopes; default to read-only. Zod already guarantees
    // every entry is a geo-agent scope, so mutual exclusion with streamer
    // scopes holds by construction.
    const scopes = body.scopes ? [...new Set(body.scopes)] : ['geo-agent:read' as const]

    const { row, plaintext } = await apiKeyRepository.create({
      userId: adminId,
      label: body.label,
      mode: body.mode,
      scopes,
    })

    await recordAdminGeoAudit(req, {
      action: 'agent_key.mint',
      target: { kind: 'api_key', id: row.id },
      after: { label: row.label, mode: row.mode, scopes: row.scopes },
    })
    log.info({ adminId, keyId: row.id, scopes: row.scopes }, 'geo-agent key minted')

    const payload: ApiKeyCreated = { ...apiKeyRepository.mapRow(row), plaintext }
    res.status(201).json({ success: true, data: payload })
  } catch (err) {
    next(err)
  }
})

const idParams = z.object({ id: z.coerce.number().int().positive() })

router.delete('/:id', validateParams(idParams), async (req, res, next) => {
  try {
    const { id } = req.params as unknown as z.infer<typeof idParams>
    const ok = await apiKeyRepository.revokeGeoAgentKey(id)
    if (!ok) {
      // Either no such geo-agent key, or it was already revoked. A uniform
      // 404 keeps this admin path from probing non-agent key ids.
      res.status(404).json({ success: false, error: { code: 'KEY_NOT_FOUND' } })
      return
    }
    await recordAdminGeoAudit(req, {
      action: 'agent_key.revoke',
      target: { kind: 'api_key', id },
    })
    log.info({ adminId: req.userId, keyId: id }, 'geo-agent key revoked')
    res.json({ success: true, data: { ok: true } })
  } catch (err) {
    next(err)
  }
})

export default router
