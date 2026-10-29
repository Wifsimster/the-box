import { queueLogger } from '../../logger/logger.js'
import {
  GEO_CONSENSUS_THRESHOLDS,
} from '../../../domain/services/index.js'
import {
  geoConsensusService,
  geoContributorService,
  geoRewardService,
} from '../../../composition/services.js'
import {
  geoPinRepository,
  geoScreenshotRepository,
  geoMapRepository,
} from '../../repositories/index.js'
import { emitGeoRewarded, emitGeoTierUp } from '../../socket/socket.js'

const log = queueLogger.child({ worker: 'geo-consensus' })

export interface GeoConsensusJobResult {
  evaluated: boolean
  candidateId: number
  pinsEvaluated: number
  accepted: number
  rejected: number
  promoted: boolean
  rewardedUsers: number
  skipReason?: string
}

export async function evaluateConsensusForCandidate(
  geoScreenshotCandidateId: number,
  options: { pinCountAtEnqueue?: number } = {},
): Promise<GeoConsensusJobResult> {
  log.info({ candidateId: geoScreenshotCandidateId }, 'evaluating consensus')

  const candidate = await geoScreenshotRepository.findCandidateById(geoScreenshotCandidateId)
  if (!candidate) {
    return {
      evaluated: false,
      candidateId: geoScreenshotCandidateId,
      pinsEvaluated: 0,
      accepted: 0,
      rejected: 0,
      promoted: false,
      rewardedUsers: 0,
      skipReason: 'candidate not found',
    }
  }

  if (candidate.status === 'promoted') {
    return {
      evaluated: false,
      candidateId: geoScreenshotCandidateId,
      pinsEvaluated: 0,
      accepted: 0,
      rejected: 0,
      promoted: false,
      rewardedUsers: 0,
      skipReason: 'already promoted',
    }
  }

  const thresholds = GEO_CONSENSUS_THRESHOLDS as readonly number[]
  const gateCount = options.pinCountAtEnqueue ?? candidate.pinCount
  if (!thresholds.includes(gateCount)) {
    return {
      evaluated: false,
      candidateId: geoScreenshotCandidateId,
      pinsEvaluated: candidate.pinCount,
      accepted: 0,
      rejected: 0,
      promoted: false,
      rewardedUsers: 0,
      skipReason: `pin count ${gateCount} not at threshold`,
    }
  }

  const pending = await geoPinRepository.listPendingByCandidate(geoScreenshotCandidateId)
  if (pending.length === 0) {
    return {
      evaluated: false,
      candidateId: geoScreenshotCandidateId,
      pinsEvaluated: 0,
      accepted: 0,
      rejected: 0,
      promoted: false,
      rewardedUsers: 0,
      skipReason: 'no pending pins',
    }
  }

  const map = await geoMapRepository.findById(candidate.geoMapId)
  if (!map) {
    log.error({ candidateId: geoScreenshotCandidateId, geoMapId: candidate.geoMapId }, 'missing map')
    return {
      evaluated: false,
      candidateId: geoScreenshotCandidateId,
      pinsEvaluated: pending.length,
      accepted: 0,
      rejected: 0,
      promoted: false,
      rewardedUsers: 0,
      skipReason: 'missing map',
    }
  }

  const pinOwners = new Map<number, string>()
  for (const p of pending) if (p.userId) pinOwners.set(p.id, p.userId)

  const result = geoConsensusService.evaluate(
    pending.map((p) => ({ id: p.id, pin: p.pin, confidence: p.confidence, source: p.source })),
    map.consensusRadius,
  )

  const summaries = await geoRewardService.applyConsensus({
    geoScreenshotCandidateId,
    geoMapId: map.id,
    result,
    pinOwners,
  })

  for (const s of summaries) {
    if (s.grants.length > 0) {
      emitGeoRewarded({
        userId: s.userId,
        geoScreenshotCandidateId: s.geoScreenshotCandidateId,
        items: s.grants.map((g) => ({
          itemType: g.itemType,
          itemKey: g.itemKey,
          quantity: g.quantity,
        })),
      })
    }

    const tierResult = await geoContributorService.evaluateAndMaybePromote(s.userId)
    if (tierResult?.promoted) {
      emitGeoTierUp({
        userId: s.userId,
        previousTier: tierResult.previousTier,
        newTier: tierResult.newTier,
      })
    }
  }

  return {
    evaluated: true,
    candidateId: geoScreenshotCandidateId,
    pinsEvaluated: pending.length,
    accepted: result.acceptedCount,
    rejected: result.rejectedCount,
    promoted: result.promote,
    rewardedUsers: summaries.length,
  }
}
