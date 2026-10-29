import { db } from '../../database/connection.js'
import { env } from '../../../config/env.js'
import { queueLogger } from '../../logger/logger.js'
import { sendEmail } from '../../email/email-sender.js'
import { renderEmailHtml, renderEmailText } from '../../email/template.js'
import { loadFeaturedLeader } from './featured-leader.js'

const log = queueLogger.child({ worker: 'streak-risk-email' })

const GUEST_EMAIL_DOMAIN = 'guest.thebox.local'

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

function buildHtml(
  displayName: string,
  streak: number,
  playUrl: string,
  unsubscribeUrl: string,
  leaderLine: string | null
): string {
  const paragraphs = [
    `Tu n'as pas encore joué au défi d'aujourd'hui. Sans action avant minuit, ta série de <strong style="color:#f0abfc;">${streak} jour${plural(streak)}</strong> repartira à zéro.`,
  ]
  if (leaderLine) paragraphs.push(leaderLine)
  return renderEmailHtml({
    heading: `Ta série de ${streak} jour${plural(streak)} est en danger, ${displayName} !`,
    paragraphs,
    cta: { label: 'Jouer le défi du jour', url: playUrl },
    tip: 'Astuce : invite un ami avec ton lien de parrainage et gagnez tous les deux des indices bonus.',
    footerHtml: `Tu reçois cet e-mail car tu as accepté les notifications marketing. <a href="${unsubscribeUrl}" style="color:#a78bfa;">Se désabonner</a>.`,
  })
}

function buildText(
  displayName: string,
  streak: number,
  playUrl: string,
  unsubscribeUrl: string,
  leaderLine: string | null
): string {
  const paragraphs = [
    `Tu n'as pas encore joué au défi d'aujourd'hui. Sans action avant minuit, ta série de ${streak} jour${plural(streak)} repartira à zéro.`,
  ]
  if (leaderLine) paragraphs.push(leaderLine)
  return renderEmailText({
    heading: `Ta série de ${streak} jour${plural(streak)} est en danger, ${displayName} !`,
    paragraphs,
    cta: { label: 'Jouer le défi du jour', url: playUrl },
    tip: 'Astuce : invite un ami avec ton lien de parrainage et gagnez tous les deux des indices bonus.',
    footerLines: [`Se désabonner : ${unsubscribeUrl}`],
  })
}

async function sendOne(user: StreakCandidate, leaderLine: string | null): Promise<'sent' | 'skipped' | 'failed'> {
  const displayName = user.display_name ?? user.name
  const playUrl = `${env.FRONTEND_URL}/fr/play`
  const unsubscribeUrl = `${env.FRONTEND_URL}/fr/profile`

  const result = await sendEmail({
    type: 'streak-risk',
    userId: user.id,
    to: user.email,
    subject: `Ta série de ${user.current_streak} jour${plural(user.current_streak)} est en danger`,
    html: buildHtml(displayName, user.current_streak, playUrl, unsubscribeUrl, leaderLine),
    text: buildText(displayName, user.current_streak, playUrl, unsubscribeUrl, leaderLine),
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

  const leader = await loadFeaturedLeader()
  const leaderLine = leader.safeName
    ? `Et pour te motiver : ${leader.safeName} est en tête du classement du jour avec ${leader.score} pts. Reprends ta place avant minuit !`
    : null

  let sent = 0
  let skipped = 0
  let failed = 0

  for (let i = 0; i < candidates.length; i++) {
    const outcome = await sendOne(candidates[i]!, leaderLine)
    if (outcome === 'sent') sent++
    else if (outcome === 'skipped') skipped++
    else failed++
    onProgress?.(i + 1, candidates.length)
  }

  const message = `streak-risk emails: ${sent} sent, ${skipped} skipped, ${failed} failed (of ${candidates.length} candidates)`
  log.info({ candidates: candidates.length, sent, skipped, failed }, message)

  return { candidates: candidates.length, sent, skipped, failed, message }
}
