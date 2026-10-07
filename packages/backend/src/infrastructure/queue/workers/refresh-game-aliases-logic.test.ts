import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { refreshAliasesForGames, type AliasRefreshGame } from './refresh-game-aliases-logic.js'

const games: AliasRefreshGame[] = [
  { id: 1, name: 'Pokémon Sword', slug: 'pokemon-sword', aliases: [], rawgId: 100 },
  { id: 2, name: 'The Sims 4', slug: 'the-sims-4', aliases: ['Les Sims 4'] },
  { id: 3, name: 'Gone Game', slug: 'gone-game', aliases: [], rawgId: 300 },
  { id: 4, name: 'Broken Game', slug: 'broken-game', aliases: [], rawgId: 400 },
]

const rawg: Record<string, string[] | null | 'error'> = {
  '100': ['Pokémon Épée', 'ポケットモンスター ソード'],
  'the-sims-4': ['les sims 4'],
  '300': null,
  '400': 'error',
}

describe('refreshAliasesForGames', () => {
  it('adds new aliases only, looks games up by RAWG id or slug, and keeps going on errors', async () => {
    const saved: Array<[number, string[]]> = []
    const lookups: Array<number | string> = []
    const progress: number[] = []

    const result = await refreshAliasesForGames({
      games,
      fetchAlternativeNames: async key => {
        lookups.push(key)
        const value = rawg[String(key)]
        if (value === 'error') throw new Error('RAWG API error: 500')
        return value ?? null
      },
      saveAliases: async (id, aliases) => {
        saved.push([id, aliases])
      },
      onProgress: current => progress.push(current),
    })

    assert.deepEqual(lookups, [100, 'the-sims-4', 300, 400])
    // Sims: the only RAWG name duplicates the curated alias -> no write.
    assert.deepEqual(saved, [[1, ['Pokémon Épée']]])
    assert.deepEqual(progress, [1, 2, 3, 4])
    assert.equal(result.gamesProcessed, 4)
    assert.equal(result.gamesUpdated, 1)
    assert.equal(result.aliasesAdded, 1)
    assert.equal(result.notFound, 1)
    assert.equal(result.failedCount, 1)
  })
})
