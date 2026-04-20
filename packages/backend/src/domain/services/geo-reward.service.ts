import type { DomainLogger } from '../ports/logger.js'
import type {
  GeoContributorRepository,
  GeoPinRepository,
  GeoScreenshotRepository,
  InventoryRepository,
} from '../ports/repositories.js'
import type {
  GeoConsensusDecision,
  GeoConsensusResult,
  GeoRewardGrant,
} from './geo-consensus.service.js'
import { grantsForAcceptedPin } from './geo-consensus.service.js'

// One-shot summary emitted to the socket namespace + returned from the worker.
export interface GeoRewardSummary {
  userId: string
  geoScreenshotCandidateId: number
  grants: GeoRewardGrant[]
  newAcceptedCount: number
}

export interface GeoRewardService {
  /**
   * Persist a consensus decision: update each pin's status, grant tokens to
   * accepted contributors, bump contributor counters, promote the candidate
   * if consensus says so, and shadow-ban abusers whose 7-day rejection ratio
   * crosses the threshold.
   *
   * Idempotent on `applyDecision` (pins already reviewed are skipped by the
   * repository via their status check).
   */
  applyConsensus(args: {
    geoScreenshotCandidateId: number
    geoMapId: number
    result: GeoConsensusResult
    pinOwners: Map<number, string>
  }): Promise<GeoRewardSummary[]>
}

export interface GeoRewardServiceDeps {
  logger: DomainLogger
  inventoryRepository: InventoryRepository
  geoPinRepository: GeoPinRepository
  geoContributorRepository: GeoContributorRepository
  geoScreenshotRepository: GeoScreenshotRepository
}

export const SHADOW_BAN_REJECTION_RATIO = 0.6
export const SHADOW_BAN_MIN_SUBMISSIONS = 10

export function createGeoRewardService(deps: GeoRewardServiceDeps): GeoRewardService {
  const {
    inventoryRepository,
    geoPinRepository,
    geoContributorRepository,
    geoScreenshotRepository,
  } = deps
  const log = deps.logger.child({ service: 'geo-reward' })

  return {
    async applyConsensus({ geoScreenshotCandidateId, geoMapId, result, pinOwners }) {
      log.info(
        {
          candidateId: geoScreenshotCandidateId,
          accepted: result.acceptedCount,
          rejected: result.rejectedCount,
          promote: result.promote,
        },
        'applyConsensus',
      )

      // 1. Persist each pin decision (no-op for already-reviewed pins is fine).
      for (const d of result.decisions) {
        await geoPinRepository.applyDecision({
          pinId: d.pinId,
          status: d.status,
          distanceFromCentroid: d.distanceFromCentroid,
        })
      }

      // 2. Aggregate submitted/accepted/rejected per user and bump counters.
      const perUser = aggregatePerUser(result.decisions, pinOwners)
      for (const [userId, counts] of perUser) {
        await geoContributorRepository.bumpCounters({
          userId,
          submittedDelta: counts.submitted,
          acceptedDelta: counts.accepted,
          rejectedDelta: counts.rejected,
        })
      }

      // 3. Grant tokens to users with accepted pins, respecting tightness
      // relative to the centroid. Shadow-banned users receive zero rewards.
      const summaries: GeoRewardSummary[] = []
      for (const [userId, counts] of perUser) {
        if (counts.accepted === 0) continue

        const stats = await geoContributorRepository.getStats(userId)
        if (stats?.shadowBanned) {
          log.info({ userId }, 'skip rewards — shadow banned')
          continue
        }

        const grants: GeoRewardGrant[] = []
        for (const d of counts.acceptedDecisions) {
          const perPinGrants = grantsForAcceptedPin({
            distanceFromCentroid: d.distanceFromCentroid,
            sigmaX: result.sigmaX,
            sigmaY: result.sigmaY,
            userAcceptedCountAfterThis: stats?.totalAccepted ?? 0,
          })
          grants.push(...perPinGrants)
        }

        for (const g of grants) {
          await inventoryRepository.addItems(userId, g.itemType, g.itemKey, g.quantity)
        }

        summaries.push({
          userId,
          geoScreenshotCandidateId,
          grants,
          newAcceptedCount: (stats?.totalAccepted ?? 0) + counts.accepted,
        })
      }

      // 4. Anti-abuse: re-check shadow-ban for anyone touched this pass.
      for (const userId of perUser.keys()) {
        const { submitted, rejected } = await geoPinRepository.userRejectionRatio7d(userId)
        if (submitted >= SHADOW_BAN_MIN_SUBMISSIONS) {
          const ratio = rejected / submitted
          if (ratio > SHADOW_BAN_REJECTION_RATIO) {
            await geoContributorRepository.setShadowBanned(userId, true)
          }
        }
      }

      // 5. Promote the candidate if consensus cleared the bar.
      if (result.promote) {
        const existing =
          await geoScreenshotRepository.findMetaByCandidateId(geoScreenshotCandidateId)
        if (!existing) {
          await geoScreenshotRepository.promoteCandidateToMeta({
            candidateId: geoScreenshotCandidateId,
            geoMapId,
            canonicalX: result.centroid.x,
            canonicalY: result.centroid.y,
            confidence: result.confidence,
            consensusVersion: result.version,
            promotedVia: 'consensus',
          })
        }
      }

      return summaries
    },
  }
}

interface UserCounts {
  submitted: number
  accepted: number
  rejected: number
  acceptedDecisions: GeoConsensusDecision[]
}

function aggregatePerUser(
  decisions: GeoConsensusDecision[],
  pinOwners: Map<number, string>,
): Map<string, UserCounts> {
  const out = new Map<string, UserCounts>()

  for (const d of decisions) {
    const userId = pinOwners.get(d.pinId)
    if (!userId) continue

    let counts = out.get(userId)
    if (!counts) {
      counts = { submitted: 0, accepted: 0, rejected: 0, acceptedDecisions: [] }
      out.set(userId, counts)
    }
    counts.submitted++
    if (d.status === 'accepted') {
      counts.accepted++
      counts.acceptedDecisions.push(d)
    } else if (d.status === 'rejected') {
      counts.rejected++
    }
  }

  return out
}
