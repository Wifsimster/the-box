import { Router } from 'express'
import { z } from 'zod'
import type { GeoGameNeedingContent } from '@the-box/types'
import {
  requireAgentCurateEnabled,
  requireScope,
} from '../../middleware/agent-api.middleware.js'
import { validateBody, validateQuery } from '../../middleware/validation.middleware.js'
import {
  geoScreenshotRepository,
} from '../../../infrastructure/repositories/index.js'
import { geoIngestFailureRepository } from '../../../infrastructure/repositories/geo-ingest-failure.repository.js'
import { adminAuditRepository } from '../../../infrastructure/repositories/admin-audit.repository.js'
import { gameRepository } from '../../../infrastructure/repositories/game.repository.js'
import {
  pinsToNextConsensusThreshold,
} from '../../../domain/services/geo-consensus.service.js'
import { getGeoGamersHealthSnapshot } from '../../../infrastructure/geogamers-health.js'
import {
  consumeEnrollBudget,
} from '../../../infrastructure/redis/agent-budget.js'
import { env } from '../../../config/env.js'
import { limitQuery } from './shared.js'

const router = Router()

router.get('/health', requireScope('geo-agent:read'), async (_req, res, next) => {
  try {
    const data = await getGeoGamersHealthSnapshot()
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

router.get(
  '/games-needing-content',
  requireScope('geo-agent:read'),
  validateQuery(limitQuery),
  async (req, res, next) => {
    try {
      const { limit } = req.query as unknown as z.infer<typeof limitQuery>
      const rows = await geoScreenshotRepository.listGamesNeedingContent(limit ?? 25)
      const data: GeoGameNeedingContent[] = rows.map((r) => ({
        ...r,
        pinsToNextThreshold: pinsToNextConsensusThreshold(r.topPinCount),
      }))
      res.json({ success: true, data })
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/games',
  requireScope('geo-agent:read'),
  validateQuery(limitQuery),
  async (req, res, next) => {
    try {
      const { limit } = req.query as unknown as z.infer<typeof limitQuery>
      const data = await geoScreenshotRepository.listGeoCatalog(limit ?? 200)
      res.json({ success: true, data })
    } catch (err) {
      next(err)
    }
  },
)

const enrollBodySchema = z
  .object({
    gameId: z.coerce.number().int().positive().optional(),
    rawgId: z.coerce.number().int().positive().optional(),
  })
  .refine((d) => d.gameId !== undefined || d.rawgId !== undefined, {
    message: 'gameId or rawgId is required',
  })

interface RawgGameDetail {
  id: number
  slug: string
  name: string
  released: string | null
  background_image: string | null
  metacritic: number | null
  developers?: Array<{ name: string }>
  publishers?: Array<{ name: string }>
  genres?: Array<{ name: string }>
  platforms?: Array<{ platform: { name: string } }>
}

async function fetchRawgGameDetail(rawgId: number): Promise<RawgGameDetail | null> {
  if (!env.RAWG_API_KEY) return null
  const res = await fetch(`https://api.rawg.io/api/games/${rawgId}?key=${env.RAWG_API_KEY}`, {
    headers: { 'User-Agent': 'the-box-geo-agent-enroll/1.0' },
  })
  if (!res.ok) return null
  return (await res.json()) as RawgGameDetail
}

router.post(
  '/games',
  requireScope('geo-agent:curate'),
  requireAgentCurateEnabled,
  validateBody(enrollBodySchema),
  async (req, res, next) => {
    try {
      const { gameId: bodyGameId, rawgId } = req.body as z.infer<typeof enrollBodySchema>
      const keyId = req.apiKey!.id

      const maxPerDay = Number(env.GEO_AGENT_MAX_ENROLLS_PER_DAY) || 5
      const budget = await consumeEnrollBudget(keyId, maxPerDay)
      if (!budget.ok) {
        res.setHeader('Retry-After', String(budget.resetSeconds))
        res.status(429).json({
          success: false,
          error: {
            code: 'BUDGET_EXHAUSTED',
            message: `Daily enroll budget of ${budget.limit} reached; resets at UTC midnight`,
          },
        })
        return
      }

      let game = bodyGameId
        ? await gameRepository.findById(bodyGameId)
        : await gameRepository.findByRawgId(rawgId!)
      let created = false

      if (!game && bodyGameId) {
        res.status(404).json({ success: false, error: { code: 'GAME_NOT_FOUND' } })
        return
      }

      if (!game && rawgId) {
        const detail = await fetchRawgGameDetail(rawgId)
        if (!detail) {
          res.status(400).json({
            success: false,
            error: { code: 'RAWG_LOOKUP_FAILED', message: 'could not resolve rawgId via RAWG' },
          })
          return
        }
        game = await gameRepository.create({
          name: detail.name,
          slug: detail.slug,
          releaseYear: detail.released ? parseInt(detail.released.slice(0, 4), 10) : undefined,
          developer: detail.developers?.[0]?.name,
          publisher: detail.publishers?.[0]?.name,
          genres: detail.genres?.map((g) => g.name),
          platforms: detail.platforms?.map((p) => p.platform.name),
          coverImageUrl: detail.background_image ?? undefined,
          metacritic: detail.metacritic ?? undefined,
          rawgId: detail.id,
        })
        created = true
      }

      const update: Record<string, unknown> = { geo_curated: true, geo_metadata_status: 'pending' }
      await gameRepository.updateGeoColumns(game!.id, update)
      await geoIngestFailureRepository.clear(game!.id, 'metadata')

      await adminAuditRepository.record({
        adminId: `apikey:${keyId}`,
        action: 'geo-agent.enroll_game',
        targetKind: 'game',
        targetId: String(game!.id),
        after: { gameId: game!.id, rawgId: rawgId ?? game!.rawgId ?? null, created },
        ip: req.ip ?? null,
      })

      res.json({
        success: true,
        data: {
          gameId: game!.id,
          name: game!.name,
          created,
          curated: true,
          budget: { used: budget.used, limit: budget.limit, remaining: budget.remaining },
        },
      })
    } catch (err) {
      next(err)
    }
  },
)

export default router
