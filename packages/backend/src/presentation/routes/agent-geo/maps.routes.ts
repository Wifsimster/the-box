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

// GET /games/:gameId/maps — every candidate map fetched for a game, active or
// not (issue #331, phase 5), so an agent can pick the canonical one and
// reject wrong-game/prop maps. Mirrors the admin geo-fetch curation panel.
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

// POST /games/:gameId/maps — manual map upload (issue #331, phase 5). The
// last-resort content path when the ingestion tiers didn't produce a usable
// map: the agent supplies a map image URL it has verified and hosts itself,
// declares its pixel dimensions and license/attribution, and we record a
// `source = 'manual'` geo_map row. Mirrors the admin "Tier 3 manual map upload"
// (`POST /api/admin/geo/maps/manual`) exactly — no server-side image
// processing, the agent is responsible for hosting the asset somewhere stable
// and for the license claim. Lands DISABLED by default (an admin or the agent
// enables/selects it via the existing select endpoint); pass `enable: true` to
// enable it immediately. Bounded by its own per-key daily budget.
const uploadMapBodySchema = z.object({
  imageUrl: z.string().url().max(1000),
  widthPx: z.coerce.number().int().positive().max(32_768),
  heightPx: z.coerce.number().int().positive().max(32_768),
  license: z.string().trim().min(1).max(100),
  attribution: z.string().trim().max(500).optional(),
  sourceUrl: z.string().url().max(1000).optional(),
  consensusRadius: z.coerce.number().min(0.001).max(1).optional(),
  region: z.string().trim().min(1).max(100).optional(),
  // Enable (and select, via enableForGame) the map immediately instead of
  // leaving it disabled for later curation. Defaults to false.
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
        // (game_id, image_url) is unique — a repeat upload of the same URL is a
        // clean 409, not a 500. Any other DB error propagates.
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
        // enableForGame promotes the row to selected only when no other map
        // holds the zone — i.e. this upload just became the capture-default. In
        // that case move the game's still-open candidates onto it so a later
        // promote doesn't strand them on an old map (issue #345, feature 2).
        if (enabled?.isSelected && enabled.zoneSlug == null) {
          repointed = await geoScreenshotRepository.repointPendingCandidates(gameId, map.id)
        }
      }

      // A usable map now exists — clear the map-tier ingest tombstones so a
      // future ingest tick isn't short-circuited by a stale circuit-breaker.
      // Mirrors the admin manual-upload path (clears the fetch tiers, not the
      // metadata tombstone).
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

// POST /games/:gameId/maps/:mapId/select — promote a candidate map to
// canonical (issue #331, phase 5). This is the operator fix for wrong-game
// maps today: an agent can inspect `geo_list_maps` and pick the correct one.
// Mirrors the admin geo-fetch `/maps/:mapId/select` handler exactly (enable
// then select), attributing `selectedBy` to the agent key.
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

      // Selecting a new single-zone map makes it the game's capture-default, so
      // move the game's still-open candidates onto it — otherwise they stay
      // stranded on the old (now-disabled) map and promoting one would build a
      // broken challenge (issue #345, feature 2). Zoned selections don't change
      // the capture-default, so they don't re-point.
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

// POST /games/:gameId/maps/:mapId/reject — disable a wrong-game/prop map
// (issue #331, phase 5). Reuses `disableForGame`, which refuses to leave a
// game with zero enabled maps — an agent must select a replacement canonical
// map (or a good map already exists) before rejecting the last bad one.
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

// POST /games/:gameId/maps/:mapId/repoint-captures — move the game's still-open
// (active, un-promoted) capture candidates onto `mapId` (issue #345, feature
// 2). The auto-repoint baked into `select`/`upload` only fixes swaps made
// THROUGH the agent surface from now on; this is the explicit fix for captures
// that were already stranded on a rejected map (e.g. GTA:SA #38, GTA:VC #69,
// Ocarina #200 still pointing at maps 30 / 29 / 18). `mapId` must be an ENABLED
// map for the game — re-pointing captures onto a disabled map would just strand
// them again. Promoted metas are left untouched. Reuses the map-action budget.
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
