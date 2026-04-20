import type { DomainLogger } from '../ports/logger.js'
import type { GeoPoint, GeoPinStatus } from '@the-box/types'

// Pin count thresholds at which the consensus worker should recompute.
export const GEO_CONSENSUS_THRESHOLDS = [5, 10, 20, 50] as const

// Minimum pins required before we can promote a candidate to canonical.
export const GEO_CONSENSUS_MIN_PINS_TO_PROMOTE = 5

// Pins farther than this many standard deviations from the centroid are
// rejected. σ is computed per-axis against the current pin set.
export const GEO_CONSENSUS_SIGMA_MULTIPLIER = 2

// Current consensus algorithm version; bumped alongside formula changes so a
// retroactive re-run can distinguish old vs new decisions.
export const GEO_CONSENSUS_VERSION = 1

export interface GeoPinLike {
  id: number
  pin: GeoPoint
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
 * Compute mean/σ on each axis and mark pins outside σ-multiplier * σ OR
 * outside the map's consensus radius as rejected. Promotion to canonical
 * requires ≥ min-pins AND a tight enough cluster (confidence > 0.5).
 *
 * Confidence is a bounded, interpretable signal: 1 when all pins sit on top
 * of each other, 0 when the spread equals the map's consensus radius.
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

  let sumX = 0
  let sumY = 0
  for (const { pin } of pins) {
    sumX += pin.x
    sumY += pin.y
  }
  const meanX = sumX / n
  const meanY = sumY / n

  let sqX = 0
  let sqY = 0
  for (const { pin } of pins) {
    const dx = pin.x - meanX
    const dy = pin.y - meanY
    sqX += dx * dx
    sqY += dy * dy
  }
  const sigmaX = Math.sqrt(sqX / n)
  const sigmaY = Math.sqrt(sqY / n)

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
  itemKey: 'hint_year' | 'hint_publisher' | 'hint_developer' | 'timer_extension'
  quantity: number
}

/**
 * Reward policy: tokens only (never multipliers / currency / score).
 *
 *  - every accepted pin inside 1σ → +1 hint_year
 *  - accepted pin inside 0.5σ     → also +1 hint_publisher or hint_developer
 *  - every 10th accepted pin      → +1 timer_extension
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
    grants.push({ itemType: 'powerup', itemKey: 'hint_year', quantity: 1 })
  }

  if (args.distanceFromCentroid <= sigma * 0.5) {
    const tight: GeoRewardGrant['itemKey'] =
      args.userAcceptedCountAfterThis % 2 === 0 ? 'hint_publisher' : 'hint_developer'
    grants.push({ itemType: 'powerup', itemKey: tight, quantity: 1 })
  }

  if (args.userAcceptedCountAfterThis > 0 && args.userAcceptedCountAfterThis % 10 === 0) {
    grants.push({ itemType: 'powerup', itemKey: 'timer_extension', quantity: 1 })
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
