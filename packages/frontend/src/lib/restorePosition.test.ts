import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { pickRestorePosition } from './restorePosition'

const base = {
  persistedPosition: 0,
  isSameChallenge: true,
  backendPosition: 1,
  correctPositions: new Set<number>(),
  totalScreenshots: 10,
}

describe('pickRestorePosition', () => {
  it('keeps the persisted position when it is still open', () => {
    assert.equal(pickRestorePosition({ ...base, persistedPosition: 4, backendPosition: 2 }), 4)
  })

  it('uses the backend position when the persisted state is from another challenge', () => {
    assert.equal(pickRestorePosition({ ...base, persistedPosition: 4, isSameChallenge: false, backendPosition: 2 }), 2)
  })

  it('uses the backend position when nothing was persisted', () => {
    assert.equal(pickRestorePosition({ ...base, backendPosition: 3 }), 3)
  })

  it('does not resume on a solved position while its result card was pending', () => {
    assert.equal(
      pickRestorePosition({ ...base, persistedPosition: 3, backendPosition: 4, correctPositions: new Set([1, 2, 3]) }),
      4
    )
  })

  it('finds the next open position when both candidates are solved', () => {
    assert.equal(
      pickRestorePosition({
        ...base,
        persistedPosition: 10,
        backendPosition: 10,
        correctPositions: new Set([1, 2, 3, 5, 6, 7, 8, 9, 10]),
      }),
      4
    )
  })

  it('returns the preferred position when every position is solved', () => {
    const all = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    assert.equal(pickRestorePosition({ ...base, persistedPosition: 7, backendPosition: 10, correctPositions: all }), 7)
  })
})
