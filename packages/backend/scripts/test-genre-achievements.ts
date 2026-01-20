/**
 * Test script to check genre achievement tracking
 * Usage: npx tsx scripts/test-genre-achievements.ts <userId>
 */

import { db } from '../src/infrastructure/database/connection.js'

async function testGenreAchievements(userId: string) {
    console.log(`Testing genre achievements for user: ${userId}\n`)

    const genres = ['RPG', 'Action', 'Strategy']

    for (const genre of genres) {
        console.log(`\n=== Checking ${genre} genre ===`)

        // Query to count correct guesses for this genre
        const result = await db('guesses')
            .join('tier_sessions', 'guesses.tier_session_id', 'tier_sessions.id')
            .join('game_sessions', 'tier_sessions.game_session_id', 'game_sessions.id')
            .join('screenshots', 'guesses.screenshot_id', 'screenshots.id')
            .join('games', 'screenshots.game_id', 'games.id')
            .where('game_sessions.user_id', userId)
            .where('guesses.is_correct', true)
            .whereRaw('? = ANY(games.genres)', [genre])
            .select(
                'games.name as game_name',
                'games.genres',
                'guesses.created_at'
            )
            .orderBy('guesses.created_at', 'desc')

        console.log(`Total correct guesses for ${genre}: ${result.length}`)

        if (result.length > 0) {
            console.log('\nRecent guesses:')
            result.slice(0, 5).forEach((r, idx) => {
                console.log(`  ${idx + 1}. ${r.game_name} (${r.genres.join(', ')})`)
            })
        }
    }

    await db.destroy()
}

const userId = process.argv[2]
if (!userId) {
    console.error('Usage: npx tsx scripts/test-genre-achievements.ts <userId>')
    process.exit(1)
}

testGenreAchievements(userId)
    .then(() => console.log('\n✓ Test complete'))
    .catch((error) => {
        console.error('Error:', error)
        process.exit(1)
    })
