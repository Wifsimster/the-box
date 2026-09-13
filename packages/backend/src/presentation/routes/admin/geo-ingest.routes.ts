import { Router } from 'express'
import { z } from 'zod'
import { recordAdminGeoAudit } from '../../middleware/admin-audit.js'
import { db } from '../../../infrastructure/database/connection.js'
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

    // Flipping curated→true also resets metadata_status so the resolver
    // picks the game up on its next tick, even if a previous attempt left
    // it as 'unresolved'.
    const update: Record<string, unknown> = { geo_curated: parse.data.curated }
    if (parse.data.curated) {
      update.geo_metadata_status = 'pending'
    }
    const updated = await db('games')
      .where({ id: parse.data.gameId })
      .update(update)

    if (updated === 0) {
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

// Bulk variant of /geo/curated for the unified Games tab. Accepts a mixed
// batch of curate-on / curate-off operations so an operator can onboard or
// retire dozens of games in one network round-trip. Each item is applied
// individually inside a transaction; partial-failure behavior matches the
// single-item route (flipping `geo_curated = true` resets metadata_status
// and clears the metadata tombstone so the resolver picks the game up on
// its next tick).
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

    let updated = 0
    let notFound = 0
    await db.transaction(async (trx) => {
      for (const item of parse.data.items) {
        const update: Record<string, unknown> = { geo_curated: item.curated }
        if (item.curated) update.geo_metadata_status = 'pending'
        const n = await trx('games').where({ id: item.gameId }).update(update)
        if (n === 0) {
          notFound++
        } else {
          updated++
          if (item.curated) {
            await trx('geo_ingest_failure')
              .where({ game_id: item.gameId, source: 'metadata' })
              .del()
          }
        }
      }
    })

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
    // Aggressive variant of /geo/run/:gameId — wipes every per-tier failure
    // tombstone AND the resolved metadata so the resolver+tick re-run from
    // scratch. Wrapped in a transaction so a crash mid-flight can't leave
    // half the tombstones cleared and the metadata still resolved.
    // Single round trip per source (whereIn-grouped) instead of 7 deletes.
    await db.transaction(async (trx) => {
      await trx('geo_ingest_failure')
        .where({ game_id: gameId })
        .whereIn('source', [
          'registry',
          'fandom',
          'strategywiki',
          'fextralife',
          'wikidata',
          'steam',
          'metadata',
        ])
        .del()
      await trx('games')
        .where({ id: gameId })
        .update({
          geo_metadata_status: 'pending',
          wiki_subdomain: null,
          wiki_page_title: null,
          steam_app_id: null,
          wikidata_qid: null,
        })
    })

    // Enqueue jobs AFTER the transaction commits so the orchestrator can
    // observe the cleared state and a transaction rollback can't leak a
    // job that races against a stale view.
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

// Per-tier tombstone clear. Targeted alternative to /geo/reimport (which
// wipes all 5 source tombstones for a game) and /scraping/reset (which
// nukes everything). Lets an operator say "Fandom is back up, retry just
// that tier for this game" without re-paying the registry/wikidata cost.
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
    // Best-effort: kick the per-game pipeline so the cleared tier gets
    // retried right away. Idempotent jobIds keep this safe to call even
    // if the operator just hit "Run for this game".
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

// Manual run-now triggers for the whole geo ingestion pipeline. The recurring
// resolver + tick workers already run on a schedule; these endpoints just
// short-circuit the wait so an operator can kick off a fresh pass immediately
// after curating games or after a reset. Both jobs are idempotent — clicking
// twice is harmless because the per-tier importers short-circuit on existing
// rows.
router.post('/geo/run', async (_req, res, next) => {
  try {
    // Large batch sizes so a single click sweeps the whole curated set.
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
    // Stable jobIds so a double-click while one is still in flight collapses
    // to a single run. BullMQ silently no-ops on duplicate ids. Hyphens (not
    // colons) — BullMQ's `Job.validateOptions` throws on jobIds containing
    // `:` unless they have exactly 3 colon-separated parts (a legacy
    // repeatable-job carve-out).
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

// Run a single tier for one game — surfaced by the "Run now" button on an
// eligible TierRow. Avoids the all-tiers cascade so an operator can iterate
// on one source without re-running the others.
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

// Live-progress feed for the manual run UI. Returns active/waiting/delayed
// geo jobs grouped by gameId so the maps tab can highlight which rows are
// in flight at which tier. Polled at ~2s while a run is active.
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
    // Global (no-gameId) jobs surfaced separately so the UI can show "batch
    // resolver running" alongside per-game progress.
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
        // Skip noise jobs unrelated to the ingest pipeline.
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

    // BullMQ types each `JobCountsKeyType` as optional even though
    // `getJobCounts` always returns the keys you asked for.
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


// Demote a canonical meta back to an unlabeled candidate so an admin can
// re-promote with corrected coordinates. FK RESTRICT on geo_challenge means
// this 409s when any challenge references the meta — admins must unlink the
// challenge(s) first rather than silently breaking an active day.
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
      // Match Postgres' foreign_key_violation SQLSTATE rather than parsing
      // the message — driver locale / pg version changes won't break the
      // 409 path. Knex surfaces the code as `error.code` with the original
      // pg error preserved.
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
