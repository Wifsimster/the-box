import { db } from '../../database/connection.js'
import { env } from '../../../config/env.js'
import { queueLogger } from '../../logger/logger.js'
import { sendEmail } from '../../email/email-sender.js'

const log = queueLogger.child({ worker: 'streak-risk-email' })

const GUEST_EMAIL_DOMAIN = 'guest.thebox.local'

// How often we are willing to re-nudge the same user — even if they have
// a fresh streak risk every day, we don't want to mail them daily.
const MIN_HOURS_BETWEEN_EMAILS = 20

export interface StreakRiskResult {
  candidates: number
  sent: number
  skipped: number
  failed: number
  message: string
}

interface StreakCandidate {
  id: string
  email: string
  display_name: string | null
  name: string
  current_streak: number
}

/**
 * Returns users who:
 *   - have opted in to marketing emails,
 *   - own a non-guest account,
 *   - have an active streak (>= 1),
 *   - have not played today (their streak is about to break at midnight),
 *   - were not already nudged within the cooldown window.
 *
 * Uses a day-boundary comparison against `now - interval '1 day'` so the
 * timezone chosen at the database layer (UTC) stays consistent with the
 * rest of the scheduled jobs.
 */
async function findCandidates(): Promise<StreakCandidate[]> {
  const rows = await db('user')
    .select<StreakCandidate[]>('id', 'email', 'display_name', 'name', 'current_streak')
    .where('email_marketing_consent', true)
    .where('current_streak', '>=', 1)
    .whereNot('email', 'like', `%@${GUEST_EMAIL_DOMAIN}`)
    .whereRaw(`(last_played_at IS NULL OR last_played_at < CURRENT_DATE)`)
    .whereRaw(
      `(last_streak_risk_email_at IS NULL OR last_streak_risk_email_at < NOW() - INTERVAL '${MIN_HOURS_BETWEEN_EMAILS} hours')`
    )

  return rows
}

function buildHtml(displayName: string, streak: number, playUrl: string, unsubscribeUrl: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;">
      <h1 style="color: #7c3aed;">Votre série de ${streak} jour${streak > 1 ? 's' : ''} est en danger !</h1>
      <p>Salut ${displayName},</p>
      <p>Vous n'avez pas encore joué au défi d'aujourd'hui. Sans action avant minuit, votre série de <strong>${streak} jour${streak > 1 ? 's' : ''}</strong> repartira à zéro.</p>
      <p>
        <a href="${playUrl}" style="display: inline-block; padding: 12px 24px; background: #7c3aed; color: #fff; text-decoration: none; border-radius: 8px; font-weight: bold;">
          Jouer le défi du jour
        </a>
      </p>
      <p style="color: #666; font-size: 13px;">Astuce : invitez un ami avec votre lien de parrainage et gagnez tous les deux des indices bonus.</p>
      <hr style="margin-top: 32px; border: none; border-top: 1px solid #eee;" />
      <p style="color: #999; font-size: 11px;">
        Vous recevez cet e-mail car vous avez accepté les notifications marketing. Vous pouvez <a href="${unsubscribeUrl}" style="color: #999;">vous désabonner</a> à tout moment depuis votre profil.
      </p>
    </div>
  `
}

async function sendOne(user: StreakCandidate): Promise<'sent' | 'skipped' | 'failed'> {
  const displayName = user.display_name ?? user.name
  const playUrl = `${env.FRONTEND_URL}/fr/play`
  const unsubscribeUrl = `${env.FRONTEND_URL}/fr/profile`

  const result = await sendEmail({
    type: 'streak-risk',
    userId: user.id,
    to: user.email,
    subject: `Votre série de ${user.current_streak} jour${user.current_streak > 1 ? 's' : ''} est en danger`,
    html: buildHtml(displayName, user.current_streak, playUrl, unsubscribeUrl),
  })

  if (result.status === 'sent') {
    await db('user').where('id', user.id).update({ last_streak_risk_email_at: new Date() })
  }
  return result.status
}

export async function sendStreakRiskEmails(
  onProgress?: (current: number, total: number) => void
): Promise<StreakRiskResult> {
  const candidates = await findCandidates()
  log.info({ count: candidates.length }, 'streak-risk candidates identified')

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

  const message = `streak-risk emails: ${sent} sent, ${skipped} skipped, ${failed} failed (of ${candidates.length} candidates)`
  log.info({ candidates: candidates.length, sent, skipped, failed }, message)

  return { candidates: candidates.length, sent, skipped, failed, message }
}
