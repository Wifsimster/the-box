import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  backfillPriority,
  rankBackfillTargets,
  type BackfillCandidate,
} from './geo-backfill.service.js'

describe('backfillPriority', () => {
  it('ranks "has map + collecting pins" above "has map, no captures" above "no map"', () => {
    const collecting = backfillPriority({
      gameId: 1,
      hasActiveMap: true,
      candidateCount: 2,
      topPinCount: 0,
    })
    const mapOnly = backfillPriority({
      gameId: 2,
      hasActiveMap: true,
      candidateCount: 0,
      topPinCount: 0,
    })
    const noMap = backfillPriority({
      gameId: 3,
      hasActiveMap: false,
      candidateCount: 0,
      topPinCount: 0,
    })
    assert.ok(collecting > mapOnly)
    assert.ok(mapOnly > noMap)
  })

  it('a game one pin away outranks any game that only has a map, regardless of pin count', () => {
    // Even the max-pin bump can't lift a mapOnly game into the collecting band.
    const collectingLowPins = backfillPriority({
      gameId: 1,
      hasActiveMap: true,
      candidateCount: 1,
      topPinCount: 0,
    })
    const mapOnly = backfillPriority({
      gameId: 2,
      hasActiveMap: true,
      candidateCount: 0,
      topPinCount: 999,
    })
    assert.ok(collectingLowPins > mapOnly)
  })

  it('within the collecting band, more pins ranks higher', () => {
    const near = backfillPriority({
      gameId: 1,
      hasActiveMap: true,
      candidateCount: 3,
      topPinCount: 9,
    })
    const far = backfillPriority({
      gameId: 2,
      hasActiveMap: true,
      candidateCount: 3,
      topPinCount: 2,
    })
    assert.ok(near > far)
  })
})

describe('rankBackfillTargets', () => {
  const candidates: BackfillCandidate[] = [
    { gameId: 10, hasActiveMap: false, candidateCount: 0, topPinCount: 0 }, // no map
    { gameId: 11, hasActiveMap: true, candidateCount: 0, topPinCount: 0 }, // map only
    { gameId: 12, hasActiveMap: true, candidateCount: 4, topPinCount: 4 }, // collecting, 4 pins
    { gameId: 13, hasActiveMap: true, candidateCount: 4, topPinCount: 9 }, // collecting, 9 pins
  ]

  it('orders by descending priority and caps at batchSize', () => {
    const top2 = rankBackfillTargets(candidates, 2)
    assert.deepEqual(
      top2.map((t) => t.gameId),
      [13, 12],
    )
  })

  it('returns the full ordered list when batchSize exceeds the count', () => {
    const all = rankBackfillTargets(candidates, 100)
    assert.deepEqual(
      all.map((t) => t.gameId),
      [13, 12, 11, 10],
    )
  })

  it('returns nothing for batchSize 0', () => {
    assert.deepEqual(rankBackfillTargets(candidates, 0), [])
  })

  it('breaks priority ties by game id', () => {
    const tied: BackfillCandidate[] = [
      { gameId: 30, hasActiveMap: true, candidateCount: 0, topPinCount: 0 },
      { gameId: 20, hasActiveMap: true, candidateCount: 0, topPinCount: 0 },
    ]
    assert.deepEqual(
      rankBackfillTargets(tied, 5).map((t) => t.gameId),
      [20, 30],
    )
  })
})
