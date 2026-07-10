import type { DomainLogger } from '../ports/logger.js'
import type { GeoPinConfidence, GeoPinSource, GeoPoint, GeoPinStatus } from '@the-box/types'

// Pin count thresholds at which the consensus worker should recompute.
export const GEO_CONSENSUS_THRESHOLDS = [5, 10, 20, 50] as const

// Minimum accepted HUMAN pins required before we can promote a candidate to
// canonical. Agent pins never count toward this — see GEO_CONSENSUS_VERSION 3.
export const GEO_CONSENSUS_MIN_PINS_TO_PROMOTE = 5

// Pins farther than this many standard deviations from the centroid are
// rejected. σ is computed per-axis against the current pin set.
export const GEO_CONSENSUS_SIGMA_MULTIPLIER = 2

// Current consensus algorithm version; bumped alongside formula changes so a
// retroactive re-run can distinguish old vs new decisions. v2 introduced
// confidence-weighted centroid + variance. v3 (issue #331) adds source-weighted
// contributions AND makes the promote gate count only accepted HUMAN pins, so
// machine-proposed pins can sharpen the centroid but can never promote ground
// truth on their own.
export const GEO_CONSENSUS_VERSION = 3

// Multiplicative weight by pin provenance, composed with the confidence weight.
// Human pins count fully; scraped structured-coordinate pins are downweighted;
// experimental vision pins count least. Missing source is treated as 'human'
// (legacy rows / the crowd path), preserving pre-v3 behaviour on human data.
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

function confidenceWeight(confidence: GeoPinConfidence | undefined): number {
  if (confidence == null) return 1.0
  return GEO_CONSENSUS_CONFIDENCE_WEIGHTS[confidence]
}

// Effective contribution weight = confidence weight × source weight. A pin's
// pull on the centroid/variance scales with both how sure the author claimed to
// be and how much we trust that class of author.
function weightFor(
  confidence: GeoPinConfidence | undefined,
  source: GeoPinSource | undefined,
): number {
  return confidenceWeight(confidence) * sourceWeight(source)
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
  // Provenance; defaults to 'human' when omitted. Agent sources are
  // downweighted and excluded from the promote count.
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
  // Accepted pins whose source is human. This — not acceptedCount — gates
  // promotion, so agent pins can never carry a candidate over the line.
  humanAcceptedCount: number
  rejectedCount: number
  decisions: GeoConsensusDecision[]
  promote: boolean
  confidence: number
  version: number
}

/**
 * Compute weighted mean/σ on each axis and mark pins outside σ-multiplier
 * * σ OR outside the map's consensus radius as rejected. Promotion to
 * canonical requires ≥ min-pins accepted HUMAN pins AND a tight enough
 * cluster (confidence > 0.5) — agent pins never count toward that gate.
 *
 * Each pin contributes proportionally to its self-reported confidence
 * ("sure" 1.0, "approx" 0.66, "guess" 0.33) times its source weight
 * (human 1.0, agent_structured 0.6, agent_vision 0.25). Pins without a
 * recorded confidence/source count as sure/human — preserving pre-v3
 * behaviour for the historical dataset and the crowd path.
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
      humanAcceptedCount: 0,
      rejectedCount: 0,
      decisions: [],
      promote: false,
      confidence: 0,
      version: GEO_CONSENSUS_VERSION,
    }
  }

  // Weighted centroid. Weight = confidence × source, so agent pins pull the
  // centroid less than human pins (and low-confidence pins less than sure ones).
  let sumW = 0
  let sumWX = 0
  let sumWY = 0
  for (const { pin, confidence, source } of pins) {
    const w = weightFor(confidence, source)
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
  // Promote gate counts HUMAN accepted pins only. This is the #331 invariant:
  // however many agent pins pile up, a candidate can never promote without the
  // crowd (or an admin override) — machine writes sharpen, never decide.
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
