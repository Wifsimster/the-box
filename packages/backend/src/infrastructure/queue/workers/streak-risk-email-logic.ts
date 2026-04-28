import { db } from '../../database/connection.js'
import { env } from '../../../config/env.js'
import { queueLogger } from '../../logger/logger.js'
import { sendEmail } from '../../email/email-sender.js'
import { renderEmailHtml, renderEmailText } from '../../email/template.js'

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

function plural(n: number): string {
  return n > 1 ? 's' : ''
}

function buildHtml(displayName: string, streak: number, playUrl: string, unsubscribeUrl: string): string {
  return renderEmailHtml({
    heading: `Ta série de ${streak} jour${plural(streak)} est en danger, ${displayName} !`,
    paragraphs: [
      `Tu n'as pas encore joué au défi d'aujourd'hui. Sans action avant minuit, ta série de <strong style="color:#f0abfc;">${streak} jour${plural(streak)}</strong> repartira à zéro.`,
    ],
    cta: { label: 'Jouer le défi du jour', url: playUrl },
    tip: 'Astuce : invite un ami avec ton lien de parrainage et gagnez tous les deux des indices bonus.',
    footerHtml: `Tu reçois cet e-mail car tu as accepté les notifications marketing. <a href="${unsubscribeUrl}" style="color:#a78bfa;">Se désabonner</a>.`,
  })
}

function buildText(displayName: string, streak: number, playUrl: string, unsubscribeUrl: string): string {
  return renderEmailText({
    heading: `Ta série de ${streak} jour${plural(streak)} est en danger, ${displayName} !`,
    paragraphs: [
      `Tu n'as pas encore joué au défi d'aujourd'hui. Sans action avant minuit, ta série de ${streak} jour${plural(streak)} repartira à zéro.`,
    ],
    cta: { label: 'Jouer le défi du jour', url: playUrl },
    tip: 'Astuce : invite un ami avec ton lien de parrainage et gagnez tous les deux des indices bonus.',
    footerLines: [`Se désabonner : ${unsubscribeUrl}`],
  })
}

async function sendOne(user: StreakCandidate): Promise<'sent' | 'skipped' | 'failed'> {
  const displayName = user.display_name ?? user.name
  const playUrl = `${env.FRONTEND_URL}/fr/play`
  const unsubscribeUrl = `${env.FRONTEND_URL}/fr/profile`

  const result = await sendEmail({
    type: 'streak-risk',
    userId: user.id,
    to: user.email,
    subject: `Ta série de ${user.current_streak} jour${plural(user.current_streak)} est en danger`,
    html: buildHtml(displayName, user.current_streak, playUrl, unsubscribeUrl),
    text: buildText(displayName, user.current_streak, playUrl, unsubscribeUrl),
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
