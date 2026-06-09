/**
 * Pure copy builder for the personalized evening "play today's challenge"
 * nudge. No infrastructure imports — the worker resolves the leader, applies
 * the safety / opt-out gate, then asks this module for the strings.
 *
 * Three branches, driven entirely by the context shape so each is unit-testable
 * in isolation:
 *   - named leader  → `leaderName` + `leaderScore` present  ("beat {name}")
 *   - anon leader   → `leaderScore` present, `leaderName` null (name unsafe or
 *                     opted out of featuring → score-only, privacy-safe)
 *   - empty board   → `leaderScore` null (nobody has played yet → "be first")
 *
 * The self-leader case is handled by the caller (it never sends to today's
 * leader in v1), so it is intentionally absent here.
 */

export type EveningNudgeLocale = 'fr' | 'en'

export interface EveningNudgeContext {
  /** Safe, already-truncated leader display name, or null for score-only / empty. */
  leaderName: string | null
  /** Today's top score, or null when nobody has played yet. */
  leaderScore: number | null
}

export interface EveningNudgeCopy {
  title: string
  body: string
}

const MAX_NAME_LENGTH = 20

/**
 * Trim and ellipsize a display name so it can't blow past push-title limits
 * (the OS hard-truncates around ~40 chars and a long name would eat the body).
 */
export function truncateDisplayName(name: string, max = MAX_NAME_LENGTH): string {
  const trimmed = name.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1).trimEnd()}…`
}

/** Group thousands deterministically (no ICU dependency, stable across envs). */
function formatScore(score: number, locale: EveningNudgeLocale): string {
  const sep = locale === 'fr' ? ' ' : ',' // narrow no-break space for fr
  return Math.round(score).toString().replace(/\B(?=(\d{3})+(?!\d))/g, sep)
}

export function buildEveningNudge(
  locale: EveningNudgeLocale,
  ctx: EveningNudgeContext,
): EveningNudgeCopy {
  const fr = locale === 'fr'
  const title = fr ? "Le défi du jour t'attend 🎮" : "Today's challenge is waiting 🎮"

  // Empty board — nobody has set a score yet.
  if (ctx.leaderScore == null) {
    return {
      title,
      body: fr
        ? 'Personne n’a encore joué aujourd’hui. Sois la première personne à poser un score !'
        : 'Nobody has played today yet. Be the first to set a score!',
    }
  }

  const score = formatScore(ctx.leaderScore, locale)

  // Named leader — the personalized case the feature was requested for.
  if (ctx.leaderName) {
    return {
      title,
      body: fr
        ? `${ctx.leaderName} mène avec ${score} pts. À toi de jouer avant minuit pour reprendre la tête !`
        : `${ctx.leaderName} leads with ${score} pts. Play before midnight to take the lead!`,
    }
  }

  // Anonymous leader — score is public, but the name is unsafe or opted out.
  return {
    title,
    body: fr
      ? `Le meilleur score du jour est de ${score} pts. À toi de jouer avant minuit pour le battre !`
      : `Today's top score is ${score} pts. Play before midnight and beat it!`,
  }
}
