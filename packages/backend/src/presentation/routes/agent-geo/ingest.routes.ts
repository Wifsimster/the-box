import { Router } from 'express'
import { z } from 'zod'
import {
  requireScope,
} from '../../middleware/agent-api.middleware.js'
import { validateBody, validateParams } from '../../middleware/validation.middleware.js'
import { geoSourceConfigRepository } from '../../../infrastructure/repositories/geo-source-config.repository.js'
import { adminAuditRepository } from '../../../infrastructure/repositories/admin-audit.repository.js'
import {
  enqueueSingleTierImport,
  RUNNABLE_TIERS,
  type RunnableTier,
} from '../../../infrastructure/queue/workers/geo-ingest-tick-logic.js'
import {
  consumeIngestBudget,
} from '../../../infrastructure/redis/agent-budget.js'
import { env } from '../../../config/env.js'
import { gameIdParams } from './shared.js'

const router = Router()

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
