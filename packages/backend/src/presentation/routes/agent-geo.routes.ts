import { Router } from 'express'
import { z } from 'zod'
import type { GeoGameNeedingContent } from '@the-box/types'
import { requireApiKey } from '../middleware/public-api.middleware.js'
import {
  agentApiRateLimit,
  requireAgentApiEnabled,
  requireScope,
} from '../middleware/agent-api.middleware.js'
import { validateBody, validateParams, validateQuery } from '../middleware/validation.middleware.js'
import {
  geoScreenshotRepository,
  geoMapRepository,
} from '../../infrastructure/repositories/index.js'
import { geoSourceConfigRepository } from '../../infrastructure/repositories/geo-source-config.repository.js'
import { adminAuditRepository } from '../../infrastructure/repositories/admin-audit.repository.js'
import { pinsToNextConsensusThreshold } from '../../domain/services/geo-consensus.service.js'
import { getGeoGamersHealthSnapshot } from '../../infrastructure/geogamers-health.js'
import {
  enqueueSingleTierImport,
  RUNNABLE_TIERS,
  type RunnableTier,
} from '../../infrastructure/queue/workers/geo-ingest-tick-logic.js'
import { consumeIngestBudget } from '../../infrastructure/redis/agent-budget.js'
import { env } from '../../config/env.js'

// Agent content-sourcing surface (issue #331, phase 2 — read-only).
//
// Mounted at /api/agent/v1/geo. Key-authenticated with admin-minted geo-agent
// keys, NOT session-authed and NOT the streamer public API. Every route sits
// behind: kill switch → key auth → per-key rate limit → scope check. This
// phase exposes only reads — it proves the auth/audit/rate-limit surface with
// zero write risk before ingest (phase 3) and pin proposals (phase 4) land.
//
// A key never elevates access: these endpoints return catalog/diagnostic data,
// never user identities or PII (candidate payloads carry pin counts, not pin
// owners).

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

export default router
