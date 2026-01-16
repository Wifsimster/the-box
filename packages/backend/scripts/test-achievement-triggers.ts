/**
 * Test Achievement Triggers
 * 
 * This script tests that all achievements can be properly triggered
 * by simulating game completion scenarios.
 */

import { db } from '../src/infrastructure/database/connection.js'
import { achievementService } from '../src/domain/services/achievement.service.js'
import { achievementRepository } from '../src/infrastructure/repositories/achievement.repository.js'
import type { GameCompletionData, GuessData } from '../src/domain/services/achievement.service.js'

interface TestResult {
    category: string
    achievementKey: string
    name: string
    passed: boolean
    error?: string
}

const results: TestResult[] = []

async function testAchievement(
    category: string,
    key: string,
    name: string,
    testData: GameCompletionData
): Promise<void> {
    try {
        // Get the achievement
        const achievements = await achievementRepository.findAll()
        const achievement = achievements.find(a => a.key === key)

        if (!achievement) {
            results.push({ category, achievementKey: key, name, passed: false, error: 'Achievement not found in database' })
            return
        }

        // Check if achievement triggers
        const earned = await achievementService.checkAchievementsAfterGame(testData)
        const triggered = earned.some(e => e.key === key)

        results.push({ category, achievementKey: key, name, passed: triggered })

        if (!triggered) {
            console.log(`⚠️  ${name} (${key}) did not trigger with test data`)
            console.log('   Criteria:', achievement.criteria)
        }
    } catch (error) {
        results.push({
            category,
            achievementKey: key,
            name,
            passed: false,
            error: String(error)
        })
    }
}

