import { Router, type Request, type Response } from 'express'
import { geoIngestFailureRepository } from '../../../infrastructure/repositories/index.js'
import { z } from 'zod'
import {
  requireAgentCurateEnabled,
  requireScope,
} from '../../middleware/agent-api.middleware.js'
import { validateBody, validateParams } from '../../middleware/validation.middleware.js'
import {
  geoScreenshotRepository,
  geoMapRepository,
} from '../../../infrastructure/repositories/index.js'
import { adminAuditRepository } from '../../../infrastructure/repositories/admin-audit.repository.js'
import { gameRepository } from '../../../infrastructure/repositories/game.repository.js'
import {
  RUNNABLE_TIERS,
} from '../../../infrastructure/queue/workers/geo-ingest-tick-logic.js'
import {
  consumeMapActionBudget,
  consumeMapUploadBudget,
} from '../../../infrastructure/redis/agent-budget.js'
import { env } from '../../../config/env.js'
import { gameIdParams } from './shared.js'

const router = Router()

router.get(
  '/games/:gameId/maps',
  requireScope('geo-agent:read'),
  validateParams(gameIdParams),
  async (req, res, next) => {
    try {
      const { gameId } = req.params as unknown as z.infer<typeof gameIdParams>
      const maps = await geoMapRepository.listCandidatesByGameId(gameId)
      res.json({ success: true, data: { maps } })
    } catch (err) {
      next(err)
    }
  },
)

const uploadMapBodySchema = z.object({
  imageUrl: z.string().url().max(1000),
  widthPx: z.coerce.number().int().positive().max(32_768),
  heightPx: z.coerce.number().int().positive().max(32_768),
  license: z.string().trim().min(1).max(100),
  attribution: z.string().trim().max(500).optional(),
  sourceUrl: z.string().url().max(1000).optional(),
  consensusRadius: z.coerce.number().min(0.001).max(1).optional(),
  region: z.string().trim().min(1).max(100).optional(),
  enable: z.boolean().optional(),
})

router.post(
  '/games/:gameId/maps',
  requireScope('geo-agent:curate'),
  requireAgentCurateEnabled,
  validateParams(gameIdParams),
  validateBody(uploadMapBodySchema),
  async (req, res, next) => {
    try {
      const { gameId } = req.params as unknown as z.infer<typeof gameIdParams>
      const body = req.body as z.infer<typeof uploadMapBodySchema>
      const keyId = req.apiKey!.id

      const maxPerDay = Number(env.GEO_AGENT_MAX_MAP_UPLOADS_PER_DAY) || 10
      const budget = await consumeMapUploadBudget(keyId, maxPerDay)
      if (!budget.ok) {
        res.setHeader('Retry-After', String(budget.resetSeconds))
        res.status(429).json({
          success: false,
          error: {
            code: 'BUDGET_EXHAUSTED',
            message: `Daily map-upload budget of ${budget.limit} reached; resets at UTC midnight`,
          },
        })
        return
      }

      const game = await gameRepository.findById(gameId)
      if (!game) {
        res.status(404).json({ success: false, error: { code: 'GAME_NOT_FOUND' } })
        return
      }

      let map
      try {
        map = await geoMapRepository.create({
          gameId,
          source: 'manual',
          sourceUrl: body.sourceUrl,
          imageUrl: body.imageUrl,
          widthPx: body.widthPx,
          heightPx: body.heightPx,
          license: body.license,
          attribution: body.attribution,
          consensusRadius: body.consensusRadius,
          region: body.region,
          isActive: !!body.enable,
        })
      } catch (err) {
        if (err && typeof err === 'object' && (err as { code?: string }).code === '23505') {
          res.status(409).json({
            success: false,
            error: { code: 'DUPLICATE_MAP', message: 'a map with this image URL already exists for the game' },
          })
          return
        }
        throw err
      }

      let repointed = 0
      if (body.enable) {
        const enabled = await geoMapRepository.enableForGame(gameId, map.id)
        if (enabled?.isSelected && enabled.zoneSlug == null) {
          repointed = await geoScreenshotRepository.repointPendingCandidates(gameId, map.id)
        }
      }

      await geoIngestFailureRepository.clearSources(gameId, RUNNABLE_TIERS)

      await adminAuditRepository.record({
        adminId: `apikey:${keyId}`,
        action: 'geo-agent.upload_map',
        targetKind: 'geo_map',
        targetId: String(map.id),
        after: {
          gameId,
          source: 'manual',
          imageUrl: body.imageUrl,
          sourceUrl: body.sourceUrl ?? null,
          license: body.license,
          enabled: !!body.enable,
          repointedCandidates: repointed,
        },
        ip: req.ip ?? null,
      })

      res.json({
        success: true,
        data: {
          map,
          repointedCandidates: repointed,
          budget: { used: budget.used, limit: budget.limit, remaining: budget.remaining },
        },
      })
    } catch (err) {
      next(err)
    }
  },
)

