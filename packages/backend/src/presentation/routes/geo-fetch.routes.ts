import { Router } from 'express'
import { gameRepository } from '../../infrastructure/repositories/index.js'
import { z } from 'zod'
import { adminMiddleware } from '../middleware/auth.middleware.js'
import { recordAdminGeoAudit } from '../middleware/admin-audit.js'
import { routeLogger } from '../../infrastructure/logger/logger.js'
import { geoQueue, type GeoJobData } from '../../infrastructure/queue/queues.js'
import { geoPipelineStateRepository } from '../../infrastructure/repositories/geo-pipeline-state.repository.js'
import { geoIngestAttemptRepository } from '../../infrastructure/repositories/geo-ingest-attempt.repository.js'
import { geoSourceConfigRepository } from '../../infrastructure/repositories/geo-source-config.repository.js'
import { geoMapRepository } from '../../infrastructure/repositories/geo-map.repository.js'
import { reset as resetCircuitBreaker } from '../../infrastructure/redis/circuit-breaker.js'
import {
  emitGeoFetchStarted,
  emitGeoFetchMapSelected,
} from '../../infrastructure/socket/socket.js'

const log = routeLogger.child({ route: 'geo-fetch' })
const router = Router()

router.use(adminMiddleware)

router.get('/status', async (_req, res, next) => {
  try {
    const stageCounts = await geoPipelineStateRepository.countByStage()
    const counts: Record<string, number> = {
      queued: 0,
      fetching_map: 0,
      fetching_candidates: 0,
      awaiting_curation: 0,
      ready: 0,
      blocked: 0,
    }
    for (const row of stageCounts) {
      counts[row.current_stage] = Number(row.count)
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    res.json({ success: true, data: { counts, total } })
  } catch (err) {
    next(err)
  }
})

const listQuerySchema = z.object({
  stage: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})

router.get('/games', async (req, res, next) => {
  try {
    const q = listQuerySchema.parse(req.query)
    const { rows, total } = await geoPipelineStateRepository.listPaged({
      stage: q.stage,
      search: q.search,
      limit: q.limit,
      offset: q.offset,
    })
    res.json({
      success: true,
      data: {
        games: rows,
        limit: q.limit,
        offset: q.offset,
        total,
        hasMore: q.offset + rows.length < total,
      },
    })
  } catch (err) {
    next(err)
  }
})

const GEO_FETCH_MAX_START_GAMES = 1000

const startSchema = z.object({
  gameIds: z.array(z.number().int().positive()).max(GEO_FETCH_MAX_START_GAMES).optional(),
  all: z.boolean().optional(),
})

router.post('/start', async (req, res, next) => {
  try {
    const body = startSchema.parse(req.body)
    let gameIds = body.gameIds ?? []
    let truncated = false
    if (body.all) {
      gameIds = await gameRepository.findGeoIngestEligibleIds()
      if (gameIds.length > GEO_FETCH_MAX_START_GAMES) {
        gameIds = gameIds.slice(0, GEO_FETCH_MAX_START_GAMES)
        truncated = true
      }
    }
    if (gameIds.length === 0) {
      res.status(400).json({ success: false, error: { code: 'NO_GAMES', message: 'no games to start' } })
      return
    }

    for (const gameId of gameIds) {
      await geoPipelineStateRepository.upsert({
        gameId,
        currentStage: 'queued',
        activeSource: null,
        nextEligibleAt: null,
      })
      await geoQueue.add(
        'maps:pipeline',
        { kind: 'maps:pipeline', gameId } as GeoJobData,
        { jobId: `maps-pipeline-start-${gameId}-${Date.now()}` },
      )
    }
    emitGeoFetchStarted({ totalGames: gameIds.length })
    log.info(
      { totalGames: gameIds.length, truncated, adminId: req.userId },
      'geo-fetch started',
    )
    await recordAdminGeoAudit(req, {
      action: 'geo-fetch.start',
      target: { kind: 'global' },
      after: { totalGames: gameIds.length, truncated, all: !!body.all },
    })
    res.json({
      success: true,
      data: { totalGames: gameIds.length, truncated, cap: GEO_FETCH_MAX_START_GAMES },
    })
  } catch (err) {
    next(err)
  }
})

router.post('/cancel', async (req, res, next) => {
  try {
    const isMapsJob = (job: { name?: string }) =>
      typeof job.name === 'string' && job.name.startsWith('maps:')

    const [waiting, delayed] = await Promise.all([
      geoQueue.getWaiting(0, 10_000),
      geoQueue.getDelayed(0, 10_000),
    ])
    const targets = [...waiting, ...delayed].filter(isMapsJob)
    let removed = 0
    for (const job of targets) {
      try {
        await job.remove()
        removed++
      } catch {
      }
    }
    log.warn(
      { mapsJobsRemoved: removed, totalSnapshot: targets.length, adminId: req.userId },
      'geo-fetch cancelled (scoped to maps:* only)',
    )
    await recordAdminGeoAudit(req, {
      action: 'geo-fetch.cancel',
      target: { kind: 'global' },
      after: { mapsJobsRemoved: removed },
    })
    res.json({ success: true, data: { removed } })
  } catch (err) {
    next(err)
  }
})

const gameIdParam = z.object({ gameId: z.coerce.number().int().positive() })

router.get('/:gameId', async (req, res, next) => {
  try {
    const { gameId } = gameIdParam.parse(req.params)
    const state = await geoPipelineStateRepository.findByGameId(gameId)
    const recentAttempts = await geoIngestAttemptRepository.listForGame(gameId, 20)
    res.json({ success: true, data: { state, recentAttempts } })
  } catch (err) {
    next(err)
  }
})

router.post('/:gameId/retry', async (req, res, next) => {
  try {
    const { gameId } = gameIdParam.parse(req.params)
    await geoPipelineStateRepository.upsert({
      gameId,
      currentStage: 'queued',
      activeSource: null,
      nextEligibleAt: null,
    })
    await geoQueue.add(
      'maps:pipeline',
      { kind: 'maps:pipeline', gameId } as GeoJobData,
      { jobId: `maps-pipeline-retry-${gameId}-${Date.now()}` },
    )
    res.json({ success: true, data: { ok: true } })
  } catch (err) {
    next(err)
  }
})

const sourceParam = z.object({
  gameId: z.coerce.number().int().positive(),
  source: z.enum(['fandom', 'strategywiki', 'mapgenie', 'wand', 'steam', 'rawg']),
})

router.post('/:gameId/:source/retry', async (req, res, next) => {
  try {
    const { gameId, source } = sourceParam.parse(req.params)
    const cfg = await geoSourceConfigRepository.findByName(source)
    if (!cfg) {
      res.status(400).json({ success: false, error: { code: 'UNKNOWN_SOURCE', message: `unknown source: ${source}` } })
      return
    }
    const kind = `maps:fetch-from-${source}` as const
    await geoQueue.add(
      kind,
      { kind, gameId } as GeoJobData,
      { jobId: `maps-fetch-from-${source}-manual-retry-${gameId}-${Date.now()}` },
    )
    res.json({ success: true, data: { ok: true } })
  } catch (err) {
    next(err)
  }
})

router.get('/:gameId/maps', async (req, res, next) => {
  try {
    const { gameId } = gameIdParam.parse(req.params)
    const maps = await geoMapRepository.listCandidatesByGameId(gameId)
    const groups = new Map<
      string,
      {
        zoneSlug: string | null
        zoneName: string | null
        maps: typeof maps
      }
    >()
    for (const m of maps) {
      const key = m.zoneSlug ?? '__world__'
      let group = groups.get(key)
      if (!group) {
        group = { zoneSlug: m.zoneSlug ?? null, zoneName: m.zoneName ?? null, maps: [] }
        groups.set(key, group)
      }
      group.maps.push(m)
    }
    res.json({ success: true, data: { zones: Array.from(groups.values()) } })
  } catch (err) {
    next(err)
  }
})

const selectParams = z.object({
  gameId: z.coerce.number().int().positive(),
  mapId: z.coerce.number().int().positive(),
})

router.post('/:gameId/maps/:mapId/select', async (req, res, next) => {
  try {
    const { gameId, mapId } = selectParams.parse(req.params)
    const userId = (req as { user?: { id?: string } }).user?.id ?? null

    const target = await geoMapRepository.findById(mapId)
    if (!target || target.gameId !== gameId) {
      res.status(404).json({ success: false, error: { code: 'MAP_NOT_FOUND', message: 'map not found for game' } })
      return
    }
    if (target.isSelected) {
      res.json({ success: true, data: { map: target } })
      return
    }
    await geoMapRepository.enableForGame(gameId, mapId)
    const updated = await geoMapRepository.selectMap(gameId, mapId, userId)
    if (!updated) {
      res.status(409).json({ success: false, error: { code: 'SELECT_FAILED', message: 'failed to select map' } })
      return
    }
    await geoPipelineStateRepository.recomputeZoneCounts(gameId)
    const refreshed = await geoPipelineStateRepository.findByGameId(gameId)
    if (refreshed && refreshed.zonesSelected >= refreshed.zonesTotal && refreshed.zonesTotal > 0) {
      await geoPipelineStateRepository.upsert({
        gameId,
        currentStage: 'ready',
        needsCuration: false,
      })
    }

    emitGeoFetchMapSelected({
      gameId,
      zoneSlug: updated.zoneSlug ?? null,
      mapId: updated.id,
      by: userId,
    })
    res.json({ success: true, data: { map: updated } })
  } catch (err) {
    next(err)
  }
})

router.delete('/:gameId/cooldown', async (req, res, next) => {
  try {
    const { gameId } = gameIdParam.parse(req.params)
    const sources = await geoSourceConfigRepository.list()
    for (const s of sources) {
      await resetCircuitBreaker(s.source)
    }
    await geoPipelineStateRepository.upsert({
      gameId,
      currentStage: 'queued',
      nextEligibleAt: null,
    })
    res.json({ success: true, data: { ok: true } })
  } catch (err) {
    next(err)
  }
})

export default router
