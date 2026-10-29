import { db } from '../src/infrastructure/database/connection.js'

async function checkLeaderboardRanks() {
    const admin = await db('user')
        .where('username', 'testadmin')
        .first()

    if (!admin) {
        console.log('Admin user not found')
        await db.destroy()
        return
    }

    console.log(`Checking leaderboard ranks for: ${admin.username} (${admin.id})\n`)

    const userChallenges = await db('game_sessions')
        .where('user_id', admin.id)
        .where('is_completed', true)
        .select('daily_challenge_id', 'total_score')
        .orderBy('total_score', 'desc')

    console.log(`User has completed ${userChallenges.length} challenges\n`)

    if (userChallenges.length === 0) {
        console.log('No completed challenges found')
        await db.destroy()
        return
    }

    const rankResults = []

    for (const userChallenge of userChallenges) {
        const challengeId = userChallenge.daily_challenge_id
        const userScore = userChallenge.total_score

        const challenge = await db('daily_challenges')
            .where('id', challengeId)
            .select('challenge_date')
            .first()

        const rankings = await db('game_sessions')
            .where('daily_challenge_id', challengeId)
            .where('is_completed', true)
            .orderBy('total_score', 'desc')
            .select('user_id', 'total_score')

        const userRank = rankings.findIndex(r => r.user_id === admin.id) + 1

        rankResults.push({
            challengeId,
            challengeDate: challenge?.challenge_date,
            userScore,
            rank: userRank,
            totalPlayers: rankings.length,
        })
    }

    rankResults.sort((a, b) => a.rank - b.rank)

    console.log('Leaderboard Ranks:\n')
    console.log('Rank | Challenge Date | Score  | Total Players')
    console.log('-----|----------------|--------|---------------')

    rankResults.forEach(r => {
        const rankStr = r.rank.toString().padStart(4)
        const dateStr = r.challengeDate || 'Unknown'
        const scoreStr = r.userScore.toString().padStart(6)
        const playersStr = r.totalPlayers.toString().padStart(2)
        const medal = r.rank === 1 ? '👑' : r.rank <= 3 ? '🥉' : r.rank <= 10 ? '🏆' : ''

        console.log(`${rankStr} | ${dateStr}     | ${scoreStr} | ${playersStr} players ${medal}`)
    })

    const bestRank = Math.min(...rankResults.map(r => r.rank))
    console.log(`\nBest rank achieved: ${bestRank}`)

    if (bestRank === 1) {
        console.log('✓ Should have Champion achievement')
    } else if (bestRank <= 3) {
        console.log('✓ Should have Podium Finish achievement')
    } else if (bestRank <= 10) {
        console.log('✓ Should have Top 10 achievement')
    }

    await db.destroy()
}

checkLeaderboardRanks()
    .then(() => console.log('\n✓ Check complete'))
    .catch((error) => {
        console.error('Error:', error)
        process.exit(1)
    })
