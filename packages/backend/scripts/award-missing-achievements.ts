/**
 * Script to retroactively award missing achievements to users
 * Run with: npx tsx scripts/award-missing-achievements.ts
 */

import { db } from '../src/infrastructure/database/connection.js'

async function awardMissingAchievements() {
    console.log('Starting to award missing achievements...\n')

    // Find all users who have started at least one challenge but don't have 'welcome_player'
    const usersWithoutWelcome = await db('game_sessions')
        .select('user_id')
        .groupBy('user_id')
        .whereNotExists(
            db('user_achievements')
                .join('achievements', 'user_achievements.achievement_id', 'achievements.id')
                .whereRaw('user_achievements.user_id = game_sessions.user_id')
                .where('achievements.key', 'welcome_player')
        )

    console.log(`Found ${usersWithoutWelcome.length} users missing 'welcome_player' achievement`)

    // Get the welcome_player achievement
    const welcomeAchievement = await db('achievements')
        .where('key', 'welcome_player')
        .first()

    if (!welcomeAchievement) {
        console.error('ERROR: welcome_player achievement not found in database!')
        console.log('Please run migrations first: npm run db:migrate')
        process.exit(1)
    }

    console.log(`Achievement found: "${welcomeAchievement.name}" (ID: ${welcomeAchievement.id})`)

    // Award the achievement to each user
    let awarded = 0
    for (const user of usersWithoutWelcome) {
        try {
            // Get their game session count
            const sessionCount = await db('game_sessions')
                .where('user_id', user.user_id)
                .count('* as count')
                .first()

            await db('user_achievements').insert({
                user_id: user.user_id,
                achievement_id: welcomeAchievement.id,
                earned_at: new Date(),
                progress: Number(sessionCount?.count || 1),
                progress_max: 1,
            })
            awarded++
        } catch (error: any) {
            // Ignore duplicate key errors (user already has achievement)
            if (!error.message?.includes('duplicate key')) {
                console.error(`Failed to award to user ${user.user_id}:`, error.message)
            }
        }
    }

    console.log(`\nAwarded 'welcome_player' to ${awarded} users`)

    // Also award other missing beginner achievements
    const beginnerAchievements = [
        { key: 'first_guess', type: 'total_guesses', table: 'guesses' },
        { key: 'first_correct', type: 'total_correct_guesses', table: 'guesses', filter: { is_correct: true } },
    ]

    for (const achConfig of beginnerAchievements) {
        const achievement = await db('achievements').where('key', achConfig.key).first()
        if (!achievement) continue

        const criteria = achievement.criteria
        if (!criteria?.count) continue

        // Find users who qualify but don't have this achievement
        let query = db('guesses')
            .join('tier_sessions', 'guesses.tier_session_id', 'tier_sessions.id')
            .join('game_sessions', 'tier_sessions.game_session_id', 'game_sessions.id')
            .select('game_sessions.user_id')
            .groupBy('game_sessions.user_id')
            .havingRaw('count(*) >= ?', [criteria.count])
            .whereNotExists(
                db('user_achievements')
                    .whereRaw('user_achievements.user_id = game_sessions.user_id')
                    .where('user_achievements.achievement_id', achievement.id)
            )

        if (achConfig.filter) {
            query = query.where(achConfig.filter)
        }

        const qualifyingUsers = await query

        let awardedCount = 0
        for (const user of qualifyingUsers) {
            try {
                await db('user_achievements').insert({
                    user_id: user.user_id,
                    achievement_id: achievement.id,
                    earned_at: new Date(),
                    progress: criteria.count,
                    progress_max: criteria.count,
                })
                awardedCount++
            } catch (error: any) {
                if (!error.message?.includes('duplicate key')) {
                    console.error(`Failed to award ${achConfig.key} to user ${user.user_id}:`, error.message)
                }
            }
        }

        if (awardedCount > 0) {
            console.log(`Awarded '${achConfig.key}' to ${awardedCount} users`)
        }
    }

    console.log('\nDone!')
    await db.destroy()
}

awardMissingAchievements().catch(err => {
    console.error('Script failed:', err)
    process.exit(1)
})
