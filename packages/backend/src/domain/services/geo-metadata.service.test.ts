import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { pickBestMapTitle, scoreMapTitle } from './geo-metadata.service.js'

describe('scoreMapTitle', () => {
  it('scores a title mentioning the full game name highly', () => {
    const score = scoreMapTitle('Elden Ring', 'Elden Ring', 'elden-ring')
    assert.ok(score > 50)
  })

  it('scores a title mentioning distinguishing slug tokens', () => {
    const score = scoreMapTitle(
      'Ocarina of Time World Map',
      'The Legend of Zelda: Ocarina of Time',
      'the-legend-of-zelda-ocarina-of-time',
    )
    assert.ok(score > 0)
  })

  it('rejects a title with zero game-specific evidence (-Infinity gate)', () => {
    // Regression: a franchise-wide wiki (one subdomain covering every
    // installment) must never let an unrelated title win just because it's
    // "the least bad" of a bad batch.
    const score = scoreMapTitle('Western Ghats', 'Uncharted 2: Among Thieves', 'uncharted-2-among-thieves')
    assert.equal(score, Number.NEGATIVE_INFINITY)
  })

  it('rejects a generic title that shares no distinguishing token with the game', () => {
    // Regression: "Overworld" alone carries no evidence it's Ocarina of Time
    // rather than the 1986 original hosted on the same legendofzelda wiki.
    const score = scoreMapTitle(
      'Overworld',
      'The Legend of Zelda: Ocarina of Time',
      'the-legend-of-zelda-ocarina-of-time',
    )
    assert.equal(score, Number.NEGATIVE_INFINITY)
  })
})

describe('pickBestMapTitle', () => {
  it('picks the canonical map for Uncharted 2, never a Lost Legacy page', () => {
    // Uncharted 2: Among Thieves must never bind to Lost Legacy content even
    // when both live under the same franchise-wide Fandom subdomain.
    const titles = ['Western Ghats', 'Shambhala', 'Nepal']
    const best = pickBestMapTitle(titles, 'Uncharted 2: Among Thieves', 'uncharted-2-among-thieves')
    assert.equal(best, null)
  })

  it('picks the Uncharted 2 map when a genuine candidate is present', () => {
    const titles = ['Western Ghats', 'Uncharted 2: Among Thieves World Map', 'Shambhala']
    const best = pickBestMapTitle(titles, 'Uncharted 2: Among Thieves', 'uncharted-2-among-thieves')
    assert.equal(best, 'Uncharted 2: Among Thieves World Map')
  })

  it('picks the Ocarina of Time map, never the 1986 original', () => {
    // Ocarina of Time must never bind to the 1986 The Legend of Zelda dungeon
    // map even though both live under legendofzelda.fandom.com.
    const titles = ['Overworld', 'Dungeon 1', 'Ocarina of Time World Map']
    const best = pickBestMapTitle(
      titles,
      'The Legend of Zelda: Ocarina of Time',
      'the-legend-of-zelda-ocarina-of-time',
    )
    assert.equal(best, 'Ocarina of Time World Map')
  })

  it('returns null when every title on the wiki fails the specificity gate', () => {
    const titles = ['Overworld', 'Dungeon 1', 'Dungeon 2']
    const best = pickBestMapTitle(
      titles,
      'The Legend of Zelda: Ocarina of Time',
      'the-legend-of-zelda-ocarina-of-time',
    )
    assert.equal(best, null)
  })
})
