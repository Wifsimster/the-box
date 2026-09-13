import { Router } from 'express'
import { geoAdminRepository } from '../../../infrastructure/repositories/index.js'
import { z } from 'zod'
import {
  geoScreenshotRepository,
  geoPinRepository,
  geoMapRepository,
  geoIngestFailureRepository,
} from '../../../infrastructure/repositories/index.js'
import {
  GEO_CONSENSUS_VERSION,
} from '../../../domain/services/index.js'
import {
  evaluateConsensus,
  pinsToNextConsensusThreshold,
} from '../../../domain/services/geo-consensus.service.js'
import { isMapEligibleByGenre } from '../../../domain/services/geo-metadata.service.js'
import { geoQueue } from '../../../infrastructure/queue/queues.js'

const router = Router()

// === Geolocation mode (admin review) ===

// Per-game moderation summary. Replaces the flat "show every capture" list
// the panel used to render: the moderator now sees one row per game with
// the full per-status counts and the oldest pending date. Counts come from
// a single GROUP BY in the repo so they're honest beyond the per-candidate
// page size.
router.get('/geo/candidates/by-game', async (req, res, next) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const limit = req.query.limit ? Math.min(500, Number(req.query.limit)) : 100
    const summaries = await geoScreenshotRepository.summarizeCandidatesByGame({
      statusFilter: status as
        | 'pending'
        | 'collecting'
        | 'promoted'
        | 'rejected'
        | undefined,
      limit,
    })
    res.json({ success: true, data: summaries })
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/geo/games-needing-content — the "one pin away" diagnostic.
// Games with an active map and captures collecting pins but no canonical pin
// yet: promoting one of their candidates makes the game eligible for GeoGamers.
// Sorted so the games closest to the next consensus recompute come first, which
// is where pinning effort moves the eligible-count needle. Complements the
// GeoGamers health card (which shows the aggregate count but not *which* games).
router.get('/geo/games-needing-content', async (req, res, next) => {
  try {
    const rawLimit = Number(req.query.limit)
    const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, Math.trunc(rawLimit))) : 25
    const rows = await geoScreenshotRepository.listGamesNeedingContent(limit)
    const data = rows.map((r) => ({
      ...r,
      pinsToNextThreshold: pinsToNextConsensusThreshold(r.topPinCount),
    }))
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

router.get('/geo/candidates', async (req, res, next) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const limit = req.query.limit ? Math.min(200, Number(req.query.limit)) : 50
    // Optional per-game filter so the Pins tab can deep-link from the Maps
    // tab side panel (admin clicks "Voir les captures" on a row → only that
    // game's candidates show up). Invalid ids are ignored, keeping the
    // unfiltered behaviour as a safe fallback.
    const gameIdRaw =
      typeof req.query.gameId === 'string' ? Number(req.query.gameId) : undefined
    const gameId =
      gameIdRaw !== undefined && Number.isFinite(gameIdRaw) && gameIdRaw > 0
        ? gameIdRaw
        : undefined
    const candidates = await geoScreenshotRepository.listCandidatesForReview({
      status: status as 'pending' | 'collecting' | 'promoted' | 'rejected' | undefined,
      gameId,
      limit,
    })
    res.json({ success: true, data: candidates })
  } catch (err) {
    next(err)
  }
})

router.get('/geo/candidates/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID' } })
      return
    }
    const candidate = await geoScreenshotRepository.findCandidateById(id)
    if (!candidate) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } })
      return
    }
    const [pins, map, meta] = await Promise.all([
      geoPinRepository.listByCandidate(id),
      geoMapRepository.findById(candidate.geoMapId),
      geoScreenshotRepository.findMetaByCandidateId(id),
    ])
    res.json({ success: true, data: { candidate, pins, map, meta } })
  } catch (err) {
    next(err)
  }
})

// Admin can either pin the canonical location themselves, or omit both
// coordinates to let the centroid of player submissions stand in. The
// "approach the right answer through participation" path: more pins
// pull the centroid toward the true location.
const overrideBodySchema = z
  .object({
    canonicalX: z.number().min(0).max(1).optional(),
    canonicalY: z.number().min(0).max(1).optional(),
  })
  .refine((v) => (v.canonicalX === undefined) === (v.canonicalY === undefined), {
    message: 'canonicalX and canonicalY must both be provided or both omitted',
  })

router.post('/geo/candidates/:id/override', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID' } })
      return
    }
    const parse = overrideBodySchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parse.error.issues[0]?.message },
      })
      return
    }

    const candidate = await geoScreenshotRepository.findCandidateById(id)
    if (!candidate) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } })
      return
    }

    // If a meta already exists (consensus-promoted or previous override), the
    // safest behaviour is to reject — admins should delete the meta explicitly
    // rather than silently shift canonical coordinates under players.
    const existing = await geoScreenshotRepository.findMetaByCandidateId(id)
    if (existing) {
      res.status(409).json({
        success: false,
        error: { code: 'ALREADY_PROMOTED', message: 'candidate already promoted' },
      })
      return
    }

    let canonicalX: number
    let canonicalY: number
    let confidence: number
    let promotedVia: 'consensus' | 'admin'

    if (parse.data.canonicalX !== undefined && parse.data.canonicalY !== undefined) {
      canonicalX = parse.data.canonicalX
      canonicalY = parse.data.canonicalY
      confidence = 1.0
      promotedVia = 'admin'
    } else {
      const pins = await geoPinRepository.listByCandidate(id)
      if (pins.length === 0) {
        res.status(400).json({
          success: false,
          error: {
            code: 'NO_PINS',
            message: 'no submissions to compute average from',
          },
        })
        return
      }
      const map = await geoMapRepository.findById(candidate.geoMapId)
      if (!map) {
        res.status(404).json({ success: false, error: { code: 'MAP_NOT_FOUND' } })
        return
      }
      const consensus = evaluateConsensus(
        pins.map((p) => ({ id: p.id, pin: p.pin, confidence: p.confidence, source: p.source })),
        map.consensusRadius,
      )
      canonicalX = consensus.centroid.x
      canonicalY = consensus.centroid.y
      confidence = consensus.confidence
      promotedVia = 'consensus'
    }

    const meta = await geoScreenshotRepository.promoteCandidateToMeta({
      candidateId: id,
      geoMapId: candidate.geoMapId,
      canonicalX,
      canonicalY,
      confidence,
      consensusVersion: GEO_CONSENSUS_VERSION,
      promotedVia,
      promotedBy: req.userId,
    })

    res.json({ success: true, data: meta })
  } catch (err) {
    next(err)
  }
})

