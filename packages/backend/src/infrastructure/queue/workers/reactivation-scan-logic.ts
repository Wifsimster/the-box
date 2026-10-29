import { db } from '../../database/connection.js'
import { env } from '../../../config/env.js'
import { queueLogger } from '../../logger/logger.js'
import {
  rewardsService,
} from '../../../composition/services.js'
import { sendEmail } from '../../email/email-sender.js'
import { buildReactivationEmail } from '../../email/reactivation-email.js'
import { emitRewardGranted } from '../../socket/socket.js'
import {
    reactivationBucket,
    isHoldoutUser,
} from './reactivation-bucket.js'
import type { RewardGrantedEvent } from '@the-box/types'

const log = queueLogger.child({ worker: 'reactivation-scan' })

const GUEST_EMAIL_DOMAIN = 'guest.thebox.local'

const INACTIVITY_DAYS = 7

const REGRANT_COOLDOWN_DAYS = 28

const MIN_ACCOUNT_AGE_HOURS = 48

const MAX_CANDIDATES_PER_RUN = 5000

const REACTIVATION_ITEMS = [
    { itemType: 'powerup', itemKey: 'hint_letter', quantity: 1 },
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

export { reactivationBucket, isHoldoutUser }

function isoWeekLabel(now: Date = new Date()): string {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const day = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - day)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
    const yyyy = d.getUTCFullYear()
    const ww = String(week).padStart(2, '0')
    return `${yyyy}-w${ww}`
}

async function findCandidates(): Promise<ReactivationCandidate[]> {
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
                await db('reactivation_holdouts')
                    .insert({ user_id: user.id, week })
                    .onConflict(['user_id', 'week'])
                    .ignore()
                holdouts++
            } else {
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
