import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  TIMER_DIVERGENCE_WARN_MS,
  resolveMatchPrecision,
  resolveRoundTimer,
} from './guess-validation.service.js'

describe('resolveMatchPrecision', () => {
  const ANSWER = 42

  it('refuses credit for empty text even with the correct gameId', () => {
    assert.equal(
      resolveMatchPrecision({
        trimmedGuess: '',
        matchResult: null,
        submittedGameId: ANSWER,
        answerGameId: ANSWER,
      }),
      'none'
    )
  })

  it('lets the fuzzy matcher win on its own', () => {
    assert.equal(
      resolveMatchPrecision({
        trimmedGuess: 'Halo',
        matchResult: { matched: true, precision: 'exact' },
        submittedGameId: null,
        answerGameId: ANSWER,
      }),
      'exact'
    )
  })

  it('preserves a partial match rather than promoting it', () => {
    assert.equal(
      resolveMatchPrecision({
        trimmedGuess: 'Halo',
        matchResult: { matched: true, precision: 'partial' },
        submittedGameId: ANSWER,
        answerGameId: ANSWER,
      }),
      'partial'
    )
  })

  it('uses a correct gameId only to break a tie on non-empty text', () => {
    assert.equal(
      resolveMatchPrecision({
        trimmedGuess: 'halo ce',
        matchResult: { matched: false, precision: 'none' },
        submittedGameId: ANSWER,
        answerGameId: ANSWER,
      }),
      'exact'
    )
  })

  it('gives nothing for a wrong gameId and an unmatched guess', () => {
    assert.equal(
      resolveMatchPrecision({
        trimmedGuess: 'Doom',
        matchResult: { matched: false, precision: 'none' },
        submittedGameId: 7,
        answerGameId: ANSWER,
      }),
      'none'
    )
  })
})

describe('resolveRoundTimer', () => {
  const NOW = new Date('2026-05-01T12:00:10.000Z').getTime()
  const STARTED = new Date('2026-05-01T12:00:00.000Z')

  const valid = {
    roundStartedAt: STARTED,
    stampedPosition: 3,
    submittedPosition: 3,
    clientElapsedMs: 10_000,
    now: NOW,
  }

  it('rejects a submit for a position the server never served', () => {
    const result = resolveRoundTimer({ ...valid, roundStartedAt: null })
    assert.equal(result.valid, false)
  })

  it('rejects a submit for a different position than the stamped one', () => {
    const result = resolveRoundTimer({ ...valid, submittedPosition: 5 })
    assert.equal(result.valid, false)
  })

  it('rejects an unparseable timestamp instead of trusting the client', () => {
    const result = resolveRoundTimer({ ...valid, roundStartedAt: 'not-a-date' })
    assert.equal(result.valid, false)
  })

  it('takes the SLOWER of server and client elapsed', () => {
    const result = resolveRoundTimer({ ...valid, clientElapsedMs: 1 })

    assert.equal(result.valid, true)
    if (!result.valid) return
    assert.equal(result.serverElapsedMs, 10_000)
    assert.equal(result.effectiveTimeTakenMs, 10_000, 'server time wins over the forged 1ms')
  })

  it('accepts a client time slower than the server measurement', () => {
    const result = resolveRoundTimer({ ...valid, clientElapsedMs: 12_000 })

    assert.equal(result.valid, true)
    if (!result.valid) return
    assert.equal(result.effectiveTimeTakenMs, 12_000)
  })

  it('never reports negative elapsed when the clock moves backwards', () => {
    const result = resolveRoundTimer({
      ...valid,
      now: new Date('2026-05-01T11:59:50.000Z').getTime(),
      clientElapsedMs: 0,
    })

    assert.equal(result.valid, true)
    if (!result.valid) return
    assert.equal(result.serverElapsedMs, 0)
    assert.ok(result.effectiveTimeTakenMs >= 0)
  })

  it('flags divergence only past the threshold', () => {
    const withinTolerance = resolveRoundTimer({
      ...valid,
      clientElapsedMs: 10_000 - TIMER_DIVERGENCE_WARN_MS,
    })
    const beyondTolerance = resolveRoundTimer({ ...valid, clientElapsedMs: 100 })

    assert.equal(withinTolerance.valid && withinTolerance.diverged, false, 'exactly at the threshold is not divergence')
    assert.equal(beyondTolerance.valid && beyondTolerance.diverged, true)
  })
})
