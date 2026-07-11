import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  fandomMapTitleAcceptable,
  fandomWikiBaseTokens,
  isFranchiseWiki,
} from './geo-metadata.service.js'

describe('fandomWikiBaseTokens', () => {
  it('drops platform/lang/site suffix tokens', () => {
    assert.deepEqual(fandomWikiBaseTokens('zelda_gamepedia_en'), ['zelda'])
    assert.deepEqual(fandomWikiBaseTokens('uncharted'), ['uncharted'])
    assert.deepEqual(fandomWikiBaseTokens('eldenring'), ['eldenring'])
    assert.deepEqual(fandomWikiBaseTokens('thelastofus'), ['thelastofus'])
  })
})

describe('isFranchiseWiki', () => {
  it('treats game-specific wikis as single-game', () => {
    assert.equal(isFranchiseWiki('bloodborne', 'bloodborne'), false)
    assert.equal(isFranchiseWiki('eldenring', 'elden-ring'), false)
  })

  it('detects franchise wikis where the slug carries installment tokens', () => {
    // Observed wrong-map cases: subdomain much shorter than the slug.
    assert.equal(
      isFranchiseWiki('uncharted', 'uncharted-2-among-thieves'),
      true,
    )
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
    // Bloodborne: real single-game-wiki map with only generic keywords.
    assert.equal(
      fandomMapTitleAcceptable('World Map', 'Bloodborne', 'bloodborne', 'bloodborne'),
      true,
    )
    assert.equal(
      fandomMapTitleAcceptable('The Lands Between', 'Elden Ring', 'eldenring', 'elden-ring'),
      true,
    )
  })

  it('REJECTS a sibling installment map on a franchise wiki (regression)', () => {
    // Uncharted 2 must never bind Lost Legacy's "Western Ghats".
    assert.equal(
      fandomMapTitleAcceptable(
        'Western Ghats',
        'Uncharted 2: Among Thieves',
        'uncharted',
        'uncharted-2-among-thieves',
      ),
      false,
    )
    // Ocarina of Time must never bind the 1986 "Level 1" dungeon map, even
    // though it shares the "Legend of Zelda" franchise words.
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

  it('accepts a franchise-wiki map that fully names the game', () => {
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
