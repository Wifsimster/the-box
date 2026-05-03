import { createHash } from 'crypto'
import { db } from '../../database/connection.js'
import { env } from '../../../config/env.js'
import { queueLogger } from '../../logger/logger.js'
import { rewardsService } from '../../../domain/services/index.js'
import { sendEmail } from '../../email/email-sender.js'
import { buildReactivationEmail } from '../../email/reactivation-email.js'
import { emitRewardGranted } from '../../socket/socket.js'
import type { RewardGrantedEvent } from '@the-box/types'

const log = queueLogger.child({ worker: 'reactivation-scan' })

const GUEST_EMAIL_DOMAIN = 'guest.thebox.local'

// Inactivity threshold. Users who have not played in the last 7 days are
// the audience; shorter than that and we'd be nagging healthy users.
const INACTIVITY_DAYS = 7

// Per-user cadence. Once a user has been served a chest, do not consider
// them again for 28 days regardless of subsequent churn cycles. Mirrors
// the PRD "every 4 weeks max" guardrail.
const REGRANT_COOLDOWN_DAYS = 28

// Account age floor — keeps us out of the welcome flow's lane.
const MIN_ACCOUNT_AGE_HOURS = 48

// Safety cap. If the candidate set blows past this, the query is wrong
// (broken migration, time skew, dev DB) and mailing the whole base is
// worse than aborting.
const MAX_CANDIDATES_PER_RUN = 5000

// Holdout share, in [0, 100). Per PRD: 10% of eligible users skip the
// chest grant but still receive the warm welcome-back email so we can
// measure D30 lift treatment-vs-holdout. Hash is on user_id only so a
// user is permanently in one cohort across weeks.
const HOLDOUT_PERCENT = 10

const REACTIVATION_ITEMS = [
    { itemType: 'powerup', itemKey: 'hint_developer', quantity: 1 },
    { itemType: 'powerup', itemKey: 'second_chance', quantity: 1 },
    { itemType: 'powerup', itemKey: 'streak_freeze', quantity: 1 },
] as const

export interface ReactivationScanResult {
    candidates: number
    treatmentGrants: number
    holdouts: number
    emailsSent: number
    emailsFailed: number
    aborted?: boolean
    message: string
}

interface ReactivationCandidate {
    id: string
    email: string
    locale: string | null
}

/**
 * Stable per-user 0-99 bucket. Hash is on user_id only — NOT user_id+week
 * — so a given user is always treatment OR always holdout for this
 * feature, regardless of when the worker fires.
 */
export function reactivationBucket(userId: string): number {
    const digest = createHash('sha256').update(userId).digest()
    // First 4 bytes as unsigned int, mod 100. 4 bytes is plenty of entropy
    // for a 100-bucket split and avoids BigInt for a uint64.
    const n = digest.readUInt32BE(0)
    return n % 100
}

export function isHoldoutUser(userId: string): boolean {
    return reactivationBucket(userId) < HOLDOUT_PERCENT
}

/** ISO-week label `YYYY-Www`, lowercase. UTC. */
function isoWeekLabel(now: Date = new Date()): string {
    // ISO 8601 week algorithm. The Thursday of the same week determines
    // the year, so a Sunday in early January can belong to week 52 of
    // the prior year — handled below.
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const day = d.getUTCDay() || 7 // Sunday = 7
    d.setUTCDate(d.getUTCDate() + 4 - day)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
    const yyyy = d.getUTCFullYear()
    const ww = String(week).padStart(2, '0')
    return `${yyyy}-w${ww}`
}

async function findCandidates(): Promise<ReactivationCandidate[]> {
    // The eligibility join filters out users who:
    //   - opted out of marketing emails (we never re-engage non-consenting users)
    //   - own a guest email
    //   - registered less than 48 h ago (welcome flow's lane)
    //   - have NEVER played (onboarding's lane — never-played users are
    //     not "lapsed"; they're "not yet started")
    //   - are still active (played within the last 7 days)
    //   - already received a reactivation chest within the cooldown window
    //
    // Same eligibility on BOTH cohorts — the holdout split is downstream
    // of this query so the A/B variable is the chest, not the audience.
    const rows = await db('user as u')
        .select<ReactivationCandidate[]>('u.id', 'u.email', 'u.locale')
        .where('u.email_marketing_consent', true)
        .whereNot('u.email', 'like', `%@${GUEST_EMAIL_DOMAIN}`)
        .whereRaw(`u."createdAt" < NOW() - INTERVAL '${MIN_ACCOUNT_AGE_HOURS} hours'`)
        .whereNotNull('u.last_played_at')
        .whereRaw(`u.last_played_at < NOW() - INTERVAL '${INACTIVITY_DAYS} days'`)
        .whereRaw(
            `NOT EXISTS (
              SELECT 1 FROM reward_grants rg
              WHERE rg.user_id = u.id
                AND rg.source = 'reactivation'
                AND rg.granted_at > NOW() - INTERVAL '${REGRANT_COOLDOWN_DAYS} days'
            )`
        )
        .limit(MAX_CANDIDATES_PER_RUN + 1)
    return rows
}

