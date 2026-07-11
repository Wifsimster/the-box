import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  captureImportBudgetKey,
  enrollBudgetKey,
  ingestBudgetKey,
  mapActionBudgetKey,
  pinBudgetKey,
  secondsToNextUtcHour,
  secondsToUtcMidnight,
} from './agent-budget.js'

describe('secondsToUtcMidnight', () => {
  it('counts seconds to the next UTC midnight', () => {
    // 23:00:00Z → 1h = 3600s.
    assert.equal(secondsToUtcMidnight(new Date('2026-07-10T23:00:00.000Z')), 3600)
    // 00:00:00Z → a full day, never 0 (the key would already have rolled).
    assert.equal(secondsToUtcMidnight(new Date('2026-07-10T00:00:00.000Z')), 86400)
  })

  it('never returns less than 1 (rounds up sub-second remainders)', () => {
    const out = secondsToUtcMidnight(new Date('2026-07-10T23:59:59.500Z'))
    assert.ok(out >= 1)
  })
})

describe('ingestBudgetKey', () => {
  it('scopes the key by api key id and UTC day', () => {
    assert.equal(
      ingestBudgetKey(42, new Date('2026-07-10T15:30:00.000Z')),
      'geo-agent:budget:ingest:42:2026-07-10',
    )
  })

  it('rolls to a new key at the UTC day boundary', () => {
    const before = ingestBudgetKey(1, new Date('2026-07-10T23:59:59.000Z'))
    const after = ingestBudgetKey(1, new Date('2026-07-11T00:00:01.000Z'))
    assert.notEqual(before, after)
  })
})

describe('secondsToNextUtcHour', () => {
  it('counts seconds to the top of the next UTC hour', () => {
    assert.equal(secondsToNextUtcHour(new Date('2026-07-10T15:00:00.000Z')), 3600)
    assert.equal(secondsToNextUtcHour(new Date('2026-07-10T15:59:00.000Z')), 60)
  })

  it('never returns less than 1', () => {
    assert.ok(secondsToNextUtcHour(new Date('2026-07-10T15:59:59.500Z')) >= 1)
  })
})

describe('pinBudgetKey', () => {
  it('scopes the key by api key id and UTC hour', () => {
    assert.equal(
      pinBudgetKey(7, new Date('2026-07-10T15:30:00.000Z')),
      'geo-agent:budget:pins:7:2026-07-10T15',
    )
  })

  it('rolls to a new key at the hour boundary', () => {
    const before = pinBudgetKey(1, new Date('2026-07-10T15:59:59.000Z'))
    const after = pinBudgetKey(1, new Date('2026-07-10T16:00:01.000Z'))
    assert.notEqual(before, after)
  })
})

describe('enrollBudgetKey', () => {
  it('scopes the key by api key id and UTC day', () => {
    assert.equal(
      enrollBudgetKey(42, new Date('2026-07-10T15:30:00.000Z')),
      'geo-agent:budget:enroll:42:2026-07-10',
    )
  })

  it('rolls to a new key at the UTC day boundary', () => {
    const before = enrollBudgetKey(1, new Date('2026-07-10T23:59:59.000Z'))
    const after = enrollBudgetKey(1, new Date('2026-07-11T00:00:01.000Z'))
    assert.notEqual(before, after)
  })
})

describe('captureImportBudgetKey', () => {
  it('scopes the key by api key id and UTC day', () => {
    assert.equal(
      captureImportBudgetKey(42, new Date('2026-07-10T15:30:00.000Z')),
      'geo-agent:budget:capture-import:42:2026-07-10',
    )
  })
})

describe('mapActionBudgetKey', () => {
  it('scopes the key by api key id and UTC day', () => {
    assert.equal(
      mapActionBudgetKey(42, new Date('2026-07-10T15:30:00.000Z')),
      'geo-agent:budget:map-action:42:2026-07-10',
    )
  })
})
