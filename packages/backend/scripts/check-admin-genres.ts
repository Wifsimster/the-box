/**
 * Check admin user's genre progress
 */

import { db } from '../src/infrastructure/database/connection.js'

async function checkAdminGenres() {
    // Find admin user
    const admin = await db('user')
        .where('username', 'admin')
        .orWhere('email', 'like', '%admin%')
        .first()

    if (!admin) {
        console.log('Admin user not found')
        await db.destroy()
        return
    }

    console.log(`Admin user found: ${admin.username} (${admin.email})`)
    console.log(`User ID: ${admin.id}\n`)

    // Get all genres from the database
    const allGenres = await db('games')
        .select(db.raw('DISTINCT unnest(genres) as genre'))
        .whereNotNull('genres')
        .orderBy('genre')

    console.log('Checking correct guesses by genre:\n')

    const results = []

    for (const { genre } of allGenres) {
        const count = await db('guesses')
            .join('tier_sessions', 'guesses.tier_session_id', 'tier_sessions.id')
            .join('game_sessions', 'tier_sessions.game_session_id', 'game_sessions.id')
            .join('screenshots', 'guesses.screenshot_id', 'screenshots.id')
            .join('games', 'screenshots.game_id', 'games.id')
            .where('game_sessions.user_id', admin.id)
            .where('guesses.is_correct', true)
            .whereRaw('? = ANY(games.genres)', [genre])
            .count('* as count')
            .first()

        const total = Number(count?.count || 0)
        if (total > 0) {
            results.push({ genre, total })
        }
    }

    // Sort by count descending
    results.sort((a, b) => b.total - a.total)

    // Display results
    results.forEach(({ genre, total }) => {
        const status = total >= 10 ? '✓' : ' '
        console.log(`${status} ${genre.padEnd(25)} : ${total.toString().padStart(3)} guesses ${total >= 10 ? '(UNLOCKED)' : ''}`)
    })

    console.log(`\nTotal genres with at least 1 correct guess: ${results.length}`)
    console.log(`Genres with 10+ correct guesses: ${results.filter(r => r.total >= 10).length}`)

    await db.destroy()
}

checkAdminGenres()
    .then(() => console.log('\n✓ Check complete'))
    .catch((error) => {
        console.error('Error:', error)
        process.exit(1)
    })
