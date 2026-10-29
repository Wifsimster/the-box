import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { computeStanding } from './leaderboard-standing.js'

describe('computeStanding', () => {
  it('ranks a member of the board among the ranked total', () => {
    assert.deepEqual(
      computeStanding({ rankedPlayers: 10, playersAbove: 0, selfCounted: true }),
      { rank: 1, totalPlayers: 10, percentile: 10 },
    )
    assert.deepEqual(
      computeStanding({ rankedPlayers: 10, playersAbove: 9, selfCounted: true }),
      { rank: 10, totalPlayers: 10, percentile: 100 },
    )
  })

  it('places an outsider hypothetically and counts it once', () => {
    assert.deepEqual(
      computeStanding({ rankedPlayers: 3, playersAbove: 1, selfCounted: false }),
      { rank: 2, totalPlayers: 4, percentile: 50 },
    )
    assert.deepEqual(
      computeStanding({ rankedPlayers: 0, playersAbove: 0, selfCounted: false }),
      { rank: 1, totalPlayers: 1, percentile: 100 },
    )
  })

  it('infers an outsider when a bare score is below every ranked session', () => {
    assert.deepEqual(
      computeStanding({ rankedPlayers: 1, playersAbove: 1 }),
      { rank: 2, totalPlayers: 2, percentile: 100 },
    )
  })

  it('assumes membership when a bare score could belong to a ranked session', () => {
    assert.deepEqual(
      computeStanding({ rankedPlayers: 5, playersAbove: 2 }),
      { rank: 3, totalPlayers: 5, percentile: 60 },
    )
  })

  it('never returns rank > totalPlayers, even from inconsistent counts', () => {
    for (const counts of [
      { rankedPlayers: 1, playersAbove: 5, selfCounted: true },
      { rankedPlayers: 0, playersAbove: 0, selfCounted: true },
      { rankedPlayers: -1, playersAbove: 2 },
      { rankedPlayers: 2, playersAbove: 2, selfCounted: true },
    ]) {
      const s = computeStanding(counts)
      assert.ok(s.rank >= 1 && s.rank <= s.totalPlayers, JSON.stringify({ counts, s }))
      assert.ok(s.percentile >= 1 && s.percentile <= 100, JSON.stringify({ counts, s }))
    }
  })
})
