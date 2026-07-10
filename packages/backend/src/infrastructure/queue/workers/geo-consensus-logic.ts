import { queueLogger } from '../../logger/logger.js'
import {
  geoConsensusService,
  geoContributorService,
  geoRewardService,
  GEO_CONSENSUS_THRESHOLDS,
} from '../../../domain/services/index.js'
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

/**
 * Per-candidate consensus routine. Enqueued each time a pin is submitted;
 * cheap to no-op when the candidate is below a threshold.
 *
 * `pinCountAtEnqueue` is the post-increment value captured by the producer
 * (see `geo.routes.ts /contribute/pin`). It is the gate's source of truth:
 * without it, two near-simultaneous pins (A then B) can both step PAST the
 * same threshold (e.g. 9 → 10 → 11) and the worker re-reads pin_count = 11
 * for both, never evaluating at the threshold. Using the per-pin captured
 * value guarantees exactly one pin sees each threshold.
 */
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

  // Threshold gate. Use the captured at-enqueue value when available so two
  // pins arriving in quick succession can't both skip the same threshold.
  // Fall back to the (possibly racy) re-read for back-compat with jobs
  // queued before this field shipped.
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

  // Agent pins have no user_id — skip them here so they earn no rewards and
  // can't be shadow-banned. They still feed the consensus math below (as
  // downweighted voters) but never the promote count (see consensus v3).
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

  // Real-time: notify each rewarded user, then check if they just tier'd up.
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
