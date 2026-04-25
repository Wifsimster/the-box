import { db } from '../../database/connection.js'
import { resend } from '../../auth/auth.js'
import { env } from '../../../config/env.js'
import { queueLogger } from '../../logger/logger.js'

const log = queueLogger.child({ worker: 'referral-announcement-email' })

const GUEST_EMAIL_DOMAIN = 'guest.thebox.local'

// Safety cap. The job is one-shot per user but a misconfigured DB would
// otherwise mail the entire base in a single boot.
const MAX_CANDIDATES_PER_RUN = 10000

export interface ReferralAnnouncementResult {
  candidates: number
  sent: number
  skipped: number
  failed: number
  aborted?: boolean
  message: string
}

interface AnnouncementCandidate {
  id: string
  email: string
  display_name: string | null
  name: string
}

/**
 * Returns existing users who:
 *   - have opted in to marketing emails,
 *   - own a non-guest account,
 *   - have not already received the referral announcement.
 *
 * The `referral_announcement_email_sent_at IS NULL` clause is the dedupe
 * key — once stamped, a user is permanently excluded from this batch so
 * the job is safe to retry after partial failures or re-runs on later
 * deploys.
 */
async function findCandidates(): Promise<AnnouncementCandidate[]> {
  const rows = await db('user')
    .select<AnnouncementCandidate[]>('id', 'email', 'display_name', 'name')
    .where('email_marketing_consent', true)
    .whereNot('email', 'like', `%@${GUEST_EMAIL_DOMAIN}`)
    .whereNull('referral_announcement_email_sent_at')

  return rows
}

function buildHtml(displayName: string, inviteUrl: string, unsubscribeUrl: string): string {
  return `
    <div style="background:#0b0612;padding:24px 0;font-family:-apple-system,Segoe UI,Arial,sans-serif;">
      <div style="max-width:560px;margin:0 auto;background:#140a26;border:1px solid #2a1644;border-radius:14px;padding:32px 28px;color:#ece8f5;">
        <div style="font-size:13px;letter-spacing:2px;color:#c084fc;text-transform:uppercase;margin-bottom:8px;">The Box · Nouveauté</div>
        <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#ffffff;">
          Le parrainage débarque, ${displayName} !
        </h1>
        <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#cfc6e6;">
          On vient de lancer le <strong style="color:#f0abfc;">parrainage</strong> : invite tes amis à rejoindre The Box et vous gagnez <strong>tous les deux</strong> des bonus dès leur inscription.
        </p>

        <div style="background:#1c0e34;border:1px solid #3a1f5c;border-radius:10px;padding:18px 20px;margin:22px 0;">
          <div style="font-size:12px;letter-spacing:1.5px;color:#a78bfa;text-transform:uppercase;margin-bottom:10px;">Récompenses</div>
          <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#ece8f5;">
            <strong style="color:#f0abfc;">Pour ton filleul :</strong> 3 indices « année » + 2 indices « éditeur ».
          </p>
          <p style="margin:0;font-size:14px;line-height:1.5;color:#ece8f5;">
            <strong style="color:#f0abfc;">Pour toi, le parrain :</strong> 2 indices « année », 1 indice « éditeur » et le badge exclusif <em>Ambassadeur</em> sur ton profil.
          </p>
        </div>

        <p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#cfc6e6;">
          Ton lien d'invitation personnel est prêt — partage-le, et regarde ton inventaire grossir à chaque ami qui t'a rejoint.
        </p>

        <div style="text-align:center;margin:28px 0;">
          <a href="${inviteUrl}" style="display:inline-block;padding:14px 30px;background:linear-gradient(135deg,#a855f7,#ec4899);color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;">
            Récupérer mon lien
          </a>
        </div>

        <p style="margin:0;font-size:12px;line-height:1.5;color:#7a6f93;">
          Astuce : tu retrouveras ton lien et tes statistiques de parrainage à tout moment depuis la carte « Parrainage » de ton profil.
        </p>

        <hr style="margin:28px 0 16px;border:none;border-top:1px solid #2a1644;" />
        <p style="margin:0;font-size:11px;color:#6b6189;line-height:1.5;">
          Tu reçois cet e-mail car tu as accepté de recevoir nos actualités. <a href="${unsubscribeUrl}" style="color:#a78bfa;">Se désabonner</a>.
        </p>
      </div>
    </div>
  `
}

function buildText(displayName: string, inviteUrl: string, unsubscribeUrl: string): string {
  return [
    `Salut ${displayName},`,
    '',
    'Le parrainage débarque sur The Box !',
    '',
    'Invite tes amis et vous gagnez tous les deux des bonus :',
    "  • Pour ton filleul : 3 indices « année » + 2 indices « éditeur »",
    "  • Pour toi : 2 indices « année », 1 indice « éditeur » et le badge Ambassadeur",
    '',
    `Ton lien d'invitation personnel : ${inviteUrl}`,
    '',
    `Se désabonner : ${unsubscribeUrl}`,
    '— The Box',
  ].join('\n')
}

async function sendOne(user: AnnouncementCandidate): Promise<'sent' | 'skipped' | 'failed'> {
  const displayName = user.display_name ?? user.name
  const inviteUrl = `${env.FRONTEND_URL}/fr?ref=${encodeURIComponent(user.id)}`
  const unsubscribeUrl = `${env.FRONTEND_URL}/fr/profile`

  if (!resend) {
    log.info({ userId: user.id }, '[DEV] referral-announcement email skipped — no Resend key configured')
    // Stamp the user even in dev so a later run with Resend configured
    // does not double-mail accounts created before the announcement.
    await db('user').where('id', user.id).update({ referral_announcement_email_sent_at: new Date() })
    return 'skipped'
  }

  try {
    const { error } = await resend.emails.send({
      from: `The Box <${env.EMAIL_FROM}>`,
      to: user.email,
      subject: 'Nouveau : invite tes amis et gagnez des bonus ensemble',
      html: buildHtml(displayName, inviteUrl, unsubscribeUrl),
      text: buildText(displayName, inviteUrl, unsubscribeUrl),
    })

    if (error) {
      log.warn({ userId: user.id, error: error.message }, 'referral-announcement email send failed')
      return 'failed'
    }

    await db('user').where('id', user.id).update({ referral_announcement_email_sent_at: new Date() })
    return 'sent'
  } catch (err) {
    log.error({ userId: user.id, error: String(err) }, 'referral-announcement email unexpected error')
    return 'failed'
  }
}

export async function sendReferralAnnouncementEmails(
  onProgress?: (current: number, total: number) => void
): Promise<ReferralAnnouncementResult> {
  const candidates = await findCandidates()
  log.info({ count: candidates.length }, 'referral-announcement candidates identified')

  if (candidates.length > MAX_CANDIDATES_PER_RUN) {
    const message = `referral-announcement aborted: ${candidates.length} candidates exceed safety cap (${MAX_CANDIDATES_PER_RUN})`
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

  const message = `referral-announcement emails: ${sent} sent, ${skipped} skipped, ${failed} failed (of ${candidates.length} candidates)`
  log.info({ candidates: candidates.length, sent, skipped, failed }, message)

  return { candidates: candidates.length, sent, skipped, failed, message }
}