function localeOf(candidate: ReactivationCandidate): 'fr' | 'en' {
    return candidate.locale === 'en' ? 'en' : 'fr'
}

function playUrlFor(locale: 'fr' | 'en'): string {
    const base = env.API_URL?.replace(/\/$/, '') || ''
    return `${base}/${locale}/play`
}

export async function scanReactivationCandidates(
    onProgress?: (current: number, total: number) => void
): Promise<ReactivationScanResult> {
    const candidates = await findCandidates()
    const week = isoWeekLabel()

    if (candidates.length > MAX_CANDIDATES_PER_RUN) {
        // Sanity-check the query — better to abort than to ship a single
        // bad migration that double-mails the whole base.
        log.error(
            { candidates: candidates.length, max: MAX_CANDIDATES_PER_RUN },
            'reactivation-scan candidate set exceeded safety cap — aborting'
        )
        return {
            candidates: candidates.length,
            treatmentGrants: 0,
            holdouts: 0,
            emailsSent: 0,
            emailsFailed: 0,
            aborted: true,
            message: `aborted: ${candidates.length} candidates exceeds safety cap`,
        }
    }

    log.info({ candidates: candidates.length, week }, 'reactivation-scan candidates')

    let treatmentGrants = 0
    let holdouts = 0
    let emailsSent = 0
    let emailsFailed = 0

    for (let i = 0; i < candidates.length; i++) {
        const user = candidates[i]
        if (!user) continue

        const holdout = isHoldoutUser(user.id)
        const sourceRef = `reactivation:${week}`
        const locale = localeOf(user)

        try {
            if (holdout) {
                // Record the holdout for queryable measurement. PK on
                // (user_id, week) makes a re-scan within the same week
                // a no-op.
                await db('reactivation_holdouts')
                    .insert({ user_id: user.id, week })
                    .onConflict(['user_id', 'week'])
                    .ignore()
                holdouts++
            } else {
                // Stage the chest: NOT auto-unlocked. The grant becomes
                // unlockable when the user submits their first guess on
                // return — see game.service.submitGuess hook. The grant
                // call is idempotent on (user_id, source, source_ref) so
                // a worker retry inside the same week is a no-op.
                const result = await rewardsService.grant({
                    userId: user.id,
                    source: 'reactivation',
                    sourceRef,
                    items: REACTIVATION_ITEMS.map((it) => ({ ...it })),
                })
                if (result.wasNew) {
                    treatmentGrants++
                    const event: RewardGrantedEvent = {
                        rewardId: result.grant.id,
                        source: result.grant.source,
                        sourceRef: result.grant.sourceRef,
                        items: result.grant.payload.items,
                        grantedAt: result.grant.grantedAt,
                        unlockedAt: result.grant.unlockedAt,
                    }
                    emitRewardGranted(user.id, event)
                }
            }

            // Email both cohorts so the A/B's only differing variable is
            // the chest, not the email exposure.
            const { subject, html, text } = buildReactivationEmail({
                locale,
                playUrl: playUrlFor(locale),
            })
            const send = await sendEmail({
                type: 'reactivation-chest',
                to: user.email,
                subject,
                html,
                text,
                userId: user.id,
            })
            if (send.status === 'sent' || send.status === 'skipped') {
                // 'skipped' = no Resend key configured (dev). We still
                // count it as a successful run for the worker — the
                // chest staging is the user-visible action.
                emailsSent++
            } else {
                emailsFailed++
            }
        } catch (error) {
            emailsFailed++
            log.error(
                { userId: user.id, error: String(error) },
                'reactivation-scan error for user'
            )
        }

        if (onProgress) onProgress(i + 1, candidates.length)
    }

    const result: ReactivationScanResult = {
        candidates: candidates.length,
        treatmentGrants,
        holdouts,
        emailsSent,
        emailsFailed,
        message: `reactivation: candidates=${candidates.length} grants=${treatmentGrants} holdouts=${holdouts} emails=${emailsSent}/${emailsSent + emailsFailed}`,
    }
    log.info(result, 'reactivation-scan complete')
    return result
}
