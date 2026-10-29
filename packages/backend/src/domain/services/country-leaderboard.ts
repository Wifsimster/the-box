import type { CountryCode, CountryLeaderboardEntry } from '@the-box/types'

export const MIN_PLAYERS_PER_COUNTRY = 5

export interface CountryPlayerMonthStats {
  userId: string
  countryCode: CountryCode
  gamesPlayed: number
  totalScore: number
}

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
