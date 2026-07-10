import { Router } from 'express'
import { z } from 'zod'
import type { GeoGameNeedingContent } from '@the-box/types'
import { requireApiKey } from '../middleware/public-api.middleware.js'
import {
  agentApiRateLimit,
  requireAgentApiEnabled,
  requireScope,
} from '../middleware/agent-api.middleware.js'
import { validateParams, validateQuery } from '../middleware/validation.middleware.js'
import {
  geoScreenshotRepository,
  geoMapRepository,
} from '../../infrastructure/repositories/index.js'
import { pinsToNextConsensusThreshold } from '../../domain/services/geo-consensus.service.js'
import { getGeoGamersHealthSnapshot } from '../../infrastructure/geogamers-health.js'

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

export default router
