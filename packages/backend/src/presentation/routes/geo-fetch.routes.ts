import { Router } from 'express'
import { z } from 'zod'
import { adminMiddleware } from '../middleware/auth.middleware.js'
import { db } from '../../infrastructure/database/connection.js'
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

// Admin-only routes for the multi-source map fetch pipeline. Mounted at
// /api/admin/geo-fetch — separate from admin.routes.ts to keep the new code
// scoped, and so the cutover commit can delete it without bleeding into the
// existing admin module.

const log = routeLogger.child({ route: 'geo-fetch' })
const router = Router()

router.use(adminMiddleware)

// === Status ===========================================================

// Aggregate counts by stage. Cheap; powers the sticky header on the panel.
router.get('/status', async (_req, res, next) => {
  try {
    const result = await db.raw<{
      rows: Array<{ current_stage: string; count: string }>
    }>(
      `
      SELECT current_stage, COUNT(*)::text AS count
      FROM geo_game_pipeline_state
      GROUP BY current_stage
      `,
    )
    const counts: Record<string, number> = {
      queued: 0,
      fetching_map: 0,
      fetching_candidates: 0,
      awaiting_curation: 0,
      ready: 0,
      blocked: 0,
    }
    for (const row of result.rows) {
      counts[row.current_stage] = Number(row.count)
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    res.json({ counts, total })
  } catch (err) {
    next(err)
  }
})

// Paginated per-game state list with filtering + game name join.
const listQuerySchema = z.object({
  stage: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})

router.get('/games', async (req, res, next) => {
  try {
    const q = listQuerySchema.parse(req.query)
    let query = db('geo_game_pipeline_state as s')
      .leftJoin('games as g', 'g.id', 's.game_id')
      .select(
        's.game_id',
        's.current_stage',
        's.active_source',
        's.zones_total',
        's.zones_covered',
        's.zones_selected',
        's.needs_curation',
        's.last_attempt_at',
        's.next_eligible_at',
        's.updated_at',
        'g.name',
        'g.slug',
      )
    if (q.stage) query = query.where('s.current_stage', q.stage)
    if (q.search) query = query.where('g.name', 'ilike', `%${q.search}%`)
    const rows = await query
      .orderBy('s.updated_at', 'desc')
      .limit(q.limit)
      .offset(q.offset)
    res.json({ games: rows, limit: q.limit, offset: q.offset })
  } catch (err) {
    next(err)
  }
})

// === Start / cancel ===================================================

const startSchema = z.object({
  gameIds: z.array(z.number().int().positive()).optional(),
  // When true, enqueue every curated game that's not already ready.
  all: z.boolean().optional(),
})

router.post('/start', async (req, res, next) => {
  try {
    const body = startSchema.parse(req.body)
    let gameIds = body.gameIds ?? []
    if (body.all) {
      const rows = await db('games')
        .where('geo_curated', true)
        .where('geo_metadata_status', 'resolved')
        .select<Array<{ id: number }>>('id')
      gameIds = rows.map((r) => r.id)
    }
    if (gameIds.length === 0) {
      res.status(400).json({ error: 'no games to start' })
      return
    }

    // Initialize pipeline state for each game and enqueue an orchestrator job.
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
        { jobId: `maps:pipeline:start:${gameId}:${Date.now()}` },
      )
    }
    emitGeoFetchStarted({ totalGames: gameIds.length })
    log.info({ totalGames: gameIds.length }, 'geo-fetch started')
    res.json({ totalGames: gameIds.length })
  } catch (err) {
    next(err)
  }
})

// Drain everything in flight: remove waiting/delayed jobs in geo-jobs that
// belong to the maps:* family. Active jobs run to completion (BullMQ doesn't
// kill them mid-flight) but no new ones get scheduled.
router.post('/cancel', async (_req, res, next) => {
  try {
    const removed = await geoQueue.clean(0, 1_000_000, 'wait')
    const removedDelayed = await geoQueue.clean(0, 1_000_000, 'delayed')
    log.warn(
      { wait: removed.length, delayed: removedDelayed.length },
      'geo-fetch cancelled',
    )
    res.json({ removed: removed.length + removedDelayed.length })
  } catch (err) {
    next(err)
  }
})

// === Per-game ========================================================

const gameIdParam = z.object({ gameId: z.coerce.number().int().positive() })

router.get('/:gameId', async (req, res, next) => {
  try {
    const { gameId } = gameIdParam.parse(req.params)
    const state = await geoPipelineStateRepository.findByGameId(gameId)
    const recentAttempts = await geoIngestAttemptRepository.listForGame(gameId, 20)
    res.json({ state, recentAttempts })
  } catch (err) {
    next(err)
  }
})

router.post('/:gameId/retry', async (req, res, next) => {
  try {
    const { gameId } = gameIdParam.parse(req.params)
    // Clear any cooldown gate.
    await geoPipelineStateRepository.upsert({
      gameId,
      currentStage: 'queued',
      activeSource: null,
      nextEligibleAt: null,
    })
    await geoQueue.add(
      'maps:pipeline',
      { kind: 'maps:pipeline', gameId } as GeoJobData,
      { jobId: `maps:pipeline:retry:${gameId}:${Date.now()}` },
    )
    res.json({ ok: true })
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
      res.status(400).json({ error: `unknown source: ${source}` })
      return
    }
    const kind = `maps:fetch-from-${source}` as const
    await geoQueue.add(
      kind,
      { kind, gameId } as GeoJobData,
      { jobId: `${kind}:manual-retry:${gameId}:${Date.now()}` },
    )
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// === Curation ========================================================

router.get('/:gameId/maps', async (req, res, next) => {
  try {
    const { gameId } = gameIdParam.parse(req.params)
    const maps = await geoMapRepository.listCandidatesByGameId(gameId)
    // Group by zone for the drawer UI; null zone_slug becomes a single bucket.
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
    res.json({ zones: Array.from(groups.values()) })
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

    // Make sure the map is enabled before selecting it (selectMap requires it).
    const target = await geoMapRepository.findById(mapId)
    if (!target || target.gameId !== gameId) {
      res.status(404).json({ error: 'map not found for game' })
      return
    }
    if (target.isSelected) {
      res.json({ map: target })
      return
    }
    // Auto-enable if needed so admins don't need a separate click.
    await geoMapRepository.enableForGame(gameId, mapId)
    const updated = await geoMapRepository.selectMap(gameId, mapId, userId)
    if (!updated) {
      res.status(409).json({ error: 'failed to select map' })
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
    res.json({ map: updated })
  } catch (err) {
    next(err)
  }
})

// Clear any cooldown / circuit-breaker block for a game so it can be retried.
router.delete('/:gameId/cooldown', async (req, res, next) => {
  try {
    const { gameId } = gameIdParam.parse(req.params)
    // The new ingest-attempt log doesn't store tombstone rows we delete, but
    // the orchestrator's cooldown is based on recent failures. Reset all
    // circuit breakers and bump the pipeline to queued so it'll retry now.
    const sources = await geoSourceConfigRepository.list()
    for (const s of sources) {
      await resetCircuitBreaker(s.source)
    }
    await geoPipelineStateRepository.upsert({
      gameId,
      currentStage: 'queued',
      nextEligibleAt: null,
    })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router
