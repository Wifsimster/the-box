import { db } from '../../database/connection.js'
import { queueLogger } from '../../logger/logger.js'
import { achievementService } from '../../../domain/services/index.js'
import { emitAchievementUnlocked } from '../../socket/socket.js'

const log = queueLogger.child({ worker: 'milestone-account-age' })

const GUEST_EMAIL_DOMAIN = 'guest.thebox.local'

// Active-ish window. Awarding an account-age milestone to a user who has
// not opened the app in months has zero retention value — they will not
// see it. Same 60-day window used by streak-freeze-grant; we re-check
// daily so a returning user gets their milestone within 24 h.
const ACTIVE_DAYS = 60

// Account-age thresholds we currently award. Keeping the list explicit
// here (rather than scanning all achievements with type=account_age_days)
// lets the worker pre-filter candidates with one simple SQL clause —
// only users old enough to have crossed the smallest threshold are
// considered. The achievement evaluator is the source of truth on which
// thresholds actually award; the worker just narrows the input set.
const MIN_THRESHOLD_DAYS = 365

// Safety cap. Same rationale as the other recurring workers.
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
                // This sweep is the only unlock path for account-age
                // milestones — without this push the user is never told.
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
