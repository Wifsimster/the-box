import { db } from '../../database/connection.js'
import { queueLogger } from '../../logger/logger.js'
import {
  achievementService,
} from '../../../composition/services.js'
import { emitAchievementUnlocked } from '../../socket/socket.js'

const log = queueLogger.child({ worker: 'milestone-account-age' })

const GUEST_EMAIL_DOMAIN = 'guest.thebox.local'

const ACTIVE_DAYS = 60

const MIN_THRESHOLD_DAYS = 365

const MAX_CANDIDATES_PER_RUN = 5000

export interface MilestoneAccountAgeResult {
    candidates: number
    usersWithUnlocks: number
    totalUnlocks: number
    failures: number
    aborted?: boolean
    message: string
}

interface CandidateRow {
    id: string
}

async function findCandidates(): Promise<CandidateRow[]> {
    const rows = await db('user as u')
        .select<CandidateRow[]>('u.id')
        .whereNot('u.email', 'like', `%@${GUEST_EMAIL_DOMAIN}`)
        .whereRaw(`u."createdAt" < NOW() - INTERVAL '${MIN_THRESHOLD_DAYS} days'`)
        .whereNotNull('u.last_played_at')
        .whereRaw(`u.last_played_at > NOW() - INTERVAL '${ACTIVE_DAYS} days'`)
        .limit(MAX_CANDIDATES_PER_RUN + 1)
    return rows
}

export async function evaluateAccountAgeMilestones(
    onProgress?: (current: number, total: number) => void
): Promise<MilestoneAccountAgeResult> {
    const candidates = await findCandidates()

    if (candidates.length > MAX_CANDIDATES_PER_RUN) {
        log.error(
            { candidates: candidates.length, max: MAX_CANDIDATES_PER_RUN },
            'milestone-account-age candidate set exceeded safety cap — aborting'
        )
        return {
            candidates: candidates.length,
            usersWithUnlocks: 0,
            totalUnlocks: 0,
            failures: 0,
            aborted: true,
            message: `aborted: ${candidates.length} candidates exceeds safety cap`,
        }
    }

    log.info({ candidates: candidates.length }, 'milestone-account-age candidates')

    let usersWithUnlocks = 0
    let totalUnlocks = 0
    let failures = 0

    for (let i = 0; i < candidates.length; i++) {
        const user = candidates[i]
        if (!user) continue
        try {
            const earned = await achievementService.evaluateAccountAgeMilestones(
                user.id
            )
            if (earned.length > 0) {
                usersWithUnlocks++
                totalUnlocks += earned.length
                emitAchievementUnlocked(user.id, earned)
            }
        } catch (error) {
            failures++
            log.error(
                { userId: user.id, error: String(error) },
                'milestone-account-age evaluation failed for user'
            )
        }
        if (onProgress) onProgress(i + 1, candidates.length)
    }

    const result: MilestoneAccountAgeResult = {
        candidates: candidates.length,
        usersWithUnlocks,
        totalUnlocks,
        failures,
        message: `milestone-account-age: candidates=${candidates.length} users=${usersWithUnlocks} unlocks=${totalUnlocks} failures=${failures}`,
    }
    log.info(result, 'milestone-account-age complete')
    return result
}
