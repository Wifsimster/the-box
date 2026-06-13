import { db } from '../../database/connection.js'
import { queueLogger } from '../../logger/logger.js'
import { pushService } from '../../../domain/services/index.js'
import { buildEveningNudge } from '../../../domain/services/evening-nudge-copy.js'
import { loadFeaturedLeader } from './featured-leader.js'

const log = queueLogger.child({ worker: 'evening-nudge' })

// Don't re-push the same user within this window even if the job runs twice
// (retry, or a second container). Mirrors the streak-risk cooldown.
const MIN_HOURS_BETWEEN_NUDGES = 20

// Don't greet brand-new accounts with a stranger's name on day one.
const MIN_ACCOUNT_AGE_DAYS = 2

export interface EveningNudgeResult {
  candidates: number
  enqueued: number
  failed: number
  leaderFeatured: boolean
  message: string
}

interface NudgeCandidate {
  id: string
  locale: string | null
}

/**
 * Users who should get tonight's "beat the leader" push:
 *   - have at least one active push subscription,
 *   - are a real (non-anonymous) account older than {@link MIN_ACCOUNT_AGE_DAYS},
 *   - have NOT played today's challenge,
 *   - are outside the per-user cooldown,
 *   - are not today's leader (also implied by "not played today"),
 *   - are NOT going to receive tonight's streak-risk email — mutual exclusion
 *     so a single user never gets both evening nudges. The streak-risk worker
 *     targets `current_streak >= 1 AND email_marketing_consent AND not played
 *     today`; those users get the (leader-enhanced) email instead.
 */
async function findCandidates(leaderUserId: string | null): Promise<NudgeCandidate[]> {
  let query = db('user')
    .join('push_subscriptions', 'push_subscriptions.user_id', 'user.id')
    .where('push_subscriptions.is_active', true)
    .whereRaw('"user"."isAnonymous" = ?', [false])
    .whereRaw('(last_played_at IS NULL OR last_played_at < CURRENT_DATE)')
    .whereRaw(
      `(last_evening_nudge_at IS NULL OR last_evening_nudge_at < NOW() - INTERVAL '${MIN_HOURS_BETWEEN_NUDGES} hours')`
    )
    .whereRaw(`"user"."createdAt" < NOW() - INTERVAL '${MIN_ACCOUNT_AGE_DAYS} days'`)
    .whereRaw('NOT (current_streak >= 1 AND COALESCE(email_marketing_consent, false) = true)')

  if (leaderUserId) {
    query = query.whereNot('user.id', leaderUserId)
  }

  const rows = await query.distinct<NudgeCandidate[]>('user.id as id', 'user.locale as locale')
  return rows
}

async function sendOne(
  candidate: NudgeCandidate,
  leaderName: string | null,
  leaderScore: number | null
): Promise<'enqueued' | 'failed'> {
  const locale = candidate.locale === 'en' ? 'en' : 'fr'
  const { title, body } = buildEveningNudge(locale, { leaderName, leaderScore })

  try {
    await pushService.sendToUser(candidate.id, {
      type: 'evening_nudge',
      title,
      body,
      url: `/${locale}/play`,
    })
    // Stamp on enqueue (push is fire-and-forget via the fan-out worker); the
    // cooldown makes a re-run a no-op for already-stamped users.
    await db('user').where('id', candidate.id).update({ last_evening_nudge_at: new Date() })
    return 'enqueued'
  } catch (err) {
    log.warn({ userId: candidate.id, err: String(err) }, 'evening-nudge enqueue failed')
    return 'failed'
  }
}

/**
 * Recurring evening push that pulls players back to today's daily challenge,
 * personalized with the current title holder. Fetches the leader ONCE, then
 * fans out to candidates. Empty board → privacy-safe "be the first" copy;
 * unsafe / opted-out leader name → score-only copy.
 */
export async function sendEveningNudges(
  onProgress?: (current: number, total: number) => void
): Promise<EveningNudgeResult> {
  if (!pushService.isConfigured()) {
    return {
      candidates: 0,
      enqueued: 0,
      failed: 0,
      leaderFeatured: false,
      message: 'push not configured; skipping evening-nudge run',
    }
  }

  const leader = await loadFeaturedLeader()
  const candidates = await findCandidates(leader.userId)

  log.info(
    { count: candidates.length, leaderFeatured: leader.safeName !== null, hasScore: leader.score !== null },
    'evening-nudge candidates identified'
  )

  let enqueued = 0
  let failed = 0

  for (let i = 0; i < candidates.length; i++) {
    const outcome = await sendOne(candidates[i]!, leader.safeName, leader.score)
    if (outcome === 'enqueued') enqueued++
    else failed++
    onProgress?.(i + 1, candidates.length)
  }

  const message = `evening-nudge: ${enqueued} enqueued, ${failed} failed (of ${candidates.length} candidates)`
  log.info({ candidates: candidates.length, enqueued, failed }, message)

  return {
    candidates: candidates.length,
    enqueued,
    failed,
    leaderFeatured: leader.safeName !== null,
    message,
  }
}
