import { queueLogger } from '../../logger/logger.js'
import {
  rewardsService,
} from '../../../composition/services.js'
import { leaderboardRepository } from '../../repositories/index.js'
import { emitRewardGranted } from '../../socket/socket.js'
import { priorMonthLabel, frameItemKey } from './leaderboard-payout-period.js'
import type { RewardGrantedEvent } from '@the-box/types'

const log = queueLogger.child({ worker: 'leaderboard-payout' })

const MONTHLY_TOP_N = 100

export interface LeaderboardPayoutResult {
    period: string
    candidates: number
    granted: number
    failures: number
    message: string
}

export { priorMonthLabel, frameItemKey } from './leaderboard-payout-period.js'

export async function grantMonthlyLeaderboardPayout(
    onProgress?: (current: number, total: number) => void
): Promise<LeaderboardPayoutResult> {
    const period = priorMonthLabel()
    const sourceRef = `leaderboard_payout:monthly:${period.label}`
    const itemKey = frameItemKey(period.label)

    log.info({ period: period.label, sourceRef, itemKey }, 'leaderboard-payout starting')

    const top = await leaderboardRepository.findByMonth(
        period.year,
        period.month,
        MONTHLY_TOP_N
    )

    let granted = 0
    let failures = 0

    for (let i = 0; i < top.length; i++) {
        const entry = top[i]
        if (!entry) continue
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
            log.error(
                { userId: entry.userId, period: period.label, error: String(error) },
                'leaderboard-payout grant failed for user'
            )
        }
        if (onProgress) onProgress(i + 1, top.length)
    }

    const result: LeaderboardPayoutResult = {
        period: period.label,
        candidates: top.length,
        granted,
        failures,
        message: `leaderboard-payout: period=${period.label} candidates=${top.length} granted=${granted} failures=${failures}`,
    }
    log.info(result, 'leaderboard-payout complete')
    return result
}
