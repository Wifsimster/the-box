import type { Knex } from 'knex'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface ScreenshotSeedData {
  game_slug: string
  image_url: string
  thumbnail_url: string | null
  original_url: string
  difficulty: 1 | 2 | 3
}

// Flat image panorama settings (not 360 panorama)
const FLAT_IMAGE_HAOV = 120
const FLAT_IMAGE_VAOV = 90

export async function seed(knex: Knex): Promise<void> {
  const dataPath = join(__dirname, '..', 'data', 'screenshots.json')

  if (!existsSync(dataPath)) {
    console.log('No screenshots.json found. Run "npm run fetch:games" first.')
    console.log('Skipping screenshots seed.')
    return
  }

  const rawData = readFileSync(dataPath, 'utf-8')
  const screenshotsData: ScreenshotSeedData[] = JSON.parse(rawData)

  if (screenshotsData.length === 0) {
    console.log('No screenshots to seed.')
    return
  }

  console.log(`Seeding ${screenshotsData.length} screenshots...`)

  // Get game ID lookup by slug
  const games = await knex('games').select('id', 'slug')
  const gameIdBySlug = new Map<string, number>(games.map((g) => [g.slug, g.id]))

  // Clear existing screenshots
  await knex('screenshots').del()

  // Filter screenshots for existing games and prepare records
  const screenshots = screenshotsData
    .filter((s) => gameIdBySlug.has(s.game_slug))
    .map((screenshot) => ({
      game_id: gameIdBySlug.get(screenshot.game_slug),
      image_url: screenshot.image_url,
      thumbnail_url: screenshot.thumbnail_url,
      haov: FLAT_IMAGE_HAOV,
      vaov: FLAT_IMAGE_VAOV,
      difficulty: screenshot.difficulty,
      location_hint: null,
      is_active: true,
      times_used: 0,
      correct_guesses: 0,
    }))

  if (screenshots.length === 0) {
    console.log('No valid screenshots to seed (no matching games found).')
    return
  }

  // Insert in batches
  const batchSize = 100
  for (let i = 0; i < screenshots.length; i += batchSize) {
    const batch = screenshots.slice(i, i + batchSize)
    await knex('screenshots').insert(batch)
    console.log(`Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(screenshots.length / batchSize)}`)
  }

  console.log(`Seeded ${screenshots.length} screenshots`)
}
