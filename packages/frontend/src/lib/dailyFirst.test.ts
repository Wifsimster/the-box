import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  filterByFeatures,
  isTodayPath,
  visibleLeaderboardTabs,
  yesterdayAction,
} from './dailyFirst'

describe('isTodayPath', () => {
  it('matches the bare language root', () => {
    assert.equal(isTodayPath('/fr'), true)
    assert.equal(isTodayPath('/en/'), true)
  })

  it('rejects every other route', () => {
    assert.equal(isTodayPath('/'), false)
    assert.equal(isTodayPath('/fr/play'), false)
    assert.equal(isTodayPath('/fr/about'), false)
    assert.equal(isTodayPath('/fr/leaderboard'), false)
  })
})

describe('filterByFeatures', () => {
  const items = [
    { key: 'rules' },
    { key: 'panorama', feature: 'geogamers' as const },
    { key: 'geo', feature: 'geoCommunity' as const },
  ]

  it('hides Panorama when GEOGAMERS_ENABLED is off (D5)', () => {
    const keys = filterByFeatures(items, { geoCommunity: true, geogamers: false }).map((i) => i.key)
    assert.deepEqual(keys, ['rules', 'geo'])
  })

  it('keeps ungated entries and enabled features', () => {
    const keys = filterByFeatures(items, { geoCommunity: false, geogamers: true }).map((i) => i.key)
    assert.deepEqual(keys, ['rules', 'panorama'])
  })
})

describe('yesterdayAction (D6)', () => {
  it('shows your answers for a finished box', () => {
    assert.deepEqual(
      yesterdayAction({ date: '2026-10-10', hasPlayed: true, isCompleted: true, sessionId: 'abc' }),
      { kind: 'answers', path: '/history/abc' },
    )
  })

  it('offers a resume for a started box', () => {
    assert.deepEqual(
      yesterdayAction({ date: '2026-10-10', hasPlayed: true, isCompleted: false, sessionId: 'abc' }),
      { kind: 'resume', path: '/play?date=2026-10-10' },
    )
  })

  it('offers a catch-up for a missed box, never its answers', () => {
    assert.deepEqual(yesterdayAction({ date: '2026-10-10', hasPlayed: false }), {
      kind: 'catchUp',
      path: '/play?date=2026-10-10',
    })
  })

  it('falls back to the catch-up route when the session id is missing', () => {
    assert.equal(
      yesterdayAction({ date: '2026-10-10', hasPlayed: true, isCompleted: true, sessionId: null }).kind,
      'resume',
    )
  })
})

describe('visibleLeaderboardTabs (D9)', () => {
  it('lists the daily and monthly rankings only', () => {
    assert.deepEqual(visibleLeaderboardTabs('daily'), ['daily', 'monthly'])
    assert.deepEqual(visibleLeaderboardTabs('monthly'), ['daily', 'monthly'])
  })

  it('keeps a deep-linked board visible while it is active', () => {
    assert.deepEqual(visibleLeaderboardTabs('achievements'), ['daily', 'monthly', 'achievements'])
    assert.deepEqual(visibleLeaderboardTabs('geogamers'), ['daily', 'monthly', 'geogamers'])
  })
})
