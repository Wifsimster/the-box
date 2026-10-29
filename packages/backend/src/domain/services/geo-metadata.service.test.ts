import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  fandomMapTitleAcceptable,
  fandomWikiBaseTokens,
  isFranchiseWiki,
  pickBestMapTitle,
  scoreMapTitle,
} from './geo-metadata.service.js'

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
    const score = scoreMapTitle('Western Ghats', 'Uncharted 2: Among Thieves', 'uncharted-2-among-thieves')
    assert.equal(score, Number.NEGATIVE_INFINITY)
  })

  it('rejects a generic title that shares no distinguishing token with the game', () => {
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

describe('fandomWikiBaseTokens', () => {
  it('drops platform/lang/site suffix tokens', () => {
    assert.deepEqual(fandomWikiBaseTokens('zelda_gamepedia_en'), ['zelda'])
    assert.deepEqual(fandomWikiBaseTokens('uncharted'), ['uncharted'])
    assert.deepEqual(fandomWikiBaseTokens('eldenring'), ['eldenring'])
  })
})

describe('isFranchiseWiki', () => {
  it('treats game-specific wikis as single-game', () => {
    assert.equal(isFranchiseWiki('bloodborne', 'bloodborne'), false)
    assert.equal(isFranchiseWiki('eldenring', 'elden-ring'), false)
  })

  it('detects franchise wikis where the slug carries installment tokens', () => {
    assert.equal(isFranchiseWiki('uncharted', 'uncharted-2-among-thieves'), true)
    assert.equal(
      isFranchiseWiki('zelda_gamepedia_en', 'the-legend-of-zelda-ocarina-of-time'),
      true,
    )
  })

  it('is safe on empty inputs', () => {
    assert.equal(isFranchiseWiki('', 'bloodborne'), false)
    assert.equal(isFranchiseWiki('bloodborne', ''), false)
  })
})

describe('fandomMapTitleAcceptable', () => {
  it('accepts any map on a game-specific wiki (nothing to disambiguate)', () => {
    assert.equal(
      fandomMapTitleAcceptable('World Map', 'Bloodborne', 'bloodborne', 'bloodborne'),
      true,
    )
  })

  it('REJECTS a sibling map that shares only franchise tokens (OoT regression)', () => {
    assert.equal(
      fandomMapTitleAcceptable(
        'Level 1 (First Quest) (The Legend of Zelda)',
        'The Legend of Zelda: Ocarina of Time',
        'zelda_gamepedia_en',
        'the-legend-of-zelda-ocarina-of-time',
      ),
      false,
    )
  })

  it('accepts a franchise-wiki map that names the game in full', () => {
    assert.equal(
      fandomMapTitleAcceptable(
        'The Legend of Zelda: Ocarina of Time World Map',
        'The Legend of Zelda: Ocarina of Time',
        'zelda_gamepedia_en',
        'the-legend-of-zelda-ocarina-of-time',
      ),
      true,
    )
  })
})
