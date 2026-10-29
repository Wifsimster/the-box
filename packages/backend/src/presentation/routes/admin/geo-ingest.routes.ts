import { Router } from 'express'
import { gameRepository, geoAdminRepository } from '../../../infrastructure/repositories/index.js'
import { z } from 'zod'
import { recordAdminGeoAudit } from '../../middleware/admin-audit.js'
import {
  geoScreenshotRepository,
  geoIngestFailureRepository,
} from '../../../infrastructure/repositories/index.js'
import { geoQueue, type GeoJobData } from '../../../infrastructure/queue/queues.js'
import {
  enqueueSingleTierImport,
  type RunnableTier,
} from '../../../infrastructure/queue/workers/geo-ingest-tick-logic.js'

const router = Router()

const curatedBodySchema = z.object({
  gameId: z.number().int().positive(),
  curated: z.boolean(),
})

router.post('/geo/curated', async (req, res, next) => {
  try {
    const parse = curatedBodySchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parse.error.issues[0]?.message },
      })
      return
    }

    const update: Record<string, unknown> = { geo_curated: parse.data.curated }
    if (parse.data.curated) {
      update.geo_metadata_status = 'pending'
    }
    const updated = await gameRepository.updateGeoColumns(parse.data.gameId, update)

    if (!updated) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } })
      return
    }

    if (parse.data.curated) {
      await geoIngestFailureRepository.clear(parse.data.gameId, 'metadata')
    }

    res.json({ success: true, data: { gameId: parse.data.gameId, curated: parse.data.curated } })
  } catch (err) {
    next(err)
  }
})

const reimportBodySchema = z.object({
  gameId: z.number().int().positive(),
})

const curatedBulkBodySchema = z.object({
  items: z
    .array(
      z.object({
        gameId: z.number().int().positive(),
        curated: z.boolean(),
      }),
    )
    .min(1)
    .max(500),
})

router.post('/geo/curated/bulk', async (req, res, next) => {
  try {
    const parse = curatedBulkBodySchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parse.error.issues[0]?.message },
      })
      return
    }

    const { updated, notFound } = await geoAdminRepository.setCurationBulk(parse.data.items)

    res.json({ success: true, data: { updated, notFound } })
  } catch (err) {
    next(err)
  }
})

router.post('/geo/reimport', async (req, res, next) => {
  try {
    const parse = reimportBodySchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parse.error.issues[0]?.message },
      })
      return
    }
    const gameId = parse.data.gameId
    await geoAdminRepository.resetGameForReimport(gameId)

    const resolveJob = await geoQueue.add(
      'resolve-metadata',
      { kind: 'resolve-metadata', batchSize: 1, gameId },
      { jobId: `manual-resolve-${gameId}` },
    )
    const tickJob = await geoQueue.add(
      'ingest-tick',
      { kind: 'ingest-tick', batchSize: 1, gameId },
      { jobId: `manual-tick-${gameId}` },
    )
    await recordAdminGeoAudit(req, {
      action: 'geo.reimport',
      target: { kind: 'game', id: gameId },
      after: { resolveJobId: resolveJob.id, tickJobId: tickJob.id },
    })
    res.json({
      success: true,
      data: { resolveJobId: resolveJob.id, tickJobId: tickJob.id },
    })
  } catch (err) {
    next(err)
  }
})

const TOMBSTONE_SOURCES = [
  'fandom',
  'steam',
  'metadata',
  'registry',
  'strategywiki',
  'fextralife',
  'wand',
  'wikidata',
] as const
type TombstoneSource = (typeof TOMBSTONE_SOURCES)[number]
function isTombstoneSource(s: string): s is TombstoneSource {
  return (TOMBSTONE_SOURCES as readonly string[]).includes(s)
}

router.delete('/geo/tombstone/:gameId/:source', async (req, res, next) => {
  try {
    const gameId = Number(req.params.gameId)
    if (!Number.isFinite(gameId) || gameId <= 0) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID' } })
      return
    }
    const source = req.params.source ?? ''
    if (!isTombstoneSource(source)) {
      res
        .status(400)
        .json({ success: false, error: { code: 'INVALID_SOURCE' } })
      return
    }
    await geoIngestFailureRepository.clear(gameId, source)
    await geoQueue.add(
      'ingest-tick',
      { kind: 'ingest-tick', batchSize: 1, gameId },
      { jobId: `manual-tick-${gameId}` },
    )
    res.json({ success: true, data: { gameId, source } })
  } catch (err) {
    next(err)
  }
})

router.post('/geo/run', async (_req, res, next) => {
  try {
    const resolveJob = await geoQueue.add('resolve-metadata', {
      kind: 'resolve-metadata',
      batchSize: 500,
    })
    const tickJob = await geoQueue.add('ingest-tick', {
      kind: 'ingest-tick',
      batchSize: 500,
    })
    res.json({
      success: true,
      data: { resolveJobId: resolveJob.id, tickJobId: tickJob.id },
    })
  } catch (err) {
    next(err)
  }
})

