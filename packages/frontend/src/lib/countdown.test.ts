import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeRemainingMs,
  remainingSeconds,
  getTimerPhase,
  remainingFraction,
  formatCountdown,
} from './countdown'

const LIMIT = 45_000

describe('computeRemainingMs', () => {
  it('returns the full limit at t=0', () => {
    assert.equal(computeRemainingMs(1000, 1000, LIMIT), 45_000)
  })

  it('subtracts elapsed wall-clock time', () => {
    assert.equal(computeRemainingMs(11_000, 1000, LIMIT), 35_000)
  })

  it('clamps to 0 at exactly the limit', () => {
    assert.equal(computeRemainingMs(46_000, 1000, LIMIT), 0)
  })

  it('never goes negative past the limit', () => {
    assert.equal(computeRemainingMs(120_000, 1000, LIMIT), 0)
  })

  it('clamps clock skew (now before start) to the full limit', () => {
    assert.equal(computeRemainingMs(500, 1000, LIMIT), 45_000)
  })

  it('returns the full limit when no round has started', () => {
    assert.equal(computeRemainingMs(5000, null, LIMIT), 45_000)
  })

  it('returns 0 for a non-positive limit', () => {
    assert.equal(computeRemainingMs(1000, 1000, 0), 0)
  })
})

describe('remainingSeconds', () => {
  it('ceils so a partial second still reads as 1', () => {
    assert.equal(remainingSeconds(400), 1)
  })
  it('shows the full count at the boundary', () => {
    assert.equal(remainingSeconds(45_000), 45)
  })
  it('is 0 only when truly empty', () => {
    assert.equal(remainingSeconds(0), 0)
  })
})

describe('getTimerPhase', () => {
  it('is normal above the warning threshold', () => {
    assert.equal(getTimerPhase(45), 'normal')
    assert.equal(getTimerPhase(16), 'normal')
  })
  it('is warning from 15 down to 6', () => {
    assert.equal(getTimerPhase(15), 'warning')
    assert.equal(getTimerPhase(6), 'warning')
  })
  it('is critical from 5 down to 0', () => {
    assert.equal(getTimerPhase(5), 'critical')
    assert.equal(getTimerPhase(0), 'critical')
  })
})

describe('remainingFraction', () => {
  it('is 1 at full and 0 at empty', () => {
    assert.equal(remainingFraction(45_000, LIMIT), 1)
    assert.equal(remainingFraction(0, LIMIT), 0)
  })
  it('is the proportion in between', () => {
    assert.equal(remainingFraction(22_500, LIMIT), 0.5)
  })
  it('clamps to [0,1]', () => {
    assert.equal(remainingFraction(90_000, LIMIT), 1)
    assert.equal(remainingFraction(-10, LIMIT), 0)
  })
})

describe('formatCountdown', () => {
  it('zero-pads the seconds', () => {
    assert.equal(formatCountdown(45), '0:45')
    assert.equal(formatCountdown(5), '0:05')
    assert.equal(formatCountdown(0), '0:00')
  })
  it('handles values over a minute', () => {
    assert.equal(formatCountdown(75), '1:15')
  })
})
