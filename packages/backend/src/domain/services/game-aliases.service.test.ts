import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_GAME_ALIASES, mergeGameAliases } from './game-aliases.service.js'

describe('mergeGameAliases', () => {
  it('adds Latin-script alternative names', () => {
    assert.deepEqual(mergeGameAliases('Pokémon Sword', [], ['Pokémon Épée', 'Pokémon Schwert']), [
      'Pokémon Épée',
      'Pokémon Schwert',
    ])
  })

  it('drops names a player cannot type, blanks and the game name itself', () => {
    assert.deepEqual(
      mergeGameAliases('Pokémon Sword', [], ['ポケットモンスター ソード', '', null, '  ', 'pokemon sword', 'Покемон']),
      []
    )
  })

  it('keeps curated aliases first and skips duplicates of them', () => {
    assert.deepEqual(mergeGameAliases('The Sims 4', ['Les Sims 4'], ['les sims 4', 'Sims 4']), [
      'Les Sims 4',
      'Sims 4',
    ])
  })

  it('caps the list', () => {
    const many = Array.from({ length: 50 }, (_, i) => `Alt name ${i}`)
    assert.equal(mergeGameAliases('Game', [], many).length, MAX_GAME_ALIASES)
  })
})
