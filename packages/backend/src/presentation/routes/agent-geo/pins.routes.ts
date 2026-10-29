import { Router } from 'express'
import { z } from 'zod'
import {
  requireAgentPromoteEnabled,
  requireAgentPromoteOverrideEnabled,
  requireScope,
} from '../../middleware/agent-api.middleware.js'
import { validateBody, validateParams } from '../../middleware/validation.middleware.js'
import {
  geoScreenshotRepository,
  geoMapRepository,
  geoPinRepository,
} from '../../../infrastructure/repositories/index.js'
import { adminAuditRepository } from '../../../infrastructure/repositories/admin-audit.repository.js'
import {
  evaluateConsensus,
  GEO_CONSENSUS_MIN_PINS_TO_PROMOTE,
  GEO_CONSENSUS_VERSION,
} from '../../../domain/services/geo-consensus.service.js'
import { shouldPauseAgentKey } from '../../../domain/services/geo-agent-guard.service.js'
import { geoQueue } from '../../../infrastructure/queue/queues.js'
import {
  consumePinBudget,
  consumePromoteBudget,
  consumePromoteOverrideBudget,
} from '../../../infrastructure/redis/agent-budget.js'
import { env } from '../../../config/env.js'
import { log } from './shared.js'

const router = Router()

const pinBodySchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  source: z.enum(['agent_structured', 'agent_vision']),
  rationale: z.string().trim().min(1).max(500),
  confidence: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  model: z.string().trim().max(100).optional(),
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
      const existingMeta = await geoScreenshotRepository.findMetaByCandidateId(candidateId)
      if (existingMeta) {
        res.status(409).json({
          success: false,
          error: { code: 'ALREADY_PROMOTED', message: 'candidate already has a canonical pin' },
        })
        return
      }

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

      if (!submission) {
        res.json({ success: true, data: { received: true, duplicate: true, budget: budgetInfo } })
        return
      }

      const newPinCount = await geoScreenshotRepository.incrementPinCount(candidateId)
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
        promotedBy: null,
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

const promoteOverrideBodySchema = z.object({
  canonicalX: z.number().min(0).max(1),
  canonicalY: z.number().min(0).max(1),
})

router.post(
  '/candidates/:id/promote-override',
  requireScope('geo-agent:promote-override'),
  requireAgentPromoteOverrideEnabled,
  validateParams(z.object({ id: z.coerce.number().int().positive() })),
  validateBody(promoteOverrideBodySchema),
  async (req, res, next) => {
    try {
      const { id: candidateId } = req.params as unknown as { id: number }
      const { canonicalX, canonicalY } = req.body as z.infer<typeof promoteOverrideBodySchema>
      const keyId = req.apiKey!.id

      const maxPerDay = Number(env.GEO_AGENT_MAX_PROMOTE_OVERRIDES_PER_DAY) || 5
      const budget = await consumePromoteOverrideBudget(keyId, maxPerDay)
      if (!budget.ok) {
        res.setHeader('Retry-After', String(budget.resetSeconds))
        res.status(429).json({
          success: false,
          error: {
            code: 'BUDGET_EXHAUSTED',
            message: `Daily override-promote budget of ${budget.limit} reached; resets at UTC midnight`,
          },
        })
        return
      }

      const candidate = await geoScreenshotRepository.findCandidateById(candidateId)
      if (!candidate) {
        res.status(404).json({ success: false, error: { code: 'CANDIDATE_NOT_FOUND' } })
        return
      }

      const existingMeta = await geoScreenshotRepository.findMetaByCandidateId(candidateId)
      if (existingMeta) {
        res.status(409).json({
          success: false,
          error: { code: 'ALREADY_PROMOTED', message: 'candidate already has a canonical pin' },
        })
        return
      }

      const map = await geoMapRepository.findEnabledById(candidate.gameId, candidate.geoMapId)
      if (!map) {
        res.status(409).json({
          success: false,
          error: {
            code: 'MAP_NOT_ACTIVE',
            message:
              "candidate's map is not enabled; select/repoint the capture onto an active map before override-promoting",
          },
        })
        return
      }

      const meta = await geoScreenshotRepository.promoteCandidateToMeta({
        candidateId,
        geoMapId: candidate.geoMapId,
        canonicalX,
        canonicalY,
        confidence: 1.0,
        consensusVersion: GEO_CONSENSUS_VERSION,
        promotedVia: 'agent_override',
        promotedBy: null,
      })

      await adminAuditRepository.record({
        adminId: `apikey:${keyId}`,
        action: 'geo-agent.promote_override',
        targetKind: 'geo_screenshot_candidate',
        targetId: String(candidateId),
        after: {
          metaId: meta.id,
          canonicalX,
          canonicalY,
          geoMapId: candidate.geoMapId,
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
