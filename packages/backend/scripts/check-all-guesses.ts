/**
 * Check all guesses and their games/genres
 */

import { db } from '../src/infrastructure/database/connection.js'

async function checkAllGuesses() {
    console.log('Checking all correct guesses with genres...\n')

    const guesses = await db('guesses')
        .join('tier_sessions', 'guesses.tier_session_id', 'tier_sessions.id')
        .join('game_sessions', 'tier_sessions.game_session_id', 'game_sessions.id')
        .join('screenshots', 'guesses.screenshot_id', 'screenshots.id')
        .join('games', 'screenshots.game_id', 'games.id')
        .where('guesses.is_correct', true)
        .select(
            'game_sessions.user_id',
            'games.name as game_name',
            'games.genres',
            'guesses.created_at'
        )
        .orderBy('guesses.created_at', 'desc')
        .limit(20)

    console.log(`Found ${guesses.length} correct guesses`)

    if (guesses.length > 0) {
        console.log('\nRecent correct guesses:')
        guesses.forEach((g, idx) => {
            console.log(`  ${idx + 1}. User ${g.user_id}: ${g.game_name}`)
            console.log(`     Genres: ${g.genres ? g.genres.join(', ') : 'None'}`)
        })
    } else {
        console.log('\nNo correct guesses found in database')
    }

    // Check total users with completed games
    const users = await db('game_sessions')
        .where('is_completed', true)
        .countDistinct('user_id as count')
        .first()

    console.log(`\nTotal users with completed games: ${users?.count || 0}`)

    await db.destroy()
}

checkAllGuesses()
    .then(() => console.log('\n✓ Check complete'))
    .catch((error) => {
        console.error('Error:', error)
        process.exit(1)
    })
