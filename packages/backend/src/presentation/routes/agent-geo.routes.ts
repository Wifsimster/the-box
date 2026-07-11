import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import type { GeoGameNeedingContent } from '@the-box/types'
import { requireApiKey } from '../middleware/public-api.middleware.js'
import {
  agentApiRateLimit,
  requireAgentApiEnabled,
  requireAgentCurateEnabled,
  requireAgentPromoteEnabled,
  requireScope,
} from '../middleware/agent-api.middleware.js'
import { validateBody, validateParams, validateQuery } from '../middleware/validation.middleware.js'
import {
  geoScreenshotRepository,
  geoMapRepository,
  geoPinRepository,
} from '../../infrastructure/repositories/index.js'
import { geoSourceConfigRepository } from '../../infrastructure/repositories/geo-source-config.repository.js'
import { geoIngestFailureRepository } from '../../infrastructure/repositories/geo-ingest-failure.repository.js'
import { adminAuditRepository } from '../../infrastructure/repositories/admin-audit.repository.js'
import { gameRepository } from '../../infrastructure/repositories/game.repository.js'
import {
  evaluateConsensus,
  pinsToNextConsensusThreshold,
  GEO_CONSENSUS_MIN_PINS_TO_PROMOTE,
  GEO_CONSENSUS_VERSION,
} from '../../domain/services/geo-consensus.service.js'
import { shouldPauseAgentKey } from '../../domain/services/geo-agent-guard.service.js'
import { CAPTURE_TARGET_CANDIDATES } from '../../domain/services/geo-metadata.service.js'
import { getGeoGamersHealthSnapshot } from '../../infrastructure/geogamers-health.js'
import {
  enqueueSingleTierImport,
  RUNNABLE_TIERS,
  type RunnableTier,
} from '../../infrastructure/queue/workers/geo-ingest-tick-logic.js'
import { importRawgScreenshots } from '../../infrastructure/queue/workers/geo-rawg-import-logic.js'
import { geoQueue } from '../../infrastructure/queue/queues.js'
import { db } from '../../infrastructure/database/connection.js'
import {
  consumeCaptureImportBudget,
  consumeEnrollBudget,
  consumeIngestBudget,
  consumeMapActionBudget,
  consumePinBudget,
  consumePromoteBudget,
} from '../../infrastructure/redis/agent-budget.js'
import { env } from '../../config/env.js'
import { routeLogger } from '../../infrastructure/logger/logger.js'

const log = routeLogger.child({ router: 'agent-geo' })

// Agent content-sourcing surface (issue #331). Started read-only (phase 2),
// then grew a write surface in stages: ingest triggers (phase 3), downweighted
// pin proposals (phase 4), and content creation & curation (phase 5 — enroll
// games, top up captures, select/reject candidate maps).
//
// Mounted at /api/agent/v1/geo. Key-authenticated with admin-minted geo-agent
// keys, NOT session-authed and NOT the streamer public API. Every route sits
// behind: kill switch → key auth → per-key rate limit → scope check. Curate
// routes (phase 5) sit behind a SECOND independent kill switch
// (requireAgentCurateEnabled) so an operator can run read/ingest/propose in
// production while curation stays dark.
//
// A key never elevates access beyond what the admin UI already lets an
// operator do: curate writes only reach geo_curated flip, screenshot-candidate
// insert, and map select/disable — the same primitives the admin Games and
// geo-fetch panels use. No user identities or PII cross this surface
// (candidate payloads carry pin counts, not pin owners).

const router = Router()

// Order matters: enable-gate first (cheapest reject), then authenticate, then
// rate-limit per key. Scope is checked per route since later phases add
// endpoints with stronger scopes on the same router.
router.use(requireAgentApiEnabled)
router.use(requireApiKey())
router.use(agentApiRateLimit)

const limitQuery = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
})

const gameIdParams = z.object({
  gameId: z.coerce.number().int().positive(),
})

