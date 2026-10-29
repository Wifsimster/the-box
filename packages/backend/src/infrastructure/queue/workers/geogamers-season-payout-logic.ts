import { queueLogger } from '../../logger/logger.js'
import {
  rewardsService,
  geoGamersSeasonService,
} from '../../../composition/services.js'
import { emitRewardGranted, emitGeoGamersSeasonUpdated } from '../../socket/socket.js'
import { priorMonthLabel } from './leaderboard-payout-period.js'
import type { RewardGrantedEvent } from '@the-box/types'

const log = queueLogger.child({ module: 'geogamers-season-payout' })

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

  try {
    emitGeoGamersSeasonUpdated({ month: period.label, topN: eligible.slice(0, 10) })
  } catch (error) {
    log.warn({ error: String(error) }, 'failed to emit season updated')
  }

  const message = `geogamers-payout: month=${period.label} candidates=${eligible.length} granted=${granted} failures=${failures}`
  log.info({ month: period.label, granted, failures }, message)
  return { month: period.label, candidates: eligible.length, granted, failures, message }
}
