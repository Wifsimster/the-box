export type EveningNudgeLocale = 'fr' | 'en'

export interface EveningNudgeContext {
  leaderName: string | null
  leaderScore: number | null
}

export interface EveningNudgeCopy {
  title: string
  body: string
}

const MAX_NAME_LENGTH = 20

export function truncateDisplayName(name: string, max = MAX_NAME_LENGTH): string {
  const trimmed = name.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1).trimEnd()}…`
}

function formatScore(score: number, locale: EveningNudgeLocale): string {
  const sep = locale === 'fr' ? ' ' : ','
  return Math.round(score).toString().replace(/\B(?=(\d{3})+(?!\d))/g, sep)
}

export function buildEveningNudge(
  locale: EveningNudgeLocale,
  ctx: EveningNudgeContext,
): EveningNudgeCopy {
  const fr = locale === 'fr'
  const title = fr ? "La boîte du jour t'attend 🎮" : "Today's box is waiting 🎮"

  if (ctx.leaderScore == null) {
    return {
      title,
      body: fr
        ? 'Personne n’a encore ouvert la boîte du jour. Sois la première personne à poser un score !'
        : "Nobody has opened today's box yet. Be the first to set a score!",
    }
  }

  const score = formatScore(ctx.leaderScore, locale)

  if (ctx.leaderName) {
    return {
      title,
      body: fr
        ? `${ctx.leaderName} mène avec ${score} pts. Ouvre la boîte avant minuit pour reprendre la tête !`
        : `${ctx.leaderName} leads with ${score} pts. Open the box before midnight to take the lead!`,
    }
  }

  return {
    title,
    body: fr
      ? `Le meilleur score du jour est de ${score} pts. Ouvre la boîte avant minuit pour le battre !`
      : `Today's top score is ${score} pts. Open the box before midnight and beat it!`,
  }
}
