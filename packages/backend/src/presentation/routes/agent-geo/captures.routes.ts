import { Router } from 'express'
import { z } from 'zod'
import {
  requireAgentCurateEnabled,
  requireScope,
} from '../../middleware/agent-api.middleware.js'
import { validateBody, validateParams, validateQuery } from '../../middleware/validation.middleware.js'
import {
  geoScreenshotRepository,
  geoMapRepository,
} from '../../../infrastructure/repositories/index.js'
import { adminAuditRepository } from '../../../infrastructure/repositories/admin-audit.repository.js'
import { gameRepository } from '../../../infrastructure/repositories/game.repository.js'
import { CAPTURE_TARGET_CANDIDATES } from '../../../domain/services/geo-metadata.service.js'
import { importRawgScreenshots } from '../../../infrastructure/queue/workers/geo-rawg-import-logic.js'
import { db } from '../../../infrastructure/database/connection.js'
import {
  consumeCaptureImportBudget,
} from '../../../infrastructure/redis/agent-budget.js'
import { env } from '../../../config/env.js'
import { limitQuery, gameIdParams } from './shared.js'

const router = Router()

// have ground truth); rejected ones are already excluded by the repo.
router.get(
  '/games/:gameId/candidates',
  requireScope('geo-agent:read'),
  validateParams(gameIdParams),
  validateQuery(limitQuery),
  async (req, res, next) => {
    try {
      const { gameId } = req.params as unknown as z.infer<typeof gameIdParams>
      const { limit } = req.query as unknown as z.infer<typeof limitQuery>
      const [maps, candidates] = await Promise.all([
        geoMapRepository.listEnabledByGameId(gameId),
        geoScreenshotRepository.listCandidatesForReview({ gameId, limit: limit ?? 50 }),
      ])
      // Only captures still awaiting a canonical pin are actionable for the
      // agent. `listCandidatesForReview` already drops rejected (is_active=false)
      // rows; filter out promoted here.
      const actionable = candidates.filter((c) => c.status !== 'promoted')
      res.json({ success: true, data: { maps, candidates: actionable } })
    } catch (err) {
      next(err)
    }
  },
)

// POST /games/:gameId/captures — top up an enrolled game's candidates
// (issue #331, phase 5). Reuses the existing RAWG importer (the same
// function the ingest tick calls) rather than duplicating its dedup/tombstone
// logic; also accepts an explicit `imageUrls` list for manual/gameplay
// captures (problem #4 in the issue — RAWG's promo shots are often not
// geolocatable). Requires the game to already have an enabled map to attach
// captures to. Bounded by a per-key daily budget.
const importCapturesBodySchema = z
  .object({
    targetCount: z.coerce.number().int().positive().max(CAPTURE_TARGET_CANDIDATES).optional(),
    imageUrls: z.array(z.string().url()).max(50).optional(),
  })
  .refine((d) => d.imageUrls === undefined || d.imageUrls.length > 0, {
    message: 'imageUrls must be non-empty when provided',
  })

router.post(
  '/games/:gameId/captures',
  requireScope('geo-agent:curate'),
  requireAgentCurateEnabled,
  validateParams(gameIdParams),
  validateBody(importCapturesBodySchema),
  async (req, res, next) => {
    try {
      const { gameId } = req.params as unknown as z.infer<typeof gameIdParams>
      const { targetCount, imageUrls } = req.body as z.infer<typeof importCapturesBodySchema>
      const keyId = req.apiKey!.id

      const maxPerDay = Number(env.GEO_AGENT_MAX_CAPTURE_IMPORTS_PER_DAY) || 10
      const budget = await consumeCaptureImportBudget(keyId, maxPerDay)
      if (!budget.ok) {
        res.setHeader('Retry-After', String(budget.resetSeconds))
        res.status(429).json({
          success: false,
          error: {
            code: 'BUDGET_EXHAUSTED',
            message: `Daily capture-import budget of ${budget.limit} reached; resets at UTC midnight`,
          },
        })
        return
      }

      const map =
        (await geoMapRepository.findCaptureDefaultByGameId(gameId)) ??
        (await geoMapRepository.findFirstEnabledByGameId(gameId))
      if (!map) {
        res.status(409).json({
          success: false,
          error: { code: 'NO_ACTIVE_MAP', message: 'game has no enabled map to attach captures to' },
        })
        return
      }

      let result: { fetched: number; inserted: number; skipped: number }
      if (imageUrls && imageUrls.length > 0) {
        // createCandidate's (source, external_id) unique constraint already
        // dedupes at the DB level; check first so the response can report an
        // honest inserted/skipped split instead of always reporting insert.
        let inserted = 0
        let skipped = 0
        for (const imageUrl of imageUrls) {
          const externalId = `manual:${gameId}:${imageUrl}`
          const existing = await db('geo_screenshot_candidate')
            .where({ source: 'manual', external_id: externalId })
            .first<{ id: number }>()
          if (existing) {
            skipped++
            continue
          }
          await geoScreenshotRepository.createCandidate({
            gameId,
            geoMapId: map.id,
            imageUrl,
            source: 'manual',
            externalId,
          })
          inserted++
        }
        result = { fetched: imageUrls.length, inserted, skipped }
      } else {
        const game = await gameRepository.findById(gameId)
        if (!game?.rawgId) {
          res.status(409).json({
            success: false,
            error: {
              code: 'NO_RAWG_ID',
              message: 'game has no rawgId to import from; pass imageUrls instead',
            },
          })
          return
        }
        result = await importRawgScreenshots({
          gameId,
          geoMapId: map.id,
          rawgId: game.rawgId,
          maxItems: targetCount ?? CAPTURE_TARGET_CANDIDATES,
        })
      }

      await adminAuditRepository.record({
        adminId: `apikey:${keyId}`,
        action: 'geo-agent.import_captures',
        targetKind: 'game',
        targetId: String(gameId),
        after: { ...result, mapId: map.id, manual: !!imageUrls },
        ip: req.ip ?? null,
      })

      res.json({
        success: true,
        data: { gameId, mapId: map.id, ...result, budget: { used: budget.used, limit: budget.limit, remaining: budget.remaining } },
      })
    } catch (err) {
      next(err)
    }
  },
)

export default router
