import { db } from '../../database/connection.js'
import { env } from '../../../config/env.js'
import { queueLogger } from '../../logger/logger.js'
import { sendEmail } from '../../email/email-sender.js'
import { renderEmailHtml, renderEmailText } from '../../email/template.js'

const log = queueLogger.child({ worker: 'inactive-user-reminder' })

const GUEST_EMAIL_DOMAIN = 'guest.thebox.local'

// Per-user cooldown. Once someone has received a win-back nudge, we wait
// a full month before trying again — a longer window than the daily
// workers because re-engaging a silent user is a slow game and we don't
// want to become the reason they unsubscribe.
const MIN_DAYS_BETWEEN_EMAILS = 30

// Matches the relance worker: keep us out of the welcome flow for
// brand-new signups.
const MIN_ACCOUNT_AGE_HOURS = 48

// Safety cap. If the candidate set blows past this, the query is wrong
// (wrong env, failed migration, broken clock) and mailing the whole base
// would be worse than aborting.
const MAX_CANDIDATES_PER_RUN = 5000

export interface InactiveUserReminderResult {
  candidates: number
  sent: number
  skipped: number
  failed: number
  aborted?: boolean
  message: string
}

interface InactiveCandidate {
  id: string
  email: string
  display_name: string | null
  name: string
  last_played_at: Date | null
}

/**
 * Returns users who:
 *   - have opted in to marketing emails,
 *   - own a non-guest account at least 48h old,
 *   - have played at least once (welcome funnel owns never-played users),
 *   - have not played in the last N days,
 *   - have not had any Better Auth session refreshed in the last N days
 *     (so someone who still logs in to browse the leaderboard is spared),
 *   - were not already nudged by this worker within the cooldown window.
 *
 * All date math runs against the database clock in UTC, matching the
 * other recurring workers.
 */
async function findCandidates(inactivityDays: number): Promise<InactiveCandidate[]> {
  const rows = await db('user as u')
    .select<InactiveCandidate[]>(
      'u.id',
      'u.email',
      'u.display_name',
      'u.name',
      'u.last_played_at'
    )
    .where('u.email_marketing_consent', true)
    .whereNot('u.email', 'like', `%@${GUEST_EMAIL_DOMAIN}`)
    .whereRaw(`u."createdAt" < NOW() - INTERVAL '${MIN_ACCOUNT_AGE_HOURS} hours'`)
    .whereNotNull('u.last_played_at')
    .whereRaw(`u.last_played_at < NOW() - INTERVAL '${inactivityDays} days'`)
    .whereRaw(
      `NOT EXISTS (
         SELECT 1 FROM "session" s
         WHERE s."userId" = u.id
           AND s."updatedAt" > NOW() - INTERVAL '${inactivityDays} days'
       )`
    )
    .whereRaw(
      `(u.last_inactive_reminder_email_at IS NULL
        OR u.last_inactive_reminder_email_at < NOW() - INTERVAL '${MIN_DAYS_BETWEEN_EMAILS} days')`
    )

  return rows
}

function daysSince(date: Date | null): number {
  if (!date) return 0
  const ms = Date.now() - new Date(date).getTime()
  return Math.max(1, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

function buildHtml(displayName: string, days: number, playUrl: string, unsubscribeUrl: string): string {
  return renderEmailHtml({
    heading: `Ça fait ${days} jours, ${displayName}…`,
    paragraphs: [
      `Ton dernier passage dans la Box remonte à <strong style="color:#f0abfc;">${days} jours</strong>. Les défis du jour continuent de tomber sans toi — et on aimerait bien te revoir.`,
      `Un nouveau défi t'attend dès maintenant. Quelques secondes suffisent pour retrouver la main.`,
    ],
    cta: { label: 'Relancer une partie', url: playUrl },
    tip: "Astuce : ton inventaire d'indices est toujours là, intact, prêt à servir sur le prochain défi.",
    footerHtml: `Tu reçois cet e-mail car tu as accepté les rappels par e-mail. <a href="${unsubscribeUrl}" style="color:#a78bfa;">Se désabonner</a>.`,
  })
}

function buildText(displayName: string, days: number, playUrl: string, unsubscribeUrl: string): string {
  return renderEmailText({
    heading: `Ça fait ${days} jours, ${displayName}…`,
    paragraphs: [
      `Ça fait ${days} jours qu'on ne t'a pas vu(e) dans la Box. Un nouveau défi t'attend — et ton inventaire d'indices est toujours là, intact.`,
    ],
    cta: { label: 'Reprends une partie', url: playUrl },
    footerLines: [`Se désabonner : ${unsubscribeUrl}`],
  })
}

async function sendOne(user: InactiveCandidate): Promise<'sent' | 'skipped' | 'failed'> {
  const displayName = user.display_name ?? user.name
  const days = daysSince(user.last_played_at)
  const playUrl = `${env.FRONTEND_URL}/fr/play`
  const unsubscribeUrl = `${env.FRONTEND_URL}/fr/profile`

  const result = await sendEmail({
    type: 'inactive-reminder',
    userId: user.id,
    to: user.email,
    subject: `${displayName}, ça fait ${days} jours — on t'attend dans la Box`,
    html: buildHtml(displayName, days, playUrl, unsubscribeUrl),
    text: buildText(displayName, days, playUrl, unsubscribeUrl),
  })

  if (result.status === 'sent') {
    await db('user').where('id', user.id).update({ last_inactive_reminder_email_at: new Date() })
  }
  return result.status
}

export async function sendInactiveUserReminderEmails(
  onProgress?: (current: number, total: number) => void
): Promise<InactiveUserReminderResult> {
  if (env.INACTIVE_USER_REMINDER_ENABLED !== 'true') {
    const message = 'inactive-user-reminder disabled via INACTIVE_USER_REMINDER_ENABLED=false'
    log.info(message)
    return { candidates: 0, sent: 0, skipped: 0, failed: 0, message }
  }

  const inactivityDays = Number.parseInt(env.INACTIVE_USER_REMINDER_DAYS, 10)
  if (!Number.isFinite(inactivityDays) || inactivityDays < 1) {
    const message = `inactive-user-reminder aborted: invalid INACTIVE_USER_REMINDER_DAYS=${env.INACTIVE_USER_REMINDER_DAYS}`
    log.warn(message)
    return { candidates: 0, sent: 0, skipped: 0, failed: 0, aborted: true, message }
  }

  const candidates = await findCandidates(inactivityDays)
  log.info({ count: candidates.length, inactivityDays }, 'inactive-user-reminder candidates identified')

  if (candidates.length > MAX_CANDIDATES_PER_RUN) {
    const message = `inactive-user-reminder aborted: ${candidates.length} candidates exceed safety cap (${MAX_CANDIDATES_PER_RUN})`
    log.warn({ count: candidates.length, cap: MAX_CANDIDATES_PER_RUN }, message)
    return { candidates: candidates.length, sent: 0, skipped: 0, failed: 0, aborted: true, message }
  }

  let sent = 0
  let skipped = 0
  let failed = 0

  for (let i = 0; i < candidates.length; i++) {
    const outcome = await sendOne(candidates[i]!)
    if (outcome === 'sent') sent++
    else if (outcome === 'skipped') skipped++
    else failed++
    onProgress?.(i + 1, candidates.length)
  }

  const message = `inactive-user-reminder emails: ${sent} sent, ${skipped} skipped, ${failed} failed (of ${candidates.length} candidates, threshold ${inactivityDays}d)`
  log.info({ candidates: candidates.length, sent, skipped, failed, inactivityDays }, message)

  return { candidates: candidates.length, sent, skipped, failed, message }
}
