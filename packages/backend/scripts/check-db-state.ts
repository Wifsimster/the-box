/**
 * Check database state
 */
import { db } from '../src/infrastructure/database/connection.js'

async function checkDatabase() {
    console.log('Checking database state...\n')

    const gamesCount = await db('games').count('id as count').first()
    console.log(`Games: ${gamesCount?.count ?? 0}`)

    const screenshotsCount = await db('screenshots').count('id as count').first()
    console.log(`Screenshots: ${Number(screenshotsCount?.count ?? 0)}`)

    const challengesCount = await db('daily_challenges').count('id as count').first()
    console.log(`Challenges: ${challengesCount?.count ?? 0}`)

    const tiersCount = await db('tiers').count('id as count').first()
    console.log(`Tiers: ${Number(tiersCount?.count ?? 0)}`)

    const tsCount = await db('tier_screenshots').count('id as count').first()
    console.log(`Tier screenshots: ${Number(tsCount?.count ?? 0)}`)
}

checkDatabase().catch(console.error).finally(() => process.exit(0))
