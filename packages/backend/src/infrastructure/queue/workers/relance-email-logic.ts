import { db } from '../../database/connection.js'
import { resend } from '../../auth/auth.js'
import { env } from '../../../config/env.js'
import { queueLogger } from '../../logger/logger.js'

const log = queueLogger.child({ worker: 'relance-email' })

const GUEST_EMAIL_DOMAIN = 'guest.thebox.local'

// How often we are willing to re-nudge the same user. Mirrors the
// streak-risk cooldown so lapsed users never get two marketing emails
// from us inside a single calendar day.
const MIN_HOURS_BETWEEN_EMAILS = 20

// Minimum account age before a user is eligible for relance nudges.
// Keeps us off the toes of the welcome flow for brand-new signups.
const MIN_ACCOUNT_AGE_HOURS = 48

// Safety cap on the first production run — if the candidate set balloons
// past this, something is off with the query (migration race, wrong env)
// and it is safer to abort than to blast the whole user base.
const MAX_CANDIDATES_PER_RUN = 5000

export interface RelanceEmailResult {
  candidates: number
  sent: number
  skipped: number
  failed: number
  aborted?: boolean
  message: string
}

interface RelanceCandidate {
  id: string
  email: string
  display_name: string | null
  name: string
  current_day_in_cycle: number
}

/**
 * Returns users who:
 *   - have opted in to marketing emails,
 *   - own a non-guest account at least 48h old,
 *   - have a login-streak row whose daily reward was not claimed today,
 *   - did not log in today (otherwise the claim modal handles it),
 *   - were not already nudged by relance or streak-risk within the
 *     cooldown window (mutual exclusion).
 *
 * All date comparisons run against the database clock in UTC, matching
 * the rest of the recurring jobs in the system.
 */
async function findCandidates(): Promise<RelanceCandidate[]> {
  const rows = await db('user as u')
    .join('user_login_streaks as s', 's.user_id', 'u.id')
    .select<RelanceCandidate[]>(
      'u.id',
      'u.email',
      'u.display_name',
      'u.name',
      's.current_day_in_cycle'
    )
    .where('u.email_marketing_consent', true)
    .whereNot('u.email', 'like', `%@${GUEST_EMAIL_DOMAIN}`)
    .whereRaw(`u."createdAt" < NOW() - INTERVAL '${MIN_ACCOUNT_AGE_HOURS} hours'`)
    .whereRaw(`(s.last_claimed_date IS NULL OR s.last_claimed_date < CURRENT_DATE)`)
    .whereRaw(`(s.last_login_date IS NULL OR s.last_login_date < CURRENT_DATE)`)
    .whereRaw(
      `(u.last_relance_email_at IS NULL OR u.last_relance_email_at < NOW() - INTERVAL '${MIN_HOURS_BETWEEN_EMAILS} hours')`
    )
    .whereRaw(
      `(u.last_streak_risk_email_at IS NULL OR u.last_streak_risk_email_at < CURRENT_DATE)`
    )

  return rows
}

function buildHtml(displayName: string, streakDay: number, playUrl: string, unsubscribeUrl: string): string {
  return `
    <div style="background:#0b0612;padding:24px 0;font-family:-apple-system,Segoe UI,Arial,sans-serif;">
      <div style="max-width:520px;margin:0 auto;background:#140a26;border:1px solid #2a1644;border-radius:14px;padding:28px 24px;color:#ece8f5;">
        <div style="font-size:13px;letter-spacing:2px;color:#c084fc;text-transform:uppercase;margin-bottom:8px;">The Box</div>
        <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#ffffff;">
          Salut ${displayName}, ta récompense quotidienne t'attend
        </h1>
        <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#cfc6e6;">
          Tu ne t'es pas connecté(e) aujourd'hui — du coup, ton cadeau du <strong style="color:#f0abfc;">jour ${streakDay}</strong> dort encore dans ton inventaire.
        </p>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#cfc6e6;">
          Un clic suffit pour le récupérer (et garder un peu de carburant pour les indices du prochain défi).
        </p>
        <div style="text-align:center;margin:28px 0;">
          <a href="${playUrl}" style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#a855f7,#ec4899);color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;">
            Récupérer ma récompense
          </a>
        </div>
        <p style="margin:0;font-size:12px;line-height:1.5;color:#7a6f93;">
          Astuce : les indices Année et Éditeur reçus en récompense évitent la pénalité sur ton score.
        </p>
        <hr style="margin:28px 0 16px;border:none;border-top:1px solid #2a1644;" />
        <p style="margin:0;font-size:11px;color:#6b6189;line-height:1.5;">
          Tu reçois cet e-mail car tu as accepté les rappels de récompense. <a href="${unsubscribeUrl}" style="color:#a78bfa;">Se désabonner</a>.
        </p>
      </div>
    </div>
  `
}

function buildText(displayName: string, streakDay: number, playUrl: string, unsubscribeUrl: string): string {
  return [
    `Salut ${displayName},`,
    '',
    `Ta récompense quotidienne du jour ${streakDay} t'attend dans ton inventaire — tu ne l'as pas encore récupérée aujourd'hui.`,
    '',
    `Récupère-la ici : ${playUrl}`,
    '',
    'Astuce : les indices Année et Éditeur évitent la pénalité sur ton score.',
    '',
    `Se désabonner : ${unsubscribeUrl}`,
    '— The Box',
  ].join('\n')
}

async function sendOne(user: RelanceCandidate): Promise<'sent' | 'skipped' | 'failed'> {
  const displayName = user.display_name ?? user.name
  const playUrl = `${env.FRONTEND_URL}/fr/play`
  const unsubscribeUrl = `${env.FRONTEND_URL}/fr/profile`

  if (!resend) {
    log.info({ userId: user.id }, '[DEV] relance email skipped — no Resend key configured')
    return 'skipped'
  }

  try {
    const { error } = await resend.emails.send({
      from: `The Box <${env.EMAIL_FROM}>`,
      to: user.email,
      subject: `Coucou, ta récompense t'attend dans la Box`,
      html: buildHtml(displayName, user.current_day_in_cycle, playUrl, unsubscribeUrl),
      text: buildText(displayName, user.current_day_in_cycle, playUrl, unsubscribeUrl),
    })

    if (error) {
      log.warn({ userId: user.id, error: error.message }, 'relance email send failed')
      return 'failed'
    }

    await db('user').where('id', user.id).update({ last_relance_email_at: new Date() })
    return 'sent'
  } catch (err) {
    log.error({ userId: user.id, error: String(err) }, 'relance email unexpected error')
    return 'failed'
  }
}

export async function sendRelanceEmails(
  onProgress?: (current: number, total: number) => void
): Promise<RelanceEmailResult> {
  if (env.RELANCE_EMAIL_ENABLED !== 'true') {
    const message = 'relance-email disabled via RELANCE_EMAIL_ENABLED=false'
    log.info(message)
    return { candidates: 0, sent: 0, skipped: 0, failed: 0, message }
  }

  const candidates = await findCandidates()
  log.info({ count: candidates.length }, 'relance candidates identified')

  if (candidates.length > MAX_CANDIDATES_PER_RUN) {
    const message = `relance-email aborted: ${candidates.length} candidates exceed safety cap (${MAX_CANDIDATES_PER_RUN})`
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

  const message = `relance emails: ${sent} sent, ${skipped} skipped, ${failed} failed (of ${candidates.length} candidates)`
  log.info({ candidates: candidates.length, sent, skipped, failed }, message)

  return { candidates: candidates.length, sent, skipped, failed, message }
}