async function runTests(): Promise<void> {
    console.log('Starting achievement trigger tests...\n')

    // Get a test user (first user from database)
    const testUser = await db('user').select('id').first()
    if (!testUser) {
        console.error('No users found in database')
        process.exit(1)
    }

    const userId = testUser.id

    // Get a test challenge
    const testChallenge = await db('daily_challenges').select('id').first()
    if (!testChallenge) {
        console.error('No challenges found in database')
        process.exit(1)
    }

    const challengeId = testChallenge.id

    console.log(`Using test user: ${userId}`)
    console.log(`Using test challenge: ${challengeId}\n`)

    // === SPEED CATEGORY ===
    console.log('Testing SPEED category...')

    // Quick Draw - Single guess under 2s
    await testAchievement('speed', 'quick_draw', 'Quick Draw', {
        userId,
        sessionId: 'test-session-1',
        challengeId,
        totalScore: 200,
        guesses: [
            { position: 1, isCorrect: true, roundTimeTakenMs: 1500, powerUpUsed: null, screenshotId: 1 }
        ],
        gameGenres: ['Action'],
        currentStreak: 1,
        longestStreak: 1,
    })

    // Speed Demon - 3 consecutive guesses under 3s
    await testAchievement('speed', 'speed_demon', 'Speed Demon', {
        userId,
        sessionId: 'test-session-2',
        challengeId,
        totalScore: 600,
        guesses: [
            { position: 1, isCorrect: true, roundTimeTakenMs: 2800, powerUpUsed: null, screenshotId: 1 },
            { position: 2, isCorrect: true, roundTimeTakenMs: 2500, powerUpUsed: null, screenshotId: 2 },
            { position: 3, isCorrect: true, roundTimeTakenMs: 2900, powerUpUsed: null, screenshotId: 3 },
        ],
        gameGenres: ['Action'],
        currentStreak: 1,
        longestStreak: 1,
    })

    // === ACCURACY CATEGORY ===
    console.log('Testing ACCURACY category...')

    // No Hints Needed - Complete challenge without hints
    await testAchievement('accuracy', 'no_hints_needed', 'No Hints Needed', {
        userId,
        sessionId: 'test-session-3',
        challengeId,
        totalScore: 1000,
        guesses: Array.from({ length: 10 }, (_, i) => ({
            position: i + 1,
            isCorrect: true,
            roundTimeTakenMs: 5000,
            powerUpUsed: null, // No power-ups used
            screenshotId: i + 1,
        })),
        gameGenres: ['Action'],
        currentStreak: 1,
        longestStreak: 1,
    })

    // Sharp Eye - 10 consecutive correct guesses
    await testAchievement('accuracy', 'sharp_eye', 'Sharp Eye', {
        userId,
        sessionId: 'test-session-4',
        challengeId,
        totalScore: 1000,
        guesses: Array.from({ length: 10 }, (_, i) => ({
            position: i + 1,
            isCorrect: true,
            roundTimeTakenMs: 5000,
            powerUpUsed: null,
            screenshotId: i + 1,
        })),
        gameGenres: ['Action'],
        currentStreak: 1,
        longestStreak: 1,
    })

    // === SCORE CATEGORY ===
    console.log('Testing SCORE category...')

    // Perfect Run - Score exactly 2000 points
    await testAchievement('score', 'perfect_run', 'Perfect Run', {
        userId,
        sessionId: 'test-session-5',
        challengeId,
        totalScore: 2000,
        guesses: Array.from({ length: 10 }, (_, i) => ({
            position: i + 1,
            isCorrect: true,
            roundTimeTakenMs: 2000, // Fast enough for 2x multiplier (2000 total)
            powerUpUsed: null,
            screenshotId: i + 1,
        })),
        gameGenres: ['Action'],
        currentStreak: 1,
        longestStreak: 1,
    })

    // High Roller - Score over 1800 points
    await testAchievement('score', 'high_roller', 'High Roller', {
        userId,
        sessionId: 'test-session-6',
        challengeId,
        totalScore: 1850,
        guesses: Array.from({ length: 10 }, (_, i) => ({
            position: i + 1,
            isCorrect: true,
            roundTimeTakenMs: 3000,
            powerUpUsed: null,
            screenshotId: i + 1,
        })),
        gameGenres: ['Action'],
        currentStreak: 1,
        longestStreak: 1,
    })

    // === STREAK CATEGORY ===
    console.log('Testing STREAK category...')

    // Dedicated Player - 3-day streak
    await testAchievement('streak', 'dedicated_player', 'Dedicated Player', {
        userId,
        sessionId: 'test-session-7',
        challengeId,
        totalScore: 1000,
        guesses: [{ position: 1, isCorrect: true, roundTimeTakenMs: 5000, powerUpUsed: null, screenshotId: 1 }],
        gameGenres: ['Action'],
        currentStreak: 3,
        longestStreak: 3,
    })

    // Weekly Warrior - 7-day streak
    await testAchievement('streak', 'weekly_warrior', 'Weekly Warrior', {
        userId,
        sessionId: 'test-session-8',
        challengeId,
        totalScore: 1000,
        guesses: [{ position: 1, isCorrect: true, roundTimeTakenMs: 5000, powerUpUsed: null, screenshotId: 1 }],
        gameGenres: ['Action'],
        currentStreak: 7,
        longestStreak: 7,
    })

    // Month Master - 30-day streak
    await testAchievement('streak', 'month_master', 'Month Master', {
        userId,
        sessionId: 'test-session-9',
        challengeId,
        totalScore: 1000,
        guesses: [{ position: 1, isCorrect: true, roundTimeTakenMs: 5000, powerUpUsed: null, screenshotId: 1 }],
        gameGenres: ['Action'],
        currentStreak: 30,
        longestStreak: 30,
    })

    // === COMPLETION CATEGORY ===
    console.log('Testing COMPLETION category...')

    // First Win - Complete first daily challenge
    await testAchievement('completion', 'first_win', 'First Win', {
        userId,
        sessionId: 'test-session-10',
        challengeId,
        totalScore: 1000,
        guesses: [{ position: 1, isCorrect: true, roundTimeTakenMs: 5000, powerUpUsed: null, screenshotId: 1 }],
        gameGenres: ['Action'],
        currentStreak: 1,
        longestStreak: 1,
    })

    // === COMPETITIVE CATEGORY ===
    console.log('Testing COMPETITIVE category...')
    console.log('(Competitive achievements require actual leaderboard data)\n')

    // Print results
    console.log('\n=== TEST RESULTS ===\n')

    const categories = ['speed', 'accuracy', 'score', 'streak', 'completion', 'competitive']

    for (const category of categories) {
        const categoryResults = results.filter(r => r.category === category)
        const passed = categoryResults.filter(r => r.passed).length
        const total = categoryResults.length

        console.log(`${category.toUpperCase()}: ${passed}/${total} passed`)

        for (const result of categoryResults) {
            const icon = result.passed ? '✓' : '✗'
            const status = result.passed ? 'PASS' : 'FAIL'
            console.log(`  ${icon} [${status}] ${result.name} (${result.achievementKey})`)
            if (result.error) {
                console.log(`    Error: ${result.error}`)
            }
        }
        console.log()
    }

    // Summary
    const totalPassed = results.filter(r => r.passed).length
    const totalTests = results.length
    const percentage = totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) : '0'

    console.log(`\nOVERALL: ${totalPassed}/${totalTests} tests passed (${percentage}%)`)

    if (totalPassed === totalTests) {
        console.log('\n✓ All achievement triggers are working correctly!')
    } else {
        console.log('\n⚠️  Some achievement triggers may need attention.')
    }
}

// Run tests
runTests()
    .then(() => {
        console.log('\nDone!')
        process.exit(0)
    })
    .catch((error) => {
        console.error('Test failed:', error)
        process.exit(1)
    })