router.post('/geo/candidates/:id/reject', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID' } })
      return
    }

    const candidate = await geoScreenshotRepository.findCandidateById(id)
    if (!candidate) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } })
      return
    }

    const result = await geoScreenshotRepository.rejectCandidate(id)
    if (result.alreadyPromoted) {
      res.status(409).json({
        success: false,
        error: {
          code: 'ALREADY_PROMOTED',
          message: 'demote the canonical meta before rejecting the candidate',
        },
      })
      return
    }

    res.json({ success: true, data: { id, rejected: result.rejected } })
  } catch (err) {
    next(err)
  }
})

// Auto-ingestion is driven by recurring `resolve-metadata` and `ingest-tick`
// jobs (see index.ts). The endpoints below give the admin a read-only view of
// the dataset's health plus a small set of manual-override actions: flagging
// games as curated (in/out of the auto pipeline) and forcing a re-import for
// a single game when the heuristics get something wrong.

router.get('/geo/health', async (_req, res, next) => {
  try {
    const [counts, lastFandom, lastSteam, nextChallenge, queueCounts] =
      await Promise.all([
        geoAdminRepository.getCoverageCounts(),
        geoAdminRepository.findLatestMapAt('fandom'),
        geoAdminRepository.findLatestCandidateAt('steam'),
        geoAdminRepository.findNextChallenge(),
        geoQueue.getJobCounts('active', 'waiting', 'delayed', 'failed'),
      ])

    const failures = await geoIngestFailureRepository.listAll()

    res.json({
      success: true,
      data: {
        coverage: {
          curated: Number(counts.curated),
          resolved: Number(counts.resolved),
          withMap: Number(counts.with_map),
          total: Number(counts.total),
        },
        lastFandomImportAt: lastFandom ?? null,
        lastSteamImportAt: lastSteam ?? null,
        nextChallenge: nextChallenge
          ? { id: nextChallenge.id, date: nextChallenge.challenge_date }
          : null,
        queue: queueCounts,
        failures: failures.map((f) => ({
          gameId: f.game_id,
          source: f.source,
          reason: f.reason,
          attemptCount: f.attempt_count,
          lastAttemptAt: f.last_attempt_at,
          retryAfter: f.retry_after,
        })),
      },
    })
  } catch (err) {
    next(err)
  }
})

// Lists games for the admin "curate / suggest" UI. With `curated=true` it
// returns the existing curated set with ingestion status (resolved metadata,
// active map present, candidate count). With `curated=false` it proposes
// non-curated games ranked by Metacritic (descending) — that signal correlates
// well with "famous game with a Fandom wiki and Steam listing", which is the
// shape the auto-ingester can actually handle. Cap matches the bulk-curate
// endpoint (500) so the Jeux/Cartes tabs can load the whole moderation list
// in one shot.
const gamesQuerySchema = z.object({
  curated: z.enum(['true', 'false']).default('true'),
  limit: z.coerce.number().int().positive().max(500).default(20),
})

router.get('/geo/games', async (req, res, next) => {
  try {
    const parse = gamesQuerySchema.safeParse(req.query)
    if (!parse.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parse.error.issues[0]?.message },
      })
      return
    }
    const curated = parse.data.curated === 'true'
    const limit = parse.data.limit

    if (curated) {
      const rows = await geoAdminRepository.listCuratedGames(limit)
      res.json({
        success: true,
        data: {
          games: rows.map((r) => ({
            id: r.id,
            name: r.name,
            slug: r.slug,
            releaseYear: r.release_year,
            developer: r.developer,
            metacritic: r.metacritic,
            genres: r.genres,
            mapEligibility: isMapEligibleByGenre(r.genres),
            metadataStatus: r.geo_metadata_status,
            steamAppId: r.steam_app_id,
            wikiSubdomain: r.wiki_subdomain,
            hasMap: r.has_map,
            mapCount: r.map_count,
            candidateCount: r.candidate_count,
          })),
        },
      })
      return
    }

    const rows = await geoAdminRepository.listUncuratedGames(limit)

    res.json({
      success: true,
      data: {
        games: rows.map((r) => ({
          id: r.id,
          name: r.name,
          slug: r.slug,
          releaseYear: r.release_year,
          developer: r.developer,
          metacritic: r.metacritic,
          genres: r.genres,
          mapEligibility: isMapEligibleByGenre(r.genres),
        })),
      },
    })
  } catch (err) {
    next(err)
  }
})


export default router
