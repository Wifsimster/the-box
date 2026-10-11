import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { displayableStanding } from './standing'

const HIDDEN = { percentile: null, rank: null, totalPlayers: null }

describe('displayableStanding', () => {
  it('keeps a coherent standing', () => {
    assert.deepEqual(
      displayableStanding({ percentile: 50, rank: 2, totalPlayers: 4 }),
      { percentile: 50, rank: 2, totalPlayers: 4 },
    )
    assert.deepEqual(
      displayableStanding({ percentile: 100, rank: 1, totalPlayers: 1 }),
      { percentile: 100, rank: 1, totalPlayers: 1 },
    )
  })

  it('hides a rank larger than the player count ("Rank #2 of 1 players")', () => {
    assert.deepEqual(displayableStanding({ percentile: 200, rank: 2, totalPlayers: 1 }), HIDDEN)
    assert.deepEqual(displayableStanding({ percentile: 100, rank: 2, totalPlayers: 1 }), HIDDEN)
  })

  it('hides an out-of-range "top X%"', () => {
    assert.deepEqual(displayableStanding({ percentile: 200, rank: 1, totalPlayers: 1 }), HIDDEN)
    assert.deepEqual(displayableStanding({ percentile: 0, rank: 1, totalPlayers: 1 }), HIDDEN)
  })

  it('hides empty or error payloads', () => {
    assert.deepEqual(displayableStanding({}), HIDDEN)
    assert.deepEqual(displayableStanding({ percentile: 0, rank: 0, totalPlayers: 0 }), HIDDEN)
    assert.deepEqual(displayableStanding({ percentile: 100, rank: 1, totalPlayers: 0 }), HIDDEN)
    assert.deepEqual(displayableStanding({ percentile: 50, rank: 1.5, totalPlayers: 3 }), HIDDEN)
  })

  it('keeps a percentile-only standing (no rank) when the total is valid', () => {
    assert.deepEqual(
      displayableStanding({ percentile: 10, rank: null, totalPlayers: 20 }),
      { percentile: 10, rank: null, totalPlayers: 20 },
    )
  })
})
