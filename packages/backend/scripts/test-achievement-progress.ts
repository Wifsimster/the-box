/**
 * Test achievement progress calculation
 */

import { db } from '../src/infrastructure/database/connection.js'
import { AchievementService } from '../src/domain/services/achievement.service.js'

async function testProgress() {
    const achievementService = new AchievementService()

    // Find admin user
    const admin = await db('user')
        .where('username', 'testadmin')
        .first()

    if (!admin) {
        console.log('Admin user not found')
        await db.destroy()
        return
    }

    console.log(`Testing progress for: ${admin.username}\n`)

    const achievements = await achievementService.getAllAchievementsWithProgress(admin.id)

    // Filter to genre achievements
    const genreAchievements = achievements.filter(a =>
        a.key === 'rpg_expert' || a.key === 'action_hero' || a.key === 'strategy_savant'
    )

    console.log('Genre Achievement Progress:\n')
    genreAchievements.forEach(a => {
        console.log(`${a.name}:`)
        console.log(`  Key: ${a.key}`)
        console.log(`  Progress: ${a.progress} / ${a.progressMax}`)
        console.log(`  Earned: ${a.earned}`)
        console.log(`  Criteria: ${JSON.stringify(a.criteria)}`)
        console.log()
    })

    await db.destroy()
}

testProgress()
    .then(() => console.log('✓ Test complete'))
    .catch((error) => {
        console.error('Error:', error)
        process.exit(1)
    })
