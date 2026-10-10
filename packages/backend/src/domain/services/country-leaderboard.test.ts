import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { CountryCode } from '@the-box/types'
import {
  MIN_PLAYERS_PER_COUNTRY,
  countCountryPlayers,
  rankCountries,
  type CountryPlayerMonthStats,
} from './country-leaderboard.js'

/** `n` players from `country`, each with the given per-day average over `games` days. */
function players(country: CountryCode, averages: number[], games = 1): CountryPlayerMonthStats[] {
  return averages.map((avg, i) => ({
    userId: `${country}-${i}`,
    countryCode: country,
    gamesPlayed: games,
    totalScore: avg * games,
  }))
}

describe('rankCountries — threshold', () => {
  it('defaults to 5 players', () => {
    assert.equal(MIN_PLAYERS_PER_COUNTRY, 5)
  })

  it('leaves out a country one player short of the threshold', () => {
    const rows = [...players('FR', [1000, 1000, 1000, 1000, 1000]), ...players('BE', [2000, 2000, 2000, 2000])]
    const ranked = rankCountries(rows)
    assert.deepEqual(ranked.map((r) => r.countryCode), ['FR'])
  })

  it('ranks a country exactly at the threshold', () => {
    const ranked = rankCountries(players('BE', [2000, 2000, 2000, 2000, 2000]))
    assert.equal(ranked.length, 1)
    assert.equal(ranked[0]!.playerCount, 5)
  })

  it('counts distinct players, not rows', () => {
    const one = players('FR', [1500])[0]!
    const rows = [one, one, one, one, one]
    assert.deepEqual(rankCountries(rows), [])
  })

  it('honours a custom threshold', () => {
    assert.equal(rankCountries(players('CA', [800]), 1).length, 1)
  })

  it('returns nothing for no players', () => {
    assert.deepEqual(rankCountries([]), [])
  })
})

describe('rankCountries — aggregation', () => {
  it('averages each player per day, then averages players', () => {
    // A plays 20 days at 1000/day, B plays 1 day at 2000. Per-player
    // averages are 1000 and 2000, so the country scores 1500, not the
    // session-weighted 1048.
    const rows: CountryPlayerMonthStats[] = [
      { userId: 'a', countryCode: 'FR', gamesPlayed: 20, totalScore: 20_000 },
      { userId: 'b', countryCode: 'FR', gamesPlayed: 1, totalScore: 2000 },
    ]
    assert.equal(rankCountries(rows, 2)[0]!.averageScore, 1500)
  })

  it('rounds the average to an integer', () => {
    const rows = players('FR', [1000, 1001, 1001])
    assert.equal(rankCountries(rows, 3)[0]!.averageScore, 1001)
  })

  it('ignores rows with no game played', () => {
    const rows = [...players('FR', [1000, 1000]), { userId: 'z', countryCode: 'FR' as const, gamesPlayed: 0, totalScore: 0 }]
    assert.equal(rankCountries(rows, 2)[0]!.playerCount, 2)
  })

  it('orders by score, shares ranks on ties, then breaks ties by player count and code', () => {
    const rows = [
      ...players('DE', [1200, 1200]),
      ...players('FR', [1500, 1500]),
      ...players('BE', [1200, 1200, 1200]),
      ...players('CH', [1200, 1200]),
      ...players('IT', [900, 900]),
    ]
    const ranked = rankCountries(rows, 2)
    assert.deepEqual(
      ranked.map((r) => [r.rank, r.countryCode]),
      [
        [1, 'FR'],
        [2, 'BE'],
        [2, 'CH'],
        [2, 'DE'],
        [3, 'IT'],
      ],
    )
  })
})

describe('countCountryPlayers', () => {
  it('counts distinct players of one country', () => {
    const rows = [...players('FR', [1, 2, 3]), ...players('BE', [1]), players('FR', [9])[0]!]
    assert.equal(countCountryPlayers(rows, 'FR'), 3)
    assert.equal(countCountryPlayers(rows, 'JP'), 0)
  })
})