// GET /health — content-readiness snapshot (shares the admin query). Tells an
// agent whether the eligible-game pool is starved and by how much.
router.get('/health', requireScope('geo-agent:read'), async (_req, res, next) => {
  try {
    const data = await getGeoGamersHealthSnapshot()
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

// GET /games-needing-content — the "one pin away" list: games with an active
// map and captures collecting pins but no canonical pin yet. This is the
// agent's work queue — where a proposed pin would grow the eligible pool.
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

// GET /games — the whole geo-curated catalog (issue #331, phase 5), not just
// the "one pin away" work queue. Read-only: lets an agent see what's already
// enrolled before deciding whether to enroll/top-up/curate a game.
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

// POST /games — enroll a game into the geo pipeline (issue #331, phase 5).
// Reuses the SAME curation switch the admin "Games" tab flips
// (`games.geo_curated = true` + `geo_metadata_status = 'pending'`) rather
// than duplicating the RAWG import / metadata-resolve / map-ingest pipeline —
// that one write is all it takes for the existing resolver + ingest tick to
// pick the game up on their next pass and fetch its map + captures. By
// `gameId` the game must already exist (created via the RAWG screenshot
// importer or another mode); by `rawgId` a new minimal game row is created
// first if none exists yet with that rawg_id. Idempotent: enrolling an
// already-curated game just re-arms metadata resolution. Bounded by a
// per-key daily budget — enrollment is the most expensive curate action.
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
      await db('games').where({ id: game!.id }).update(update)
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

// GET /games/:gameId/candidates — unpinned/collecting captures for a game plus
// its active maps (image url + dimensions), so a proposer has everything it
// needs to localize a screenshot. Promoted captures are omitted (they already
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

      await adminAuditRepository.record({
        adminId: `apikey:${req.apiKey!.id}`,
        action: 'geo-agent.select_map',
        targetKind: 'geo_map',
        targetId: String(mapId),
        after: { gameId, mapId },
        ip: req.ip ?? null,
      })

      res.json({ success: true, data: { map: updated, budget: budgetResult.budget } })
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

// POST /games/:gameId/ingest — trigger the existing map-ingestion pipeline for
// one game (phase 3). Pure enqueue: reuses `enqueueSingleTierImport`, so
// tombstones/circuit-breakers, dedup, and license/attribution capture are
// untouched. The agent can request specific tiers or default to all; it can
// NEVER add a source outside the RunnableTier allowlist, and a source with a
// disabled geo_source_config row is skipped (its kill switch is honored).
// Bounded by a per-key Redis daily budget on top of the 60/min rate limit.
const ingestBodySchema = z.object({
  sources: z.array(z.enum(RUNNABLE_TIERS)).nonempty().max(RUNNABLE_TIERS.length).optional(),
})

router.post(
  '/games/:gameId/ingest',
  requireScope('geo-agent:ingest'),
  validateParams(gameIdParams),
  validateBody(ingestBodySchema),
  async (req, res, next) => {
    try {
      const { gameId } = req.params as unknown as z.infer<typeof gameIdParams>
      const { sources } = req.body as z.infer<typeof ingestBodySchema>
      const requested: RunnableTier[] = sources ?? [...RUNNABLE_TIERS]

      // Daily budget check BEFORE enqueuing. Validation errors (bad tier /
      // gameId) are already handled by the schemas above and don't consume it.
      const maxPerDay = Number(env.GEO_AGENT_MAX_INGESTS_PER_DAY) || 20
      const keyId = req.apiKey!.id
      const budget = await consumeIngestBudget(keyId, maxPerDay)
      if (!budget.ok) {
        res.setHeader('Retry-After', String(budget.resetSeconds))
        res.status(429).json({
          success: false,
          error: {
            code: 'BUDGET_EXHAUSTED',
            message: `Daily ingest budget of ${budget.limit} reached; resets at UTC midnight`,
          },
        })
        return
      }

      // Honor the per-source kill switch where a config row exists. Sources
      // without a geo_source_config row (registry/fextralife/wikidata) have no
      // switch and are always runnable — matching the admin "Run now" button.
      const configs = await geoSourceConfigRepository.list()
      const disabled = new Set(
        configs.filter((c) => !c.isEnabled).map((c) => c.source as string),
      )

      const results: Array<
        | { source: RunnableTier; enqueued: true; jobId: string }
        | { source: RunnableTier; enqueued: false; reason: string }
      > = []
      for (const source of requested) {
        if (disabled.has(source)) {
          results.push({ source, enqueued: false, reason: 'SOURCE_DISABLED' })
          continue
        }
        const outcome = await enqueueSingleTierImport(gameId, source)
        results.push(
          outcome.enqueued
            ? { source, enqueued: true, jobId: outcome.jobId }
            : { source, enqueued: false, reason: outcome.reason },
        )
      }

      // Audit every ingest trigger keyed to the API key (writes are always
      // logged). Best-effort — never blocks the response.
      await adminAuditRepository.record({
        adminId: `apikey:${keyId}`,
        action: 'geo-agent.ingest',
        targetKind: 'game',
        targetId: String(gameId),
        after: { requested, enqueued: results.filter((r) => r.enqueued).map((r) => r.source) },
        ip: req.ip ?? null,
      })

      res.json({
        success: true,
        data: {
          gameId,
          results,
          budget: { used: budget.used, limit: budget.limit, remaining: budget.remaining },
        },
      })
    } catch (err) {
      next(err)
    }
  },
)

// POST /candidates/:id/pins — propose a downweighted, flagged pin (phase 4).
// The write path that lets a machine participate in consensus WITHOUT being
// able to promote ground truth: agent pins feed the same consensus queue as
// crowd pins but are excluded from the human-gated promote count (consensus
// v3) and downweighted in the centroid. `rationale` is required — it is the
// artifact a human reviewer reads. Bounded by a per-key hourly budget.
const pinBodySchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  source: z.enum(['agent_structured', 'agent_vision']),
  rationale: z.string().trim().min(1).max(500),
  confidence: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  model: z.string().trim().max(100).optional(),
  // Only meaningful for agent_vision: multiple independent passes vote against
  // each other. 0-2 → up to 3 passes per candidate per key.
  visionPass: z.number().int().min(0).max(2).optional(),
})

router.post(
  '/candidates/:id/pins',
  requireScope('geo-agent:propose'),
  validateParams(z.object({ id: z.coerce.number().int().positive() })),
  validateBody(pinBodySchema),
  async (req, res, next) => {
    try {
      const { id: candidateId } = req.params as unknown as { id: number }
      const body = req.body as z.infer<typeof pinBodySchema>
      const keyId = req.apiKey!.id

      const candidate = await geoScreenshotRepository.findCandidateById(candidateId)
      if (!candidate) {
        res.status(404).json({ success: false, error: { code: 'CANDIDATE_NOT_FOUND' } })
        return
      }
      // Never let a machine pin touch a candidate that already has ground
      // truth — proposals only make sense while a candidate is collecting.
      const existingMeta = await geoScreenshotRepository.findMetaByCandidateId(candidateId)
      if (existingMeta) {
        res.status(409).json({
          success: false,
          error: { code: 'ALREADY_PROMOTED', message: 'candidate already has a canonical pin' },
        })
        return
      }

      // Vision proposals are gated behind the accuracy study (phase 5). Until
      // GEO_AGENT_VISION_ENABLED is flipped (after eval:geo-vision passes the
      // enable bar), reject agent_vision so unmeasured vision pins can't add
      // noise to consensus. Structured pins are unaffected.
      if (body.source === 'agent_vision' && env.GEO_AGENT_VISION_ENABLED !== 'true') {
        res.status(403).json({
          success: false,
          error: {
            code: 'VISION_DISABLED',
            message: 'Vision proposals are disabled pending accuracy validation',
          },
        })
        return
      }

      // Per-key auto-pause: a key whose recent proposals are mostly rejected by
      // consensus is paused (same bar as the human shadow-ban). Checked before
      // the budget so a paused key doesn't burn its quota probing.
      const rejectionRatio = await geoPinRepository.agentKeyRejectionRatio7d(keyId)
      if (shouldPauseAgentKey(rejectionRatio)) {
        res.status(403).json({
          success: false,
          error: {
            code: 'KEY_PAUSED',
            message: 'Key paused: too many recent proposals were rejected by consensus',
          },
        })
        return
      }

      const maxPerHour = Number(env.GEO_AGENT_MAX_PINS_PER_HOUR) || 60
      const budget = await consumePinBudget(keyId, maxPerHour)
      if (!budget.ok) {
        res.setHeader('Retry-After', String(budget.resetSeconds))
        res.status(429).json({
          success: false,
          error: {
            code: 'BUDGET_EXHAUSTED',
            message: `Hourly pin budget of ${budget.limit} reached`,
          },
        })
        return
      }

      const submission = await geoPinRepository.submitAgent({
        agentKeyId: keyId,
        geoScreenshotCandidateId: candidateId,
        pin: { x: body.x, y: body.y },
        source: body.source,
        rationale: body.rationale,
        model: body.model,
        confidence: body.confidence,
        visionPass: body.visionPass,
      })

      const budgetInfo = { used: budget.used, limit: budget.limit, remaining: budget.remaining }

      // Duplicate proposal (same key+candidate+pass) — idempotent no-op.
      if (!submission) {
        res.json({ success: true, data: { received: true, duplicate: true, budget: budgetInfo } })
        return
      }

      const newPinCount = await geoScreenshotRepository.incrementPinCount(candidateId)
      // Enqueue consensus evaluation on the same threshold-gated path as the
      // crowd. Agent pins can trigger a recompute but never a promotion.
      try {
        await geoQueue.add('evaluate-consensus', {
          kind: 'evaluate-consensus',
          geoScreenshotCandidateId: candidateId,
          pinCountAtEnqueue: newPinCount,
        })
      } catch (e) {
        log.warn({ err: String(e), candidateId }, 'failed to enqueue geo consensus job')
      }

      await adminAuditRepository.record({
        adminId: `apikey:${keyId}`,
        action: 'geo-agent.propose_pin',
        targetKind: 'geo_screenshot_candidate',
        targetId: String(candidateId),
        after: {
          x: body.x,
          y: body.y,
          source: body.source,
          rationale: body.rationale,
          model: body.model ?? null,
          visionPass: body.visionPass ?? 0,
        },
        ip: req.ip ?? null,
      })

      res.json({
        success: true,
        data: { pinId: submission.id, received: true, pinCount: newPinCount, budget: budgetInfo },
      })
    } catch (err) {
      next(err)
    }
  },
)

// POST /candidates/:id/promote — confirm & promote a capture's consensus pin to
// canonical ground truth (issue #331, phase 7). This is the ONE agent write
// that creates ground truth, and it is safe by construction: the agent supplies
// NO coordinates and can promote only where the crowd already earned it. The
// route re-runs consensus over the candidate's pins and refuses unless it
// QUALIFIES (`evaluateConsensus(...).promote === true` — ≥5 accepted HUMAN pins
// and a tight enough cluster, exactly the auto-promote gate). Agent pins are
// downweighted voters and excluded from the human promote count (consensus v3),
// so no pile of machine pins can manufacture a qualifying candidate — the agent
// merely pulls the trigger on a promotion the humans already earned but that a
// threshold recompute may not have fired for. Mirrors the admin override's
// consensus-centroid path (`promotedVia = 'consensus'`), attributing
// `promotedBy` to the agent key. Gated behind a THIRD independent kill switch
// (requireAgentPromoteEnabled) and bounded by a per-key daily budget.
router.post(
  '/candidates/:id/promote',
  requireScope('geo-agent:promote'),
  requireAgentPromoteEnabled,
  validateParams(z.object({ id: z.coerce.number().int().positive() })),
  async (req, res, next) => {
    try {
      const { id: candidateId } = req.params as unknown as { id: number }
      const keyId = req.apiKey!.id

      const maxPerDay = Number(env.GEO_AGENT_MAX_PROMOTES_PER_DAY) || 20
      const budget = await consumePromoteBudget(keyId, maxPerDay)
      if (!budget.ok) {
        res.setHeader('Retry-After', String(budget.resetSeconds))
        res.status(429).json({
          success: false,
          error: {
            code: 'BUDGET_EXHAUSTED',
            message: `Daily promote budget of ${budget.limit} reached; resets at UTC midnight`,
          },
        })
        return
      }

      const candidate = await geoScreenshotRepository.findCandidateById(candidateId)
      if (!candidate) {
        res.status(404).json({ success: false, error: { code: 'CANDIDATE_NOT_FOUND' } })
        return
      }

      // Never promote a candidate that already has ground truth — an admin must
      // delete the meta first rather than have coordinates shift under players.
      const existingMeta = await geoScreenshotRepository.findMetaByCandidateId(candidateId)
      if (existingMeta) {
        res.status(409).json({
          success: false,
          error: { code: 'ALREADY_PROMOTED', message: 'candidate already has a canonical pin' },
        })
        return
      }

      const pins = await geoPinRepository.listByCandidate(candidateId)
      if (pins.length === 0) {
        res.status(409).json({
          success: false,
          error: { code: 'NO_PINS', message: 'no pins to compute consensus from' },
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

      // The invariant: the agent can only CONFIRM a promotion the crowd earned.
      // If consensus doesn't qualify (too few accepted human pins, or the
      // cluster is too loose), refuse — the agent cannot force ground truth.
      if (!consensus.promote) {
        res.status(409).json({
          success: false,
          error: {
            code: 'CONSENSUS_NOT_READY',
            message: `consensus not ready to promote (need ≥${GEO_CONSENSUS_MIN_PINS_TO_PROMOTE} accepted human pins and a tight cluster)`,
          },
          data: {
            humanAcceptedCount: consensus.humanAcceptedCount,
            requiredHumanPins: GEO_CONSENSUS_MIN_PINS_TO_PROMOTE,
            confidence: consensus.confidence,
          },
        })
        return
      }

      const meta = await geoScreenshotRepository.promoteCandidateToMeta({
        candidateId,
        geoMapId: candidate.geoMapId,
        canonicalX: consensus.centroid.x,
        canonicalY: consensus.centroid.y,
        confidence: consensus.confidence,
        consensusVersion: GEO_CONSENSUS_VERSION,
        promotedVia: 'consensus',
        promotedBy: `apikey:${keyId}`,
      })

      await adminAuditRepository.record({
        adminId: `apikey:${keyId}`,
        action: 'geo-agent.promote_candidate',
        targetKind: 'geo_screenshot_candidate',
        targetId: String(candidateId),
        after: {
          metaId: meta.id,
          canonicalX: consensus.centroid.x,
          canonicalY: consensus.centroid.y,
          confidence: consensus.confidence,
          humanAcceptedCount: consensus.humanAcceptedCount,
        },
        ip: req.ip ?? null,
      })

      res.json({
        success: true,
        data: {
          meta,
          budget: { used: budget.used, limit: budget.limit, remaining: budget.remaining },
        },
      })
    } catch (err) {
      next(err)
    }
  },
)

export default router
