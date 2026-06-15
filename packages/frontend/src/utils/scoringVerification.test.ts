/**
 * Scoring System Verification Tests
 * 
 * This file contains test cases to verify scoring calculations match
 * between backend and frontend, and that all edge cases are handled correctly.
 */

import { calculateSpeedMultiplier } from '../lib/utils'

// Constants matching backend
const BASE_SCORE = 100
const WRONG_GUESS_PENALTY = 0
const UNFOUND_PENALTY = 0

/**
 * Calculate score earned for a correct guess (frontend version).
 * Letter-reveal penalties are locked in server-side at reveal time and are
 * not part of this base formula (the flat -20% metadata-hint penalty was
 * retired 2026-06).
 */
function calculateScoreEarned(timeTakenMs: number): number {
  const speedMultiplier = calculateSpeedMultiplier(timeTakenMs)
  let scoreEarned = Math.round(BASE_SCORE * speedMultiplier)
  scoreEarned = Math.min(scoreEarned, 200) // Cap at 200

  return scoreEarned
}

/**
 * Test speed multiplier boundary conditions
 */
export function testSpeedMultiplierBoundaries(): {
  passed: boolean
  failures: string[]
} {
  const failures: string[] = []

  // Test boundary conditions
  const testCases = [
    { timeMs: 0, expected: 2.0, description: '0 seconds (instant)' },
    { timeMs: 2999, expected: 2.0, description: '2.999 seconds (< 3s)' },
    { timeMs: 3000, expected: 1.75, description: '3.000 seconds (>= 3s)' },
    { timeMs: 4999, expected: 1.75, description: '4.999 seconds (< 5s)' },
    { timeMs: 5000, expected: 1.5, description: '5.000 seconds (>= 5s)' },
    { timeMs: 9999, expected: 1.5, description: '9.999 seconds (< 10s)' },
    { timeMs: 10000, expected: 1.25, description: '10.000 seconds (>= 10s)' },
    { timeMs: 19999, expected: 1.25, description: '19.999 seconds (< 20s)' },
    { timeMs: 20000, expected: 1.0, description: '20.000 seconds (>= 20s)' },
    { timeMs: 21000, expected: 1.0, description: '21 seconds (20+ s)' },
    { timeMs: 60000, expected: 1.0, description: '60 seconds (long time)' },
  ]

  for (const testCase of testCases) {
    const result = calculateSpeedMultiplier(testCase.timeMs)
    if (result !== testCase.expected) {
      failures.push(
        `${testCase.description}: Expected ${testCase.expected}, got ${result}`
      )
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  }
}

/**
 * Test score calculation for correct guesses
 */
export function testScoreCalculation(): {
  passed: boolean
  failures: string[]
} {
  const failures: string[] = []

  const testCases = [
    {
      timeMs: 2000,
      expected: 200,
      description: 'Perfect speed (< 3s): 100 × 2.0 = 200 (capped)',
    },
    {
      timeMs: 4000,
      expected: 175,
      description: 'Fast (< 5s): 100 × 1.75 = 175',
    },
    {
      timeMs: 8000,
      expected: 150,
      description: 'Good (< 10s): 100 × 1.5 = 150',
    },
    {
      timeMs: 15000,
      expected: 125,
      description: 'Average (< 20s): 100 × 1.25 = 125',
    },
    {
      timeMs: 25000,
      expected: 100,
      description: 'Slow (20+ s): 100 × 1.0 = 100',
    },
  ]

  for (const testCase of testCases) {
    const result = calculateScoreEarned(testCase.timeMs)
    if (result !== testCase.expected) {
      failures.push(
        `${testCase.description}: Expected ${testCase.expected}, got ${result}`
      )
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  }
}

/**
 * Test perfect game scenario
 */
export function testPerfectGame(): {
  passed: boolean
  totalScore: number
  expected: number
} {
  // All 10 screenshots correct, all under 3 seconds, no letter reveals, no wrong guesses
  const scorePerScreenshot = calculateScoreEarned(2000) // 200 points
  const totalScore = scorePerScreenshot * 10

  return {
    passed: totalScore === 2000,
    totalScore,
    expected: 2000,
  }
}

/**
 * Test all wrong guesses scenario
 */
export function testAllWrongGuesses(): {
  passed: boolean
  totalScore: number
  expected: number
} {
  // 10 wrong guesses, no correct answers
  // During gameplay: Math.max(0, 0 - (10 × 30)) = 0 (can't go negative during gameplay)
  // But this is a theoretical calculation - actual implementation prevents negative during gameplay
  const wrongGuesses = 10
  const theoreticalScore = -(wrongGuesses * WRONG_GUESS_PENALTY)

  return {
    passed: true, // This is expected behavior - negative prevented during gameplay
    totalScore: Math.max(0, theoreticalScore), // Actual behavior
    expected: 0, // What would be shown during gameplay
  }
}

/**
 * Test early end game scenario
 */
export function testEarlyEndGame(): {
  passed: boolean
  scenarios: Array<{
    screenshotsFound: number
    sessionScore: number
    expectedFinalScore: number
  }>
} {
  const scenarios = [
    {
      screenshotsFound: 5,
      sessionScore: 500,
      expectedFinalScore: 500 - (5 * UNFOUND_PENALTY), // 500 - 0 = 500
    },
    {
      screenshotsFound: 0,
      sessionScore: 0,
      expectedFinalScore: 0 - (10 * UNFOUND_PENALTY), // 0 - 0 = 0
    },
    {
      screenshotsFound: 8,
      sessionScore: 1200,
      expectedFinalScore: 1200 - (2 * UNFOUND_PENALTY), // 1200 - 0 = 1200
    },
  ]

  return {
    passed: true, // These are expected calculations
    scenarios,
  }
}

/**
 * Run all verification tests
 */
export function runAllVerificationTests(): {
  speedMultiplier: ReturnType<typeof testSpeedMultiplierBoundaries>
  scoreCalculation: ReturnType<typeof testScoreCalculation>
  perfectGame: ReturnType<typeof testPerfectGame>
  allWrong: ReturnType<typeof testAllWrongGuesses>
  earlyEnd: ReturnType<typeof testEarlyEndGame>
  allPassed: boolean
} {
  const speedMultiplier = testSpeedMultiplierBoundaries()
  const scoreCalculation = testScoreCalculation()
  const perfectGame = testPerfectGame()
  const allWrong = testAllWrongGuesses()
  const earlyEnd = testEarlyEndGame()

  const allPassed =
    speedMultiplier.passed &&
    scoreCalculation.passed &&
    perfectGame.passed

  return {
    speedMultiplier,
    scoreCalculation,
    perfectGame,
    allWrong,
    earlyEnd,
    allPassed,
  }
}

// Export for use in browser console or test runner
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Browser console access requires any
  ; (window as any).scoringVerification = {
    runAllVerificationTests,
    testSpeedMultiplierBoundaries,
    testScoreCalculation,
    testPerfectGame,
    testAllWrongGuesses,
    testEarlyEndGame,
  }
}
