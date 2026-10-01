import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { TRANSFER_STATEMENTS, transferAnonymousUserData } from './link-anonymous-account.js'

function fakePool(failOn?: string) {
  const calls: Array<{ text: string; values?: unknown[] }> = []
  let released = false
  const pool = {
    async connect() {
      return {
        async query(text: string, values?: unknown[]) {
          calls.push({ text, values })
          if (failOn && text.includes(failOn)) throw new Error('boom')
          return { rowCount: 0 }
        },
        release() { released = true },
      }
    },
  }
  return { pool, calls, isReleased: () => released }
}

describe('transferAnonymousUserData', () => {
  it('runs every transfer statement in one transaction, guest id first', async () => {
    const { pool, calls, isReleased } = fakePool()
    await transferAnonymousUserData(pool, 'guest', 'real')

    assert.equal(calls[0]!.text, 'BEGIN')
    assert.equal(calls.at(-1)!.text, 'COMMIT')
    const body = calls.slice(1, -1)
    assert.deepEqual(body.map((c) => c.text), [...TRANSFER_STATEMENTS])
    for (const c of body) assert.deepEqual(c.values, ['guest', 'real'])
    assert.ok(isReleased())
  })

  it('moves game sessions before crediting the score', () => {
    const sessions = TRANSFER_STATEMENTS.findIndex((s) => s.includes('UPDATE game_sessions'))
    const score = TRANSFER_STATEMENTS.findIndex((s) => s.includes('total_score = t.total_score'))
    assert.ok(sessions >= 0 && score > sessions)
  })

  it('rolls back and rethrows when a statement fails', async () => {
    const { pool, calls, isReleased } = fakePool('user_achievements')
    await assert.rejects(transferAnonymousUserData(pool, 'guest', 'real'), /boom/)
    assert.equal(calls.at(-1)!.text, 'ROLLBACK')
    assert.ok(!calls.some((c) => c.text === 'COMMIT'))
    assert.ok(isReleased())
  })

  it('is a no-op when both ids are the same user', async () => {
    const { pool, calls } = fakePool()
    await transferAnonymousUserData(pool, 'same', 'same')
    assert.equal(calls.length, 0)
  })
})
