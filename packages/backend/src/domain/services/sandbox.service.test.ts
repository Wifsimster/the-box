import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  SANDBOX_SLUG,
  isReservedSlug,
  isSandboxSlug,
  sandboxProfile,
  sandboxState,
  sandboxToday,
} from './sandbox.service.js'

// The sandbox is a pure function of the clock — every test pins a fixed
// timestamp so there is nothing flaky to chase.

const CYCLE_MS = 10 * 60 * 1_000
const PLAY_MS = 7 * 60 * 1_000

describe('isSandboxSlug / isReservedSlug', () => {
  it('matches boxbot case-insensitively', () => {
    assert.equal(isSandboxSlug('boxbot'), true)
    assert.equal(isSandboxSlug('BoxBot'), true)
    assert.equal(isSandboxSlug('wifsim'), false)
  })

  it('reserves boxbot and system-like slugs', () => {
    assert.equal(isReservedSlug('boxbot'), true)
    assert.equal(isReservedSlug('admin'), true)
    assert.equal(isReservedSlug('streamers'), true)
    assert.equal(isReservedSlug('wifsim'), false)
  })

  it('SANDBOX_SLUG is itself reserved', () => {
    assert.equal(isReservedSlug(SANDBOX_SLUG), true)
  })
})

describe('sandboxState — cycle phases', () => {
  it('at cycle start: in_progress, zero score, zero screenshots', () => {
    const s = sandboxState(0)
    assert.equal(s.status, 'in_progress')
    assert.equal(s.score, 0)
    assert.equal(s.screenshotsDone, 0)
    assert.equal(s.rank, null)
    assert.equal(s.completedAt, null)
  })

  it('mid-play: in_progress with partial progress', () => {
    // Halfway through the 7-minute play phase.
    const s = sandboxState(PLAY_MS / 2)
    assert.equal(s.status, 'in_progress')
    assert.ok(s.screenshotsDone > 0 && s.screenshotsDone < 10)
    assert.ok(s.score > 0)
    assert.equal(s.rank, null)
  })

  it('never reaches 10 screenshots while still in_progress', () => {
    // Sample densely across the play phase.
    for (let t = 0; t < PLAY_MS; t += 15_000) {
      const s = sandboxState(t)
      assert.equal(s.status, 'in_progress')
      assert.ok(s.screenshotsDone <= 9, `t=${t} had ${s.screenshotsDone}`)
    }
  })

  it('completed phase: 10 screenshots, a rank, a completedAt', () => {
    const s = sandboxState(PLAY_MS + 60_000)
    assert.equal(s.status, 'completed')
    assert.equal(s.screenshotsDone, 10)
    assert.equal(typeof s.rank, 'number')
    assert.ok(s.completedAt)
  })

  it('loops — phase + progress repeat each cycle', () => {
    // score and timestamps shift per cycle by design (final score wobbles,
    // startedAt is absolute), so only the cycle-relative fields repeat.
    for (const offset of [0, 90_000, PLAY_MS, PLAY_MS + 120_000]) {
      const a = sandboxState(offset)
      const b = sandboxState(offset + CYCLE_MS)
      assert.equal(a.status, b.status, `status at offset ${offset}`)
      assert.equal(a.screenshotsDone, b.screenshotsDone, `screenshots at offset ${offset}`)
    }
  })

  it('final score is stable within a cycle but varies across cycles', () => {
    // Two samples in the same completed phase → identical score.
    const sameCycleA = sandboxState(PLAY_MS + 10_000)
    const sameCycleB = sandboxState(PLAY_MS + 90_000)
    assert.equal(sameCycleA.score, sameCycleB.score)
    // The wobble repeats every 7 cycles.
    assert.equal(
      sandboxState(PLAY_MS + 10_000).score,
      sandboxState(PLAY_MS + 10_000 + 7 * CYCLE_MS).score,
    )
  })

  it('score climbs monotonically through the play phase', () => {
    let prev = -1
    for (let t = 0; t < PLAY_MS; t += 30_000) {
      const { score } = sandboxState(t)
      assert.ok(score >= prev, `score went backwards at t=${t}`)
      prev = score
    }
  })
})

describe('sandboxProfile', () => {
  it('returns the boxbot slug and static demo stats', () => {
    const p = sandboxProfile(0)
    assert.equal(p.slug, 'boxbot')
    assert.equal(p.displayName, 'BoxBot')
    assert.ok(p.totalScore > 0)
    assert.ok(p.today)
  })

  it('today.completed reflects the cycle phase', () => {
    assert.equal(sandboxProfile(0).today?.completed, false)
    assert.equal(sandboxProfile(PLAY_MS + 30_000).today?.completed, true)
  })
})

describe('sandboxToday', () => {
  it('never counts for the leaderboard', () => {
    assert.equal(sandboxToday(0).session?.countsForLeaderboard, false)
    assert.equal(sandboxToday(PLAY_MS + 30_000).session?.countsForLeaderboard, false)
  })

  it('status tracks the cycle', () => {
    assert.equal(sandboxToday(60_000).status, 'in_progress')
    assert.equal(sandboxToday(PLAY_MS + 60_000).status, 'completed')
  })
})
