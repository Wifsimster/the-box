import { renderEmailHtml, renderEmailText } from './template.js'

export type ReactivationLocale = 'fr' | 'en'

interface ReactivationCopy {
    subject: string
    heading: string
    paragraphs: string[]
    ctaLabel: string
    tip: string
    footer: string
}

/**
 * IMPORTANT — copy ban-list (per the rewards meeting + PRD):
 *
 *   FR: never use *perdre*, *manquer*, *rater*, *oublier*, countdown timers,
 *       streak-shaming ("ta série de X jours est en danger"), exclamation
 *       stacking, or red CTA framing.
 *   EN: never use *miss*, *lose*, *forget*, countdown timers, streak-shaming,
 *       or exclamation-mark stacking.
 *
 * Tone is invitation, never loss-aversion. Subject lines are declarative,
 * not interrogative-anxious. Below copy is the canonical version — review
 * EVERY edit against the ban list (a CI grep test enforces it for FR).
 */
const COPY: Record<ReactivationLocale, ReactivationCopy> = {
    fr: {
        subject: 'Le screenshot du jour t\'attend',
        heading: 'Bon retour',
        paragraphs: [
            'De nouveaux jeux ont rejoint la collection.',
            'Joue un screenshot quand tu veux : ton coffre de retour s\'ouvrira automatiquement.',
        ],
        ctaLabel: 'Voir le screenshot',
        tip: 'Tu reçois ce message parce que tu joues à The Box.',
        footer: 'Pour ne plus recevoir ces messages, ajuste tes préférences depuis ton profil.',
    },
    en: {
        subject: 'Today\'s screenshot is waiting',
        heading: 'Welcome back',
        paragraphs: [
            'New games have joined the collection.',
            'Play one screenshot whenever you like — your welcome chest will open automatically.',
        ],
        ctaLabel: 'See today\'s screenshot',
        tip: 'You\'re receiving this because you play The Box.',
        footer: 'To stop these messages, update your preferences from your profile.',
    },
}

export interface BuildReactivationEmailInput {
    locale: ReactivationLocale
    playUrl: string
}

export function buildReactivationEmail(input: BuildReactivationEmailInput): {
    subject: string
    html: string
    text: string
} {
    const c = COPY[input.locale]
    const html = renderEmailHtml({
        heading: c.heading,
        paragraphs: c.paragraphs,
        cta: { label: c.ctaLabel, url: input.playUrl },
        tip: c.tip,
        footerHtml: c.footer,
    })
    const text = renderEmailText({
        heading: c.heading,
        paragraphs: c.paragraphs,
        cta: { label: c.ctaLabel, url: input.playUrl },
        tip: c.tip,
        footerLines: [c.footer],
    })
    return { subject: c.subject, html, text }
}

/**
 * Words and patterns that are forbidden in reactivation copy. Exposed so a
 * unit test can grep the canonical strings (and any future tweak) for them
 * — keeps the ban-list mechanically enforced rather than just documented.
 */
export const REACTIVATION_COPY_BAN_LIST = {
    fr: [
        // loss-aversion verbs / nouns
        'perdre',
        'perdras',
        'perds',
        'manquer',
        'manqueras',
        'rater',
        'raté',
        'oublier',
        // streak-anxiety phrasings
        'ta série',
        'série en danger',
        'plus que',
        'urgent',
        'vite',
    ],
    en: [
        'miss',
        'lose',
        'losing',
        'forget',
        'forgot',
        'streak in danger',
        'hurry',
        'last chance',
    ],
} as const
