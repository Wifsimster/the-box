import type { Knex } from 'knex'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface GameSeedData {
  name: string
  slug: string
  aliases: string[]
  release_year: number | null
  developer: string | null
  publisher: string | null
  genres: string[]
  platforms: string[]
  cover_image_url: string | null
}

export async function seed(knex: Knex): Promise<void> {
  const dataPath = join(__dirname, '..', 'data', 'games.json')

  if (!existsSync(dataPath)) {
    console.log('No games.json found. Run "npm run fetch:games" first.')
    console.log('Skipping games seed.')
    return
  }

  const rawData = readFileSync(dataPath, 'utf-8')
  const gamesData: GameSeedData[] = JSON.parse(rawData)

  if (gamesData.length === 0) {
    console.log('No games to seed.')
    return
  }

  console.log(`Seeding ${gamesData.length} games...`)

  // Clear existing games (cascades to screenshots via FK)
  await knex('games').del()

  // Insert games in batches
  const batchSize = 50
  for (let i = 0; i < gamesData.length; i += batchSize) {
    const batch = gamesData.slice(i, i + batchSize).map((game) => ({
      name: game.name,
      slug: game.slug,
      aliases: game.aliases,
      release_year: game.release_year,
      developer: game.developer,
      publisher: game.publisher,
      genres: game.genres,
      platforms: game.platforms,
      cover_image_url: game.cover_image_url,
    }))

    await knex('games').insert(batch)
    console.log(`Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(gamesData.length / batchSize)}`)
  }

  console.log(`Seeded ${gamesData.length} games`)
}