router.post('/geo/run/:gameId', async (req, res, next) => {
  try {
    const gameId = Number(req.params.gameId)
    if (!Number.isFinite(gameId) || gameId <= 0) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID' } })
      return
    }
    const resolveJob = await geoQueue.add(
      'resolve-metadata',
      { kind: 'resolve-metadata', batchSize: 1, gameId },
      { jobId: `manual-resolve-${gameId}` },
    )
    const tickJob = await geoQueue.add(
      'ingest-tick',
      { kind: 'ingest-tick', batchSize: 1, gameId },
      { jobId: `manual-tick-${gameId}` },
    )
    res.json({
      success: true,
      data: { gameId, resolveJobId: resolveJob.id, tickJobId: tickJob.id },
    })
  } catch (err) {
    next(err)
  }
})

const RUNNABLE_TIERS: readonly RunnableTier[] = [
  'registry',
  'fandom',
  'strategywiki',
  'fextralife',
  'wand',
  'wikidata',
] as const
function isRunnableTier(s: string): s is RunnableTier {
  return (RUNNABLE_TIERS as readonly string[]).includes(s)
}

router.post('/geo/run/:gameId/:source', async (req, res, next) => {
  try {
    const gameId = Number(req.params.gameId)
    if (!Number.isFinite(gameId) || gameId <= 0) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID' } })
      return
    }
    const source = req.params.source ?? ''
    if (!isRunnableTier(source)) {
      res
        .status(400)
        .json({ success: false, error: { code: 'INVALID_SOURCE' } })
      return
    }
    const result = await enqueueSingleTierImport(gameId, source)
    if (!result.enqueued) {
      res.status(409).json({ success: false, error: { code: result.reason } })
      return
    }
    res.json({ success: true, data: { gameId, source, jobId: result.jobId } })
  } catch (err) {
    next(err)
  }
})

router.get('/geo/run/state', async (_req, res, next) => {
  try {
    const [active, waiting, delayed, counts] = await Promise.all([
      geoQueue.getActive(0, 200),
      geoQueue.getWaiting(0, 200),
      geoQueue.getDelayed(0, 200),
      geoQueue.getJobCounts(
        'active',
        'waiting',
        'delayed',
        'failed',
        'completed',
      ),
    ])

    const byGame: Record<
      number,
      Array<{ kind: GeoJobData['kind']; state: 'active' | 'waiting' | 'delayed' }>
    > = {}
    const globals: Array<{
      kind: GeoJobData['kind']
      state: 'active' | 'waiting' | 'delayed'
    }> = []

    const sweep = (
      jobs: typeof active,
      state: 'active' | 'waiting' | 'delayed',
    ) => {
      for (const job of jobs) {
        const data = job.data as GeoJobData
        if (
          data.kind === 'evaluate-consensus' ||
          data.kind === 'promote-contributor-tier'
        ) {
          continue
        }
        const gameId =
          'gameId' in data && typeof data.gameId === 'number' ? data.gameId : null
        if (gameId === null) {
          globals.push({ kind: data.kind, state })
          continue
        }
        ;(byGame[gameId] ??= []).push({ kind: data.kind, state })
      }
    }
    sweep(active, 'active')
    sweep(waiting, 'waiting')
    sweep(delayed, 'delayed')

    const safeCounts = {
      active: counts.active ?? 0,
      waiting: counts.waiting ?? 0,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
      completed: counts.completed ?? 0,
    }
    const inflight = safeCounts.active + safeCounts.waiting + safeCounts.delayed
    res.json({
      success: true,
      data: {
        isActive: inflight > 0,
        counts: safeCounts,
        byGame,
        globals,
      },
    })
  } catch (err) {
    next(err)
  }
})


router.delete('/geo/meta/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID' } })
      return
    }

    try {
      const result = await geoScreenshotRepository.deleteMeta(id)
      if (!result.deleted) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } })
        return
      }
      await recordAdminGeoAudit(req, {
        action: 'geo.meta.delete',
        target: { kind: 'geo-screenshot-meta', id },
        after: { candidateId: result.candidateId },
      })
      res.json({ success: true, data: result })
    } catch (dbErr) {
      const code = (dbErr as { code?: string } | null)?.code
      if (code === '23503') {
        res.status(409).json({
          success: false,
          error: {
            code: 'META_IN_USE',
            message: 'meta is referenced by a geo challenge — remove the challenge first',
          },
        })
        return
      }
      throw dbErr
    }
  } catch (err) {
    next(err)
  }
})

export default router
