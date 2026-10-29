import { db } from '../src/infrastructure/database/connection.js'
import { AchievementService } from '../src/domain/services/achievement.service.js'

async function testProgress() {
    const achievementService = new AchievementService()

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

    const leaderboardAchievements = achievements.filter(a =>
        a.key === 'champion' || a.key === 'podium_finish' || a.key === 'top_ten'
    )

    console.log('Leaderboard Achievement Progress:\n')
    leaderboardAchievements.forEach(a => {
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
