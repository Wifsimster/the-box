/**
 * GeoGamers Season Payout Logic
 *
 * Runs on the 1st of the month to close the season that just ended: ranks the
 * final standings and grants a season-frame cosmetic to the top finishers.
 *
 * Integrity gate (per the anonymous-play/season decision): only NON-provisional
 * finishers (>= min days played) are eligible for a payout — a handful of days
 * can't win a season. Full first-attempt-correct anomaly screening + admin
 * review is a documented follow-up; this worker enforces the days-played floor,
 * which is the cheap, high-value half.
 *
 * Idempotent via the reward_grants unique (userId, sourceRef); a re-run grants
 * nothing new.
 */

import { queueLogger } from '../../logger/logger.js'
import { rewardsService, geoGamersSeasonService } from '../../../domain/services/index.js'
import { emitRewardGranted, emitGeoGamersSeasonUpdated } from '../../socket/socket.js'
import { priorMonthLabel } from './leaderboard-payout-period.js'
import type { RewardGrantedEvent } from '@the-box/types'

const log = queueLogger.child({ module: 'geogamers-season-payout' })

// Top N finishers receive the season frame. Mirrors the classic monthly
// leaderboard's recognition tier size.
const SEASON_PAYOUT_TOP_N = 100

function seasonFrameItemKey(label: string): string {
  return `geogamers_season_frame_${label.replace('-', '_')}`
}

export interface GeoGamersSeasonPayoutResult {
  month: string
  candidates: number
  granted: number
  failures: number
  message: string
}

export async function grantGeoGamersSeasonPayout(
  onProgress?: (current: number, total: number) => void,
  now: Date = new Date(),
): Promise<GeoGamersSeasonPayoutResult> {
  const period = priorMonthLabel(now)
  const sourceRef = `geogamers_payout:season:${period.label}`
  const itemKey = seasonFrameItemKey(period.label)
  log.info({ month: period.label, sourceRef, itemKey }, 'geogamers season payout starting')

  const standings = await geoGamersSeasonService.standings(period.label, SEASON_PAYOUT_TOP_N)
  // Eligibility gate: non-provisional finishers only.
  const eligible = standings.filter((s) => !s.provisional)

  let granted = 0
  let failures = 0
  for (let i = 0; i < eligible.length; i++) {
    const entry = eligible[i]!
    onProgress?.(i + 1, eligible.length)
    try {
      const result = await rewardsService.grant({
        userId: entry.userId,
        source: 'leaderboard_payout',
        sourceRef,
        items: [{ itemType: 'cosmetic', itemKey, quantity: 1 }],
      })
      if (result.wasNew) {
        granted++
        const event: RewardGrantedEvent = {
          rewardId: result.grant.id,
          source: result.grant.source,
          sourceRef: result.grant.sourceRef,
          items: result.grant.payload.items,
          grantedAt: result.grant.grantedAt,
          unlockedAt: result.grant.unlockedAt,
        }
        emitRewardGranted(entry.userId, event)
      }
    } catch (error) {
      failures++
      log.error({ userId: entry.userId, error: String(error) }, 'geogamers payout grant failed')
    }
  }

  // Broadcast the finalized top standings so any open leaderboard refreshes.
  try {
    emitGeoGamersSeasonUpdated({ month: period.label, topN: eligible.slice(0, 10) })
  } catch (error) {
    log.warn({ error: String(error) }, 'failed to emit season updated')
  }

  const message = `geogamers-payout: month=${period.label} candidates=${eligible.length} granted=${granted} failures=${failures}`
  log.info({ month: period.label, granted, failures }, message)
  return { month: period.label, candidates: eligible.length, granted, failures, message }
}
