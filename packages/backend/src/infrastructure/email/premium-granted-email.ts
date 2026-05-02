import { env } from '../../config/env.js'
import { sendEmail, type SendEmailResult } from './email-sender.js'
import { renderEmailHtml, renderEmailText } from './template.js'

export interface PremiumGrantedEmailInput {
  userId: string
  to: string
  /** Display name used in the greeting; falls back to "joueur" if blank. */
  displayName: string | null | undefined
  /** Locale for the email copy. Currently 'fr' or 'en'; defaults to 'fr'. */
  locale?: 'fr' | 'en'
}

interface Copy {
  subject: string
  eyebrow: string
  heading: string
  paragraphs: string[]
  ctaLabel: string
  tip: string
}

function copyFor(displayName: string, locale: 'fr' | 'en'): Copy {
  if (locale === 'en') {
    return {
      subject: 'Premium unlocked — welcome to The Box',
      eyebrow: 'Premium unlocked',
      heading: `Welcome to Premium, ${displayName}!`,
      paragraphs: [
        'An admin just granted you <strong style="color:#f0abfc;">lifetime Premium</strong> on The Box. No charge, no expiration — it\'s yours.',
        'You now have access to the full archive of past challenges, unlimited hints in catch-up mode, and the Premium badge on your profile.',
      ],
      ctaLabel: 'Open my profile',
      tip: 'Refresh your browser if your profile still shows the free tier.',
    }
  }
  return {
    subject: 'Premium activé — bienvenue sur The Box',
    eyebrow: 'Premium activé',
    heading: `Bienvenue dans Premium, ${displayName} !`,
    paragraphs: [
      'Un administrateur vient de t\'offrir le <strong style="color:#f0abfc;">Premium à vie</strong> sur The Box. Aucun paiement, aucune expiration — c\'est pour toi.',
      'Tu as désormais accès à toutes les archives de défis, aux indices illimités en mode rattrapage, et au badge Premium sur ton profil.',
    ],
    ctaLabel: 'Voir mon profil',
    tip: 'Rafraîchis la page si ton profil affiche encore le palier gratuit.',
  }
}

/**
 * Notifies a user that an admin has granted them lifetime Premium.
 * Delegates to the shared `sendEmail` chokepoint so it lands in the
 * `email_log` audit trail like every other transactional mail.
 */
export async function sendPremiumGrantedEmail(
  input: PremiumGrantedEmailInput,
): Promise<SendEmailResult> {
  const locale = input.locale ?? 'fr'
  const displayName = (input.displayName ?? '').trim() || (locale === 'en' ? 'player' : 'joueur')
  const copy = copyFor(displayName, locale)
  const profileUrl = `${env.FRONTEND_URL}/${locale}/profile`

  const html = renderEmailHtml({
    eyebrow: copy.eyebrow,
    heading: copy.heading,
    paragraphs: copy.paragraphs,
    cta: { label: copy.ctaLabel, url: profileUrl },
    tip: copy.tip,
  })
  const text = renderEmailText({
    heading: copy.heading,
    paragraphs: copy.paragraphs,
    cta: { label: copy.ctaLabel, url: profileUrl },
    tip: copy.tip,
  })

  return sendEmail({
    type: 'premium-granted',
    userId: input.userId,
    to: input.to,
    subject: copy.subject,
    html,
    text,
  })
}
