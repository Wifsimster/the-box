import { db } from '../src/infrastructure/database/connection.js'

interface ScoreAchievement {
    key: string
    name: string
    minScore: number
    achievementId: number
}

async function awardMissingScoreAchievements() {
    console.log('\n=== Awarding Missing Score Achievements ===\n')

    try {
        const scoreAchievements = await db('achievements')
            .whereIn('key', ['score_500', 'score_1000', 'score_1500'])
            .select('id', 'key', 'name', 'criteria')

        if (scoreAchievements.length === 0) {
            console.log('No score achievements found in database!')
            return
        }

        const achievements: ScoreAchievement[] = scoreAchievements.map(a => ({
            key: a.key,
            name: a.name,
            minScore: a.criteria.score,
            achievementId: a.id,
        }))

        console.log('Found achievements:')
        achievements.forEach(a => {
            console.log(`  - ${a.name} (${a.key}): ${a.minScore}+ points`)
        })
        console.log()

        achievements.sort((a, b) => b.minScore - a.minScore)

        let totalAwarded = 0

        for (const achievement of achievements) {
            console.log(`\nChecking ${achievement.name} (${achievement.minScore}+ points)...`)

            const qualifyingUsers = await db('game_sessions')
                .select('game_sessions.user_id')
                .max('game_sessions.total_score as max_score')
                .leftJoin('user_achievements', function () {
                    this.on('game_sessions.user_id', '=', 'user_achievements.user_id')
                        .andOn('user_achievements.achievement_id', '=', db.raw('?', [achievement.achievementId]))
                })
                .where('game_sessions.is_completed', true)
                .whereNull('user_achievements.id')
                .groupBy('game_sessions.user_id')
                .havingRaw('max(game_sessions.total_score) >= ?', [achievement.minScore])

            console.log(`  Found ${qualifyingUsers.length} qualifying users`)

            if (qualifyingUsers.length === 0) {
                continue
            }

            for (const user of qualifyingUsers) {
                try {
                    const userInfo = await db('user')
                        .where('id', user.user_id)
                        .select('username', 'display_name')
                        .first()

                    await db('user_achievements').insert({
                        user_id: user.user_id,
                        achievement_id: achievement.achievementId,
                        earned_at: new Date(),
                        progress: user.max_score,
                        progress_max: achievement.minScore,
                        metadata: null,
                    })

                    const displayName = userInfo?.display_name || userInfo?.username || user.user_id
                    console.log(`    ✓ Awarded to ${displayName} (score: ${user.max_score})`)
                    totalAwarded++
                } catch (error: any) {
                    if (error.message?.includes('duplicate key')) {
                        continue
                    }
                    console.error(`    ✗ Error for user ${user.user_id}:`, error.message)
                }
            }
        }

        console.log(`\n✅ Complete! Awarded ${totalAwarded} achievement(s) total.\n`)

    } catch (error) {
        console.error('Error:', error)
    } finally {
        await db.destroy()
    }
}

awardMissingScoreAchievements()
