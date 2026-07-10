import type { DomainLogger } from '../ports/logger.js'
import type { GeoPinConfidence, GeoPoint, GeoPinStatus } from '@the-box/types'

// Pin count thresholds at which the consensus worker should recompute.
export const GEO_CONSENSUS_THRESHOLDS = [5, 10, 20, 50] as const

// Minimum pins required before we can promote a candidate to canonical.
export const GEO_CONSENSUS_MIN_PINS_TO_PROMOTE = 5

// Pins farther than this many standard deviations from the centroid are
// rejected. σ is computed per-axis against the current pin set.
export const GEO_CONSENSUS_SIGMA_MULTIPLIER = 2

// Current consensus algorithm version; bumped alongside formula changes so a
// retroactive re-run can distinguish old vs new decisions. v2 introduces
// confidence-weighted centroid + variance.
export const GEO_CONSENSUS_VERSION = 2

// Self-reported confidence buckets translate to multiplicative weights on
// the pin's contribution to centroid + variance. "Sure" pins count
// fully; "approximate" pins ⅔; "guesses" ⅓. Pins without a recorded
// confidence (legacy rows or contributors who skipped the chip) are
// treated as "sure" — same behaviour as v1, so re-running v2 over a
// pre-confidence dataset is a no-op.
export const GEO_CONSENSUS_CONFIDENCE_WEIGHTS: Record<GeoPinConfidence, number> = {
  1: 1.0,
  2: 0.66,
  3: 0.33,
}

function weightFor(confidence: GeoPinConfidence | undefined): number {
  if (confidence == null) return 1.0
  return GEO_CONSENSUS_CONFIDENCE_WEIGHTS[confidence]
}

/**
 * How many more pins a candidate needs before the consensus worker's next
 * recompute could promote it. Recompute only fires at GEO_CONSENSUS_THRESHOLDS
 * ([5, 10, 20, 50]); once a candidate is past the top threshold, further pins
 * won't trigger a new recompute, so this returns 0. A negative or zero input
 * targets the first threshold. Powers the admin "one pin away" diagnostic; note
 * it counts raw submissions, not accepted pins, so it's an upper-bound signal.
 */
export function pinsToNextConsensusThreshold(pinCount: number): number {
  const next = GEO_CONSENSUS_THRESHOLDS.find((t) => t > pinCount)
  return next === undefined ? 0 : next - pinCount
}

export interface GeoPinLike {
  id: number
  pin: GeoPoint
  confidence?: GeoPinConfidence
}

export interface GeoConsensusDecision {
  pinId: number
  status: GeoPinStatus
  distanceFromCentroid: number
}

export interface GeoConsensusResult {
  centroid: GeoPoint
  sigmaX: number
  sigmaY: number
  acceptedCount: number
  rejectedCount: number
  decisions: GeoConsensusDecision[]
  promote: boolean
  confidence: number
  version: number
}

/**
 * Compute weighted mean/σ on each axis and mark pins outside σ-multiplier
 * * σ OR outside the map's consensus radius as rejected. Promotion to
 * canonical requires ≥ min-pins AND a tight enough cluster (confidence
 * > 0.5).
 *
 * Each pin contributes proportionally to its self-reported confidence:
 * "sure" (1.0), "approx" (0.66), "guess" (0.33). Pins without a
 * recorded confidence count fully — preserving v1 behaviour for the
 * historical dataset and for contributors who skip the chip.
 *
 * Cluster confidence is a bounded, interpretable signal: 1 when all
 * pins sit on top of each other, 0 when the spread equals the map's
 * consensus radius.
 */
