import type { DomainLogger } from '../ports/logger.js'
import type { GeoPinConfidence, GeoPinSource, GeoPoint, GeoPinStatus } from '@the-box/types'

export const GEO_CONSENSUS_THRESHOLDS = [5, 10, 20, 50] as const

export const GEO_CONSENSUS_MIN_PINS_TO_PROMOTE = 5

export const GEO_CONSENSUS_SIGMA_MULTIPLIER = 2

export const GEO_CONSENSUS_VERSION = 3

export const GEO_CONSENSUS_SOURCE_WEIGHTS: Record<GeoPinSource, number> = {
  human: 1.0,
  agent_structured: 0.6,
  agent_vision: 0.25,
}

function sourceWeight(source: GeoPinSource | undefined): number {
  if (source == null) return 1.0
  return GEO_CONSENSUS_SOURCE_WEIGHTS[source]
}

function isHuman(source: GeoPinSource | undefined): boolean {
  return source == null || source === 'human'
}

export const GEO_CONSENSUS_CONFIDENCE_WEIGHTS: Record<GeoPinConfidence, number> = {
  1: 1.0,
  2: 0.66,
  3: 0.33,
}

function confidenceWeight(confidence: GeoPinConfidence | undefined): number {
  if (confidence == null) return 1.0
  return GEO_CONSENSUS_CONFIDENCE_WEIGHTS[confidence]
}

function weightFor(
  confidence: GeoPinConfidence | undefined,
  source: GeoPinSource | undefined,
): number {
  return confidenceWeight(confidence) * sourceWeight(source)
}

export function pinsToNextConsensusThreshold(pinCount: number): number {
  const next = GEO_CONSENSUS_THRESHOLDS.find((t) => t > pinCount)
  return next === undefined ? 0 : next - pinCount
}

export interface GeoPinLike {
  id: number
  pin: GeoPoint
  confidence?: GeoPinConfidence
  source?: GeoPinSource
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
  humanAcceptedCount: number
  rejectedCount: number
  decisions: GeoConsensusDecision[]
  promote: boolean
  confidence: number
  version: number
}

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
      humanAcceptedCount: 0,
      rejectedCount: 0,
      decisions: [],
      promote: false,
      confidence: 0,
      version: GEO_CONSENSUS_VERSION,
    }
  }

  let sumW = 0
  let sumWX = 0
  let sumWY = 0
  for (const { pin, confidence, source } of pins) {
    const w = weightFor(confidence, source)
    sumW += w
    sumWX += w * pin.x
    sumWY += w * pin.y
  }
  const denom = sumW > 0 ? sumW : 1
  const meanX = sumWX / denom
  const meanY = sumWY / denom

  let sqX = 0
  let sqY = 0
  for (const { pin, confidence, source } of pins) {
    const w = weightFor(confidence, source)
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
  let humanAccepted = 0
  let rejected = 0

  for (const { id, pin, source } of pins) {
    const dx = pin.x - meanX
    const dy = pin.y - meanY
    const distance = Math.sqrt(dx * dx + dy * dy)

    const outsideSigma =
      (cutoffX > 0 && Math.abs(dx) > cutoffX) ||
      (cutoffY > 0 && Math.abs(dy) > cutoffY)
    const outsideRadius = distance > mapConsensusRadius

    const status: GeoPinStatus = outsideSigma || outsideRadius ? 'rejected' : 'accepted'
    if (status === 'accepted') {
      accepted++
      if (isHuman(source)) humanAccepted++
    } else {
      rejected++
    }

    decisions.push({ pinId: id, status, distanceFromCentroid: distance })
  }

  const spread = Math.max(sigmaX, sigmaY)
  const confidence = Math.max(0, 1 - spread / Math.max(mapConsensusRadius, 1e-6))
  const promote = humanAccepted >= GEO_CONSENSUS_MIN_PINS_TO_PROMOTE && confidence >= 0.5

  return {
    centroid: { x: meanX, y: meanY },
    sigmaX,
    sigmaY,
    acceptedCount: accepted,
    humanAcceptedCount: humanAccepted,
    rejectedCount: rejected,
    decisions,
    promote,
    confidence,
    version: GEO_CONSENSUS_VERSION,
  }
}

export interface GeoRewardGrant {
  itemType: 'powerup'
  itemKey: 'hint_letter' | 'second_chance' | 'streak_freeze'
  quantity: number
}

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
