import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  shouldPauseAgentKey,
  AGENT_KEY_PAUSE_MIN_SUBMISSIONS,
  AGENT_KEY_PAUSE_REJECTION_RATIO,
} from './geo-agent-guard.service.js'

describe('shouldPauseAgentKey', () => {
  it('never pauses below the min-submissions floor, even at 100% rejection', () => {
    assert.equal(
      shouldPauseAgentKey({ submitted: AGENT_KEY_PAUSE_MIN_SUBMISSIONS - 1, rejected: 9 }),
      false,
    )
    assert.equal(shouldPauseAgentKey({ submitted: 0, rejected: 0 }), false)
  })

  it('pauses when the ratio exceeds the bar at/above the floor', () => {
    // 10 submitted, 7 rejected → 0.7 > 0.6 → pause.
    assert.equal(shouldPauseAgentKey({ submitted: 10, rejected: 7 }), true)
  })

  it('does not pause exactly at the bar (strictly greater required)', () => {
    // 10 submitted, 6 rejected → 0.6, not > 0.6.
    assert.equal(shouldPauseAgentKey({ submitted: 10, rejected: 6 }), false)
  })

  it('allows a well-behaved key with a low rejection ratio', () => {
    assert.equal(shouldPauseAgentKey({ submitted: 50, rejected: 5 }), false)
  })

  it('exposes the same bar as the human shadow-ban', () => {
    assert.equal(AGENT_KEY_PAUSE_REJECTION_RATIO, 0.6)
    assert.equal(AGENT_KEY_PAUSE_MIN_SUBMISSIONS, 10)
  })
})