export function evaluateConsensus(
  pins: GeoPinLike[],
  mapConsensusRadius: number,
): GeoConsensusResult {
  const n = pins.length
  if (n === 0) {
    return {
      centroid: { x: 0, y: 0 },
      sigmaX: 0,
      sigmaY: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      decisions: [],
      promote: false,
      confidence: 0,
      version: GEO_CONSENSUS_VERSION,
    }
  }

  // Weighted centroid. Total weight is also the divisor for variance,
  // so a "guess"-only cluster has the same shape as the equivalent
  // "sure" cluster — the weights only matter when confidences are mixed.
  let sumW = 0
  let sumWX = 0
  let sumWY = 0
  for (const { pin, confidence } of pins) {
    const w = weightFor(confidence)
    sumW += w
    sumWX += w * pin.x
    sumWY += w * pin.y
  }
  // Defensive: every weight in our table is > 0 and we just rejected n=0,
  // so sumW can never legitimately be 0. Falling back to 1 keeps a future
  // weight=0 bucket from short-circuiting into a NaN centroid.
  const denom = sumW > 0 ? sumW : 1
  const meanX = sumWX / denom
  const meanY = sumWY / denom

  let sqX = 0
  let sqY = 0
  for (const { pin, confidence } of pins) {
    const w = weightFor(confidence)
    const dx = pin.x - meanX
    const dy = pin.y - meanY
    sqX += w * dx * dx
    sqY += w * dy * dy
  }
  const sigmaX = Math.sqrt(sqX / denom)
  const sigmaY = Math.sqrt(sqY / denom)

  const cutoffX = GEO_CONSENSUS_SIGMA_MULTIPLIER * sigmaX
  const cutoffY = GEO_CONSENSUS_SIGMA_MULTIPLIER * sigmaY

  const decisions: GeoConsensusDecision[] = []
  let accepted = 0
  let rejected = 0

  for (const { id, pin } of pins) {
    const dx = pin.x - meanX
    const dy = pin.y - meanY
    const distance = Math.sqrt(dx * dx + dy * dy)

    const outsideSigma =
      (cutoffX > 0 && Math.abs(dx) > cutoffX) ||
      (cutoffY > 0 && Math.abs(dy) > cutoffY)
    const outsideRadius = distance > mapConsensusRadius

    const status: GeoPinStatus = outsideSigma || outsideRadius ? 'rejected' : 'accepted'
    if (status === 'accepted') accepted++
    else rejected++

    decisions.push({ pinId: id, status, distanceFromCentroid: distance })
  }

  const spread = Math.max(sigmaX, sigmaY)
  const confidence = Math.max(0, 1 - spread / Math.max(mapConsensusRadius, 1e-6))
  const promote = accepted >= GEO_CONSENSUS_MIN_PINS_TO_PROMOTE && confidence >= 0.5

  return {
    centroid: { x: meanX, y: meanY },
    sigmaX,
    sigmaY,
    acceptedCount: accepted,
    rejectedCount: rejected,
    decisions,
    promote,
    confidence,
    version: GEO_CONSENSUS_VERSION,
  }
}

/**
 * Tier rewards on accepted pins. Kept here (pure) so the reward worker can
 * ask "what should I grant?" without any infra coupling; the worker itself
 * translates this into `inventoryRepository.addItems()` calls.
 */
export interface GeoRewardGrant {
  itemType: 'powerup'
  itemKey: 'hint_letter' | 'second_chance' | 'streak_freeze'
  quantity: number
}

/**
 * Reward policy: tokens only (never multipliers / currency / score).
 * Legacy metadata hints and the dead `timer_extension` key were retired
 * 2026-06 (migration 20260613_retire_legacy_metadata_hints).
 *
 *  - every accepted pin inside 1σ → +1 hint_letter
 *  - accepted pin inside 0.5σ     → also +1 second_chance
 *  - every 10th accepted pin      → +1 streak_freeze
 */
export function grantsForAcceptedPin(args: {
  distanceFromCentroid: number
  sigmaX: number
  sigmaY: number
  userAcceptedCountAfterThis: number
}): GeoRewardGrant[] {
  const grants: GeoRewardGrant[] = []
  const sigma = Math.max(args.sigmaX, args.sigmaY, 1e-6)

  if (args.distanceFromCentroid <= sigma) {
    grants.push({ itemType: 'powerup', itemKey: 'hint_letter', quantity: 1 })
  }

  if (args.distanceFromCentroid <= sigma * 0.5) {
    grants.push({ itemType: 'powerup', itemKey: 'second_chance', quantity: 1 })
  }

  if (args.userAcceptedCountAfterThis > 0 && args.userAcceptedCountAfterThis % 10 === 0) {
    grants.push({ itemType: 'powerup', itemKey: 'streak_freeze', quantity: 1 })
  }

  return grants
}

export interface GeoConsensusService {
  evaluate(pins: GeoPinLike[], mapConsensusRadius: number): GeoConsensusResult
  grantsForAcceptedPin: typeof grantsForAcceptedPin
}

export interface GeoConsensusServiceDeps {
  logger: DomainLogger
}

export function createGeoConsensusService(
  deps: GeoConsensusServiceDeps,
): GeoConsensusService {
  const log = deps.logger.child({ service: 'geo-consensus' })

  return {
    evaluate(pins, mapConsensusRadius) {
      const result = evaluateConsensus(pins, mapConsensusRadius)
      log.debug(
        {
          pinCount: pins.length,
          accepted: result.acceptedCount,
          rejected: result.rejectedCount,
          confidence: result.confidence,
          promote: result.promote,
        },
        'evaluated consensus',
      )
      return result
    },
    grantsForAcceptedPin,
  }
}
