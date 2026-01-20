/**
 * Script to check why score_500 achievement is not unlocking
 * Run with: npx tsx scripts/check-score-achievement.ts <userId>
 */

import { db } from '../src/infrastructure/database/connection.js'

async function checkScoreAchievement(userId?: string) {
    try {
        // If no userId provided, check all users
        if (!userId) {
            const users = await db('user')
                .select('id', 'username', 'display_name')
                .limit(10)

            console.log('Available users (first 10):')
            users.forEach(u => {
                console.log(`  ${u.id} - ${u.display_name || u.username}`)
            })
            console.log('\nRun: npx tsx scripts/check-score-achievement.ts <userId>')
            return
        }

        console.log('\n=== Checking Score Achievement for User ===\n')

        // Get user info
        const user = await db('user')
            .where('id', userId)
            .select('id', 'username', 'display_name')
            .first()

        if (!user) {
            console.error(`User not found: ${userId}`)
            return
        }

        console.log(`User: ${user.display_name || user.username} (${user.id})`)
        console.log()

        // Get score_500 achievement
        const achievement = await db('achievements')
            .where('key', 'score_500')
            .first()

        if (!achievement) {
            console.error('score_500 achievement not found!')
            return
        }

        console.log(`Achievement: ${achievement.name}`)
        console.log(`Description: ${achievement.description}`)
        console.log(`Criteria: ${JSON.stringify(achievement.criteria)}`)
        console.log()

        // Check if user already has this achievement
        const userAchievement = await db('user_achievements')
            .where('user_id', userId)
            .where('achievement_id', achievement.id)
            .first()

        if (userAchievement) {
            console.log('✅ User already has this achievement!')
            console.log(`   Earned at: ${userAchievement.earned_at}`)
            console.log(`   Progress: ${userAchievement.progress}/${userAchievement.progress_max}`)
            return
        }

        console.log('❌ User does NOT have this achievement yet')
        console.log()

        // Get all completed game sessions with their scores
        const sessions = await db('game_sessions')
            .where('user_id', userId)
            .where('is_completed', true)
            .select('id', 'total_score', 'completed_at', 'daily_challenge_id')
            .orderBy('total_score', 'desc')

        console.log(`Total completed sessions: ${sessions.length}`)
        console.log()

        if (sessions.length === 0) {
            console.log('No completed sessions found.')
            return
        }

        console.log('Top scores:')
        const topSessions = sessions.slice(0, 10)
        for (const session of topSessions) {
            const challenge = await db('daily_challenges')
                .where('id', session.daily_challenge_id)
                .select('challenge_date')
                .first()

            const icon = session.total_score >= 500 ? '✅' : '  '
            console.log(`${icon} ${session.total_score} pts - ${challenge?.challenge_date} (session: ${session.id})`)
        }
        console.log()

        // Check if any session has >= 500 points
        const qualifyingSessions = sessions.filter(s => s.total_score >= 500)

        if (qualifyingSessions.length > 0) {
            console.log(`\n⚠️  ISSUE FOUND: User has ${qualifyingSessions.length} session(s) with 500+ points but achievement not awarded!`)
            console.log('\nTop qualifying session:')
            const top = qualifyingSessions[0]
            console.log(`   Session ID: ${top.id}`)
            console.log(`   Score: ${top.total_score}`)
            console.log(`   Completed: ${top.completed_at}`)

            // Check guesses for this session
            const guesses = await db('guesses')
                .join('tier_sessions', 'guesses.tier_session_id', 'tier_sessions.id')
                .where('tier_sessions.game_session_id', top.id)
                .select('guesses.*')
                .orderBy('guesses.position')

            console.log(`   Guesses: ${guesses.length}`)
            console.log(`   Correct: ${guesses.filter((g: any) => g.is_correct).length}`)

            console.log('\n💡 Possible reasons:')
            console.log('   1. Achievement was added AFTER this session was completed')
            console.log('   2. Achievement check failed during game completion')
            console.log('   3. Database error when awarding achievement')

            console.log('\n🔧 Solution:')
            console.log(`   Run: npx tsx scripts/award-missing-score-achievements.ts`)
        } else {
            console.log('✓ No sessions qualify for this achievement yet (need 500+ points)')
        }

    } catch (error) {
        console.error('Error:', error)
    } finally {
        await db.destroy()
    }
}

// Get userId from command line args
const userId = process.argv[2]
checkScoreAchievement(userId)