const mapIdParams = z.object({
  gameId: z.coerce.number().int().positive(),
  mapId: z.coerce.number().int().positive(),
})

async function consumeMapActionOrReject(
  req: Request,
  res: Response,
): Promise<{ ok: true; budget: { used: number; limit: number; remaining: number } } | { ok: false }> {
  const keyId = req.apiKey!.id
  const maxPerDay = Number(env.GEO_AGENT_MAX_MAP_ACTIONS_PER_DAY) || 30
  const budget = await consumeMapActionBudget(keyId, maxPerDay)
  if (!budget.ok) {
    res.setHeader('Retry-After', String(budget.resetSeconds))
    res.status(429).json({
      success: false,
      error: {
        code: 'BUDGET_EXHAUSTED',
        message: `Daily map-action budget of ${budget.limit} reached; resets at UTC midnight`,
      },
    })
    return { ok: false }
  }
  return { ok: true, budget: { used: budget.used, limit: budget.limit, remaining: budget.remaining } }
}

router.post(
  '/games/:gameId/maps/:mapId/select',
  requireScope('geo-agent:curate'),
  requireAgentCurateEnabled,
  validateParams(mapIdParams),
  async (req, res, next) => {
    try {
      const { gameId, mapId } = req.params as unknown as z.infer<typeof mapIdParams>
      const budgetResult = await consumeMapActionOrReject(req, res)
      if (!budgetResult.ok) return

      const target = await geoMapRepository.findById(mapId)
      if (!target || target.gameId !== gameId) {
        res.status(404).json({ success: false, error: { code: 'MAP_NOT_FOUND' } })
        return
      }
      if (!target.isSelected) {
        await geoMapRepository.enableForGame(gameId, mapId)
      }
      const updated = await geoMapRepository.selectMap(gameId, mapId, `apikey:${req.apiKey!.id}`)
      if (!updated) {
        res.status(409).json({ success: false, error: { code: 'SELECT_FAILED' } })
        return
      }

      const repointed =
        updated.zoneSlug == null
          ? await geoScreenshotRepository.repointPendingCandidates(gameId, mapId)
          : 0

      await adminAuditRepository.record({
        adminId: `apikey:${req.apiKey!.id}`,
        action: 'geo-agent.select_map',
        targetKind: 'geo_map',
        targetId: String(mapId),
        after: { gameId, mapId, repointedCandidates: repointed },
        ip: req.ip ?? null,
      })

      res.json({
        success: true,
        data: { map: updated, repointedCandidates: repointed, budget: budgetResult.budget },
      })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/games/:gameId/maps/:mapId/reject',
  requireScope('geo-agent:curate'),
  requireAgentCurateEnabled,
  validateParams(mapIdParams),
  async (req, res, next) => {
    try {
      const { gameId, mapId } = req.params as unknown as z.infer<typeof mapIdParams>
      const budgetResult = await consumeMapActionOrReject(req, res)
      if (!budgetResult.ok) return

      const result = await geoMapRepository.disableForGame(gameId, mapId)
      if (!result.ok) {
        const status = result.reason === 'NOT_FOUND' ? 404 : 409
        res.status(status).json({ success: false, error: { code: result.reason } })
        return
      }

      await adminAuditRepository.record({
        adminId: `apikey:${req.apiKey!.id}`,
        action: 'geo-agent.reject_map',
        targetKind: 'geo_map',
        targetId: String(mapId),
        after: { gameId, mapId },
        ip: req.ip ?? null,
      })

      res.json({ success: true, data: { map: result.map, budget: budgetResult.budget } })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/games/:gameId/maps/:mapId/repoint-captures',
  requireScope('geo-agent:curate'),
  requireAgentCurateEnabled,
  validateParams(mapIdParams),
  async (req, res, next) => {
    try {
      const { gameId, mapId } = req.params as unknown as z.infer<typeof mapIdParams>
      const budgetResult = await consumeMapActionOrReject(req, res)
      if (!budgetResult.ok) return

      const target = await geoMapRepository.findEnabledById(gameId, mapId)
      if (!target) {
        res.status(404).json({
          success: false,
          error: {
            code: 'MAP_NOT_FOUND',
            message: 'no such enabled map for this game (enable/select it first)',
          },
        })
        return
      }

      const repointed = await geoScreenshotRepository.repointPendingCandidates(gameId, mapId)

      await adminAuditRepository.record({
        adminId: `apikey:${req.apiKey!.id}`,
        action: 'geo-agent.repoint_captures',
        targetKind: 'game',
        targetId: String(gameId),
        after: { gameId, mapId, repointedCandidates: repointed },
        ip: req.ip ?? null,
      })

      res.json({
        success: true,
        data: { gameId, mapId, repointedCandidates: repointed, budget: budgetResult.budget },
      })
    } catch (err) {
      next(err)
    }
  },
)

export default router
