import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isMapsFetchChildJob,
  shouldAdvanceAfterFailure,
  type FailedJobLike,
} from './geo-worker-predicates.js'
import type { GeoJobData } from '../queues.js'

describe('isMapsFetchChildJob', () => {
  it('matches every maps:fetch-from-* source variant', () => {
    for (const source of ['steam', 'rawg', 'fandom', 'strategywiki', 'wand', 'mapgenie']) {
      const data = { kind: `maps:fetch-from-${source}`, gameId: 1 } as GeoJobData
      assert.equal(isMapsFetchChildJob(data), true, source)
    }
  })

  it('rejects unrelated kinds and undefined', () => {
    assert.equal(isMapsFetchChildJob(undefined), false)
    assert.equal(
      isMapsFetchChildJob({ kind: 'maps:pipeline', gameId: 1 } as GeoJobData),
      false,
    )
    assert.equal(
      isMapsFetchChildJob({ kind: 'evaluate-consensus' } as GeoJobData),
      false,
    )
  })
})

describe('shouldAdvanceAfterFailure', () => {
  const fetchJob = (overrides: Partial<FailedJobLike>): FailedJobLike => ({
    data: { kind: 'maps:fetch-from-steam', gameId: 42 } as GeoJobData,
    attemptsMade: 1,
    opts: { attempts: 3 },
    ...overrides,
  })

  it('returns false mid-retry', () => {
    assert.equal(
      shouldAdvanceAfterFailure(fetchJob({ attemptsMade: 2, opts: { attempts: 3 } })),
      false,
    )
  })

  it('returns true on the terminal attempt', () => {
    assert.equal(
      shouldAdvanceAfterFailure(fetchJob({ attemptsMade: 3, opts: { attempts: 3 } })),
      true,
    )
  })

  it('treats missing attempts as 1 (single-shot job)', () => {
    assert.equal(
      shouldAdvanceAfterFailure(fetchJob({ attemptsMade: 1, opts: {} })),
      true,
    )
  })

  it('ignores jobs that are not maps:fetch-from-*', () => {
    assert.equal(
      shouldAdvanceAfterFailure({
        data: { kind: 'maps:pipeline', gameId: 1 } as GeoJobData,
        attemptsMade: 5,
        opts: { attempts: 5 },
      }),
      false,
    )
  })

  it('handles undefined job data safely', () => {
    assert.equal(shouldAdvanceAfterFailure({}), false)
  })
})
