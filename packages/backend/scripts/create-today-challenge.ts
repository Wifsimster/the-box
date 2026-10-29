import { db } from '../src/infrastructure/database/connection.js'
import { challengeRepository } from '../src/infrastructure/repositories/challenge.repository.js'

async function selectRandomScreenshots(count: number): Promise<number[]> {
    const result = await db('screenshots').count('id as count').first()
    const available = Number(result?.count ?? 0)

    if (available === 0) {
        throw new Error('No screenshots available in database')
    }

    console.log(`Found ${available} screenshots, need ${count}`)

    if (available >= count) {
        const rows = await db('screenshots')
            .orderByRaw('RANDOM()')
            .limit(count)
            .pluck<number[]>('id')
        return rows
    }

    console.warn('Not enough unique screenshots, allowing reuse')
    const allIds = await db('screenshots').pluck<number[]>('id')
    const selected: number[] = []
    while (selected.length < count) {
        const shuffled = [...allIds].sort(() => Math.random() - 0.5)
        const needed = count - selected.length
        selected.push(...shuffled.slice(0, needed))
    }
    return selected.slice(0, count)
}

async function createTodayChallenge() {
    const challengeDate = new Date().toISOString().split('T')[0]!
    console.log(`Creating challenge for ${challengeDate}`)

    const existing = await challengeRepository.findByDate(challengeDate)
    if (existing) {
        console.log(`Challenge already exists for ${challengeDate} (ID: ${existing.id})`)
        return
    }

    const screenshotIds = await selectRandomScreenshots(10)
    console.log(`Selected ${screenshotIds.length} screenshots`)

    const challenge = await challengeRepository.create(challengeDate)
    console.log(`Created challenge ID: ${challenge.id}`)

    const tier = await challengeRepository.createTier({
        dailyChallengeId: challenge.id,
        tierNumber: 1,
        name: 'Daily Challenge',
        timeLimitSeconds: 45,
    })
    console.log(`Created tier ID: ${tier.id}`)

    await challengeRepository.createTierScreenshots(tier.id, screenshotIds)
    console.log(`Assigned ${screenshotIds.length} screenshots to tier`)

    console.log('✓ Today\'s challenge created successfully!')
}

createTodayChallenge()
    .then(() => {
        console.log('Done!')
        process.exit(0)
    })
    .catch((error) => {
        console.error('Error:', error)
        process.exit(1)
    })
