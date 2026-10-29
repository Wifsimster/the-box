import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveResultsSummary } from './sessionResults'

const staleStore = { sessionId: 's-1', totalScore: 200, totalScreenshots: 10, challengeDate: '2026-10-11' }
const serverSession = { sessionId: 's-1', totalScore: 1925, totalScreenshots: 10, challengeDate: '2026-10-11' }

describe('resolveResultsSummary', () => {
  it('prefers the server session over a stale local score', () => {
    assert.deepEqual(resolveResultsSummary(staleStore, serverSession), {
      totalScore: 1925,
      totalScreenshots: 10,
      challengeDate: '2026-10-11',
      authoritative: true,
    })
  })

  it('shows the local score as an optimistic placeholder until the server answers', () => {
    assert.deepEqual(resolveResultsSummary(staleStore, null), {
      totalScore: 200,
      totalScreenshots: 10,
      challengeDate: '2026-10-11',
      authoritative: false,
    })
  })

  it('ignores a server record for another session id', () => {
    const other = { ...serverSession, sessionId: 's-2', totalScore: 50 }
    assert.equal(resolveResultsSummary(staleStore, other).totalScore, 200)
    assert.equal(resolveResultsSummary(staleStore, other).authoritative, false)
  })
})
