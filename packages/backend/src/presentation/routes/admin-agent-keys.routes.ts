import { Router } from 'express'
import { z } from 'zod'
import { AGENT_KEY_SCOPES, type ApiKeyCreated, type ApiKeySummary } from '@the-box/types'
import { adminMiddleware } from '../middleware/auth.middleware.js'
import { validateBody, validateParams } from '../middleware/validation.middleware.js'
import { recordAdminGeoAudit } from '../middleware/admin-audit.js'
import { apiKeyRepository } from '../../infrastructure/repositories/api-key.repository.js'
import { logger } from '../../infrastructure/logger/logger.js'

const router = Router()
router.use(adminMiddleware)

const log = logger.child({ router: 'admin-agent-keys' })

const scopeEnum = z.enum(AGENT_KEY_SCOPES)
const createSchema = z.object({
  label: z.string().trim().min(1).max(64),
  mode: z.enum(['live', 'test']).default('live'),
  scopes: z.array(scopeEnum).nonempty().max(AGENT_KEY_SCOPES.length).optional(),
})

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
