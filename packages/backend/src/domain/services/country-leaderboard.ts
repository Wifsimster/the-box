import type { CountryCode, CountryLeaderboardEntry } from '@the-box/types'

/**
 * A country is ranked for a month only once this many distinct players from
 * it have a ranked session that month. Below it, one strong player would put
 * their country on top, which says nothing about the country. Five keeps
 * small countries reachable while the player base is still growing; raise it
 * when most ranked countries clear it easily.
 */
export const MIN_PLAYERS_PER_COUNTRY = 5

/** One player's ranked sessions for a month, from a country they declared. */
export interface CountryPlayerMonthStats {
  userId: string
  countryCode: CountryCode
  /** Completed, non-catch-up sessions this month. */
  gamesPlayed: number
  /** Sum of those sessions' scores. */
  totalScore: number
}

/**
 * Monthly country ranking. A country's score is the mean of its players'
 * average daily score this month: every player weighs the same, however
 * many days they played, so one daily regular cannot carry a country alone.
 * Countries under `minPlayers` are left out. Ties on the rounded score share
 * a rank (dense ranking, as on the player boards); order within a tie is by
 * player count, then country code, so the list is stable across refreshes.
 */
export function rankCountries(
  players: readonly CountryPlayerMonthStats[],
  minPlayers: number = MIN_PLAYERS_PER_COUNTRY,
): CountryLeaderboardEntry[] {
  const byCountry = new Map<CountryCode, { sumOfAverages: number; players: Set<string> }>()
  for (const p of players) {
    if (p.gamesPlayed <= 0) continue
    const bucket = byCountry.get(p.countryCode) ?? { sumOfAverages: 0, players: new Set<string>() }
    if (bucket.players.has(p.userId)) continue
    bucket.players.add(p.userId)
    bucket.sumOfAverages += p.totalScore / p.gamesPlayed
    byCountry.set(p.countryCode, bucket)
  }

  const ranked = [...byCountry.entries()]
    .filter(([, b]) => b.players.size >= minPlayers)
    .map(([countryCode, b]) => ({
      countryCode,
      averageScore: Math.round(b.sumOfAverages / b.players.size),
      playerCount: b.players.size,
    }))
    .sort(
      (a, b) =>
        b.averageScore - a.averageScore ||
        b.playerCount - a.playerCount ||
        a.countryCode.localeCompare(b.countryCode),
    )

  let rank = 0
  let previousScore: number | null = null
  return ranked.map((entry) => {
    if (entry.averageScore !== previousScore) {
      rank += 1
      previousScore = entry.averageScore
    }
    return { rank, ...entry }
  })
}

/** Distinct players from `countryCode` in `players` (for the viewer's progress line). */
export function countCountryPlayers(
  players: readonly CountryPlayerMonthStats[],
  countryCode: CountryCode,
): number {
  const ids = new Set<string>()
  for (const p of players) {
    if (p.countryCode === countryCode && p.gamesPlayed > 0) ids.add(p.userId)
  }
  return ids.size
}
