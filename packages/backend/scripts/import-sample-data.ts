/**
 * Import sample games and screenshots from JSON files
 */
import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { db } from '../src/infrastructure/database/connection.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function importData() {
    console.log('Loading data files...')

    const gamesData = JSON.parse(
        await readFile(join(__dirname, '../data/games.json'), 'utf-8')
    )
    const screenshotsData = JSON.parse(
        await readFile(join(__dirname, '../data/screenshots.json'), 'utf-8')
    )

    console.log(`Found ${gamesData.length} games and ${screenshotsData.length} screenshots`)

    // Import games
    console.log('Importing games...')
    for (const game of gamesData) {
        await db('games').insert(game).onConflict('id').ignore()
    }
    console.log(`✓ Imported ${gamesData.length} games`)

    // Create a map of slug to game ID
    const slugToIdMap = new Map()
    const games = await db('games').select('id', 'slug')
    for (const game of games) {
        slugToIdMap.set(game.slug, game.id)
    }

    // Import screenshots
    console.log('Importing screenshots...')
    let imported = 0
    for (const screenshot of screenshotsData) {
        const gameId = slugToIdMap.get(screenshot.game_slug)
        if (!gameId) {
            console.warn(`Warning: Game not found for slug "${screenshot.game_slug}", skipping screenshot`)
            continue
        }

        await db('screenshots').insert({
            game_id: gameId,
            image_url: screenshot.image_url,
            thumbnail_url: screenshot.thumbnail_url,
            difficulty: screenshot.difficulty ?? 2,
        }).onConflict('id').ignore()
        imported++
    }
    console.log(`✓ Imported ${imported} screenshots`)

    console.log('\nDatabase populated successfully!')
}

importData()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Error:', error)
        process.exit(1)
    })
