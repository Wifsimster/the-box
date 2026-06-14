import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Game } from '@the-box/types'
import { createFuzzyMatchService } from './fuzzy-match.service.js'
import type { DomainLogger } from '../ports/logger.js'
import {
  computeGuessProximityHint,
  type ProximityAnswer,
} from './guess-proximity.service.js'

const silentLogger: DomainLogger = {
  child: () => silentLogger,
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
}

const fuzzyMatch = createFuzzyMatchService({ logger: silentLogger })

function game(partial: Partial<Game> & Pick<Game, 'id' | 'name'>): Game {
  return {
    slug: partial.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    aliases: [],
    ...partial,
  }
}

const divinity: ProximityAnswer = {
  id: 1,
  name: 'Divinity: Original Sin',
  developer: 'Larian Studios',
  publisher: 'Larian Studios',
}

describe('computeGuessProximityHint', () => {
  it('flags a different game by the same studio (Larian)', () => {
    const candidates = [
      game({ id: 2, name: "Baldur's Gate 3", developer: 'Larian Studios', publisher: 'Larian Studios' }),
    ]
    const hint = computeGuessProximityHint({
      guessText: "Baldur's Gate 3",
      answer: divinity,
      candidates,
      fuzzyMatch,
    })
    assert.deepEqual(hint, { relation: 'same_developer', value: 'Larian Studios' })
  })

  it('prefers same_franchise over studio/publisher', () => {
    const answer: ProximityAnswer = {
      id: 10,
      name: 'The Witcher 3: Wild Hunt',
      developer: 'CD Projekt Red',
      publisher: 'CD Projekt',
    }
    const candidates = [
      game({ id: 11, name: 'The Witcher 2: Assassins of Kings', developer: 'CD Projekt Red', publisher: 'CD Projekt' }),
    ]
    const hint = computeGuessProximityHint({
      guessText: 'The Witcher 2',
      answer,
      candidates,
      fuzzyMatch,
    })
    assert.equal(hint?.relation, 'same_franchise')
    assert.equal(hint?.value, 'The Witcher')
  })

  it('flags same publisher when developer differs', () => {
    const answer: ProximityAnswer = {
      id: 20,
      name: 'Hades',
      developer: 'Supergiant Games',
      publisher: 'Private Division',
    }
    const candidates = [
      game({ id: 21, name: 'Kerbal Space Program', developer: 'Squad', publisher: 'Private Division' }),
    ]
    const hint = computeGuessProximityHint({
      guessText: 'Kerbal Space Program',
      answer,
      candidates,
      fuzzyMatch,
    })
    assert.deepEqual(hint, { relation: 'same_publisher', value: 'Private Division' })
  })

  it('returns null when the guess shares nothing with the answer', () => {
    const candidates = [
      game({ id: 3, name: 'Doom', developer: 'id Software', publisher: 'Bethesda' }),
    ]
    const hint = computeGuessProximityHint({
      guessText: 'Doom',
      answer: divinity,
      candidates,
      fuzzyMatch,
    })
    assert.equal(hint, null)
  })

  it('never derives a hint from the answer’s own catalogue row', () => {
    const candidates = [
      game({ id: 1, name: 'Divinity: Original Sin', developer: 'Larian Studios', publisher: 'Larian Studios' }),
    ]
    const hint = computeGuessProximityHint({
      guessText: 'Divinity Original Sin',
      answer: divinity,
      candidates,
      fuzzyMatch,
    })
    assert.equal(hint, null)
  })

  it('returns null when no candidate fuzzy-matches the guess', () => {
    const candidates = [
      game({ id: 4, name: 'Stardew Valley', developer: 'ConcernedApe', publisher: 'ConcernedApe' }),
    ]
    const hint = computeGuessProximityHint({
      guessText: 'completely unrelated text',
      answer: divinity,
      candidates,
      fuzzyMatch,
    })
    assert.equal(hint, null)
  })

  it('returns null with no candidates', () => {
    const hint = computeGuessProximityHint({
      guessText: 'anything',
      answer: divinity,
      candidates: [],
      fuzzyMatch,
    })
    assert.equal(hint, null)
  })
})
