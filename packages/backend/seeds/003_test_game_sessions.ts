import type { Knex } from 'knex'
import { randomBytes } from 'crypto'

const TOTAL_SCREENSHOTS = 10
const BASE_SCORE = 100
const WRONG_GUESS_PENALTY = 30

/**
 * Calculate speed multiplier based on time taken (same as game service)
 */
function calculateSpeedMultiplier(timeTakenMs: number): number {
  const timeTakenSeconds = timeTakenMs / 1000
  if (timeTakenSeconds < 3) return 2.0
  if (timeTakenSeconds < 5) return 1.75
  if (timeTakenSeconds < 10) return 1.5
  if (timeTakenSeconds < 20) return 1.25
  return 1.0
}

/**
 * Calculate score for a correct guess
 */
function calculateScore(timeTakenMs: number): number {
  const speedMultiplier = calculateSpeedMultiplier(timeTakenMs)
  const score = Math.round(BASE_SCORE * speedMultiplier)
  return Math.min(score, 200) // Cap at 200
}

export async function seed(knex: Knex): Promise<void> {
  // Get test users
  const testUsers = await knex('user')
    .whereIn('email', [
      'testuser1@test.local',
      'testuser2@test.local',
      'testuser3@test.local',
      'testuser4@test.local',
      'testuser5@test.local',
      'testadmin@test.local',
    ])
    .select('id', 'email', 'username')

  if (testUsers.length === 0) {
    console.warn('No test users found. Please run 001_test_users.ts seed first.')
    return
  }

  // Get daily challenges (all available, up to 17 days for admin history)
  const challenges = await knex('daily_challenges')
    .orderBy('challenge_date', 'desc')
    .limit(17)
    .select('id', 'challenge_date')

  if (challenges.length === 0) {
    console.warn('No daily challenges found. Please run 002_test_daily_challenges.ts seed first.')
    return
  }

  console.log(`Found ${testUsers.length} test users and ${challenges.length} challenges`)

  // Get tiers for each challenge
  const challengeTiers = new Map<number, number>()
  for (const challenge of challenges) {
    const tiers = await knex('tiers')
      .where('daily_challenge_id', challenge.id)
      .orderBy('tier_number', 'asc')
      .select('id')
    if (tiers.length > 0) {
      challengeTiers.set(challenge.id, tiers[0]!.id)
    }
  }

  // Define user playing patterns
  // Each user has a pattern: which challenges they play and their performance profile
  type UserPattern = {
    userEmail: string
    challengeIndices: number[] // Which challenges (by index, 0 = today, 6 = 6 days ago) they play
    performance: 'high' | 'medium' | 'low'
    playAllDays: boolean // If true, plays all challenges
  }

  const userPatterns: UserPattern[] = [
    {
      userEmail: 'testuser1@test.local',
      challengeIndices: [0, 1, 2, 3, 4, 5, 6], // Plays all 7 days
      performance: 'high',
      playAllDays: true,
    },
    {
      userEmail: 'testuser2@test.local',
      challengeIndices: [0, 1, 2, 3, 4, 5], // Plays 6 days, misses day 6
      performance: 'medium',
      playAllDays: false,
    },
    {
      userEmail: 'testuser3@test.local',
      challengeIndices: [0, 1, 2, 3, 4], // Plays 5 days, misses days 5-6
      performance: 'low',
      playAllDays: false,
    },
    {
      userEmail: 'testuser4@test.local',
      challengeIndices: [0, 1, 2], // New player, only last 3 days
      performance: 'medium',
      playAllDays: false,
    },
    {
      userEmail: 'testuser5@test.local',
      challengeIndices: [0, 1, 2, 3, 4, 5, 6], // Plays all 7 days
      performance: 'medium',
      playAllDays: true,
    },
    {
      userEmail: 'testadmin@test.local',
      challengeIndices: [0, 1, 2, 3, 4, 5, 6], // Plays all 7 days
      performance: 'high',
      playAllDays: true,
    },
  ]

  // Generate session scenarios based on user patterns
  const sessionScenarios: Array<{
    userEmail: string
    challengeDate: string
    completed: boolean
    correctGuesses: number
    wrongGuesses: number
    avgTimeMs: number
  }> = []

  for (const pattern of userPatterns) {
    for (const challengeIndex of pattern.challengeIndices) {
      if (challengeIndex >= challenges.length) continue

      const challenge = challenges[challengeIndex]
      if (!challenge) continue

      // Determine performance metrics based on user pattern
      let correctGuesses: number
      let wrongGuesses: number
      let avgTimeMs: number
      let completed: boolean

      // Add some variation - not all sessions are completed
      const isInProgress = Math.random() < 0.15 // 15% chance of in-progress

      if (pattern.performance === 'high') {
        correctGuesses = isInProgress
          ? Math.floor(Math.random() * 3) + 6 // 6-8 if in progress
          : Math.floor(Math.random() * 3) + 8 // 8-10 if completed
        wrongGuesses = isInProgress ? Math.floor(Math.random() * 2) : Math.floor(Math.random() * 2)
        avgTimeMs = Math.floor(Math.random() * 2000) + 1500 // 1500-3500ms (fast)
        completed = !isInProgress
      } else if (pattern.performance === 'medium') {
        correctGuesses = isInProgress
          ? Math.floor(Math.random() * 3) + 4 // 4-6 if in progress
          : Math.floor(Math.random() * 3) + 6 // 6-8 if completed
        wrongGuesses = isInProgress
          ? Math.floor(Math.random() * 3) + 2
          : Math.floor(Math.random() * 4) + 2 // 2-5 wrong
        avgTimeMs = Math.floor(Math.random() * 6000) + 5000 // 5000-11000ms (medium)
        completed = !isInProgress
      } else {
        // low performance
        correctGuesses = isInProgress
          ? Math.floor(Math.random() * 3) + 2 // 2-4 if in progress
          : Math.floor(Math.random() * 3) + 4 // 4-6 if completed
        wrongGuesses = isInProgress
          ? Math.floor(Math.random() * 4) + 3
          : Math.floor(Math.random() * 6) + 4 // 4-9 wrong
        avgTimeMs = Math.floor(Math.random() * 8000) + 12000 // 12000-20000ms (slow)
        completed = !isInProgress
      }

      // Ensure challenge_date is a string in YYYY-MM-DD format
      const challengeDateStr =
        typeof challenge.challenge_date === 'string'
          ? challenge.challenge_date
          : challenge.challenge_date instanceof Date
            ? challenge.challenge_date.toISOString().split('T')[0]!
            : String(challenge.challenge_date)

      sessionScenarios.push({
        userEmail: pattern.userEmail,
        challengeDate: challengeDateStr,
        completed,
        correctGuesses,
        wrongGuesses,
        avgTimeMs,
      })
    }
  }

  for (const scenario of sessionScenarios) {
    const user = testUsers.find((u) => u.email === scenario.userEmail)
    if (!user) {
      console.warn(`User ${scenario.userEmail} not found, skipping scenario`)
      continue
    }

    // Normalize challenge dates for comparison (handle both Date objects and strings)
    const normalizeDate = (date: string | Date): string => {
      if (typeof date === 'string') return date
      if (date instanceof Date) return date.toISOString().split('T')[0]!
      return String(date)
    }

    const scenarioDateStr = normalizeDate(scenario.challengeDate)
    const challenge = challenges.find((c) => {
      const challengeDateStr = normalizeDate(c.challenge_date)
      return challengeDateStr === scenarioDateStr
    })

    if (!challenge) {
      console.warn(`Challenge for ${scenarioDateStr} not found, skipping scenario`)
      continue
    }

    const tierId = challengeTiers.get(challenge.id)
    if (!tierId) {
      console.warn(`Tier for challenge ${challenge.id} not found, skipping scenario`)
      continue
    }

    // Check if session already exists
    const existingSession = await knex('game_sessions')
      .where('user_id', user.id)
      .where('daily_challenge_id', challenge.id)
      .first()

    if (existingSession) {
      console.log(
        `Game session already exists for ${scenario.userEmail} on ${scenario.challengeDate}, skipping`
      )
      continue
    }

    // Get tier screenshots
    const tierScreenshots = await knex('tier_screenshots')
      .where('tier_id', tierId)
      .orderBy('position', 'asc')
      .select('screenshot_id', 'position')

    if (tierScreenshots.length === 0) {
      console.warn(`No screenshots found for tier ${tierId}, skipping scenario`)
      continue
    }

    // Get screenshot game IDs for correct guesses
    const screenshotGameIds = await knex('screenshots')
      .whereIn(
        'id',
        tierScreenshots.map((ts) => ts.screenshot_id)
      )
      .select('id', 'game_id')

    const screenshotToGameId = new Map(
      screenshotGameIds.map((s) => [s.id, s.game_id])
    )

    // Create game session with realistic timestamps based on challenge date
    const gameSessionId = randomBytes(16).toString('hex')
    // Start time should be on the challenge date, with some variation (morning to evening)
    // challengeDate is in format "YYYY-MM-DD", parse it properly
    const challengeDateStr = String(scenario.challengeDate)
    const [year, month, day] = challengeDateStr.split('-').map(Number)
    const challengeDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)) // Noon UTC
    const hourOffset = Math.floor(Math.random() * 12) - 6 // -6 to +6 hours from noon
    const startedAt = new Date(challengeDate.getTime() + hourOffset * 60 * 60 * 1000)
    const completedAt = scenario.completed
      ? new Date(startedAt.getTime() + Math.floor(Math.random() * 10 + 3) * 60 * 1000) // 3-13 minutes later
      : null

    let totalScore = 0
    const guesses: Array<{
      screenshotId: number
      position: number
      guessedGameId: number | null
      guessedText: string
      isCorrect: boolean
      timeTakenMs: number
      scoreEarned: number
    }> = []

    // Generate guesses
    let correctCount = 0
    let wrongCount = 0
    let currentPosition = 1

    for (let i = 0; i < tierScreenshots.length; i++) {
      const tierScreenshot = tierScreenshots[i]!
      const screenshotId = tierScreenshot.screenshot_id
      const position = tierScreenshot.position

      // Determine if this should be a correct guess
      const shouldBeCorrect = correctCount < scenario.correctGuesses

      if (shouldBeCorrect) {
        // Correct guess
        const gameId = screenshotToGameId.get(screenshotId)
        const timeTakenMs = scenario.avgTimeMs + Math.floor(Math.random() * 2000 - 1000)
        const scoreEarned = calculateScore(timeTakenMs)
        totalScore += scoreEarned

        guesses.push({
          screenshotId,
          position,
          guessedGameId: gameId ?? null,
          guessedText: 'Correct Game Name',
          isCorrect: true,
          timeTakenMs,
          scoreEarned,
        })

        correctCount++
        currentPosition = position + 1
      } else if (wrongCount < scenario.wrongGuesses && !scenario.completed) {
        // Wrong guess (only if not completed or we need more wrong guesses)
        const timeTakenMs = scenario.avgTimeMs + Math.floor(Math.random() * 3000)
        const scoreEarned = 0
        totalScore = Math.max(0, totalScore - WRONG_GUESS_PENALTY)

        guesses.push({
          screenshotId,
          position,
          guessedGameId: null,
          guessedText: 'Wrong Guess',
          isCorrect: false,
          timeTakenMs,
          scoreEarned,
        })

        wrongCount++
        // Don't advance position on wrong guess
      }

      // Stop if we've reached the required counts and it's not completed
      if (!scenario.completed && correctCount >= scenario.correctGuesses && wrongCount >= scenario.wrongGuesses) {
        break
      }
    }

    // Insert game session
    await knex('game_sessions').insert({
      id: gameSessionId,
      user_id: user.id,
      daily_challenge_id: challenge.id,
      current_tier: 1,
      current_position: scenario.completed ? TOTAL_SCREENSHOTS + 1 : currentPosition,
      total_score: totalScore,
      is_completed: scenario.completed,
      started_at: startedAt,
      completed_at: completedAt,
    })

    // Create tier session
    const tierSessionId = randomBytes(16).toString('hex')
    await knex('tier_sessions').insert({
      id: tierSessionId,
      game_session_id: gameSessionId,
      tier_id: tierId,
      score: totalScore,
      correct_answers: correctCount,
      wrong_guesses: wrongCount,
      is_completed: scenario.completed,
      started_at: startedAt,
      completed_at: completedAt,
    })

    // Insert guesses
    let sessionElapsedMs = 0
    for (const guess of guesses) {
      sessionElapsedMs += guess.timeTakenMs
      await knex('guesses').insert({
        tier_session_id: tierSessionId,
        screenshot_id: guess.screenshotId,
        position: guess.position,
        guessed_game_id: guess.guessedGameId,
        guessed_text: guess.guessedText,
        is_correct: guess.isCorrect,
        time_taken_ms: guess.timeTakenMs,
        session_elapsed_ms: sessionElapsedMs,
        score_earned: guess.scoreEarned,
      })
    }

    // Update user total_score and last_played_at if completed
    if (scenario.completed) {
      const currentUserScore = await knex('user')
        .where('id', user.id)
        .select('total_score')
        .first<{ total_score: number }>()

      const newTotalScore = (currentUserScore?.total_score ?? 0) + totalScore

      await knex('user')
        .where('id', user.id)
        .update({
          total_score: newTotalScore,
          last_played_at: completedAt,
        })
    }

    console.log(
      `Created game session for ${scenario.userEmail} on ${scenario.challengeDate}: ` +
        `${correctCount} correct, ${wrongCount} wrong, score: ${totalScore}, completed: ${scenario.completed}`
    )
  }

  // Add 10 additional history entries specifically for admin user
  const adminUser = testUsers.find((u) => u.email === 'testadmin@test.local')
  if (adminUser) {
    console.log('Creating 10 additional history entries for admin user...')
    
    // Get challenges from 7-16 days ago (beyond the initial 7 days)
    const olderChallenges = await knex('daily_challenges')
      .orderBy('challenge_date', 'desc')
      .offset(7) // Skip the first 7 (today through 6 days ago)
      .limit(10) // Get next 10 challenges
      .select('id', 'challenge_date')

    if (olderChallenges.length > 0) {
      for (const challenge of olderChallenges) {
        // Check if session already exists
        const existingSession = await knex('game_sessions')
          .where('user_id', adminUser.id)
          .where('daily_challenge_id', challenge.id)
          .first()

        if (existingSession) {
          console.log(
            `Game session already exists for testadmin@test.local on ${challenge.challenge_date}, skipping`
          )
          continue
        }

        // Get tier for this challenge
        const tiers = await knex('tiers')
          .where('daily_challenge_id', challenge.id)
          .orderBy('tier_number', 'asc')
          .select('id')
          .first()

        if (!tiers) {
          console.warn(`No tier found for challenge ${challenge.id}, skipping`)
          continue
        }

        const tierId = tiers.id

        // Get tier screenshots
        const tierScreenshots = await knex('tier_screenshots')
          .where('tier_id', tierId)
          .orderBy('position', 'asc')
          .select('screenshot_id', 'position')

        if (tierScreenshots.length === 0) {
          console.warn(`No screenshots found for tier ${tierId}, skipping`)
          continue
        }

        // Get screenshot game IDs
        const screenshotGameIds = await knex('screenshots')
          .whereIn(
            'id',
            tierScreenshots.map((ts) => ts.screenshot_id)
          )
          .select('id', 'game_id')

        const screenshotToGameId = new Map(
          screenshotGameIds.map((s) => [s.id, s.game_id])
        )

        // Generate admin performance (high performance, mostly completed)
        const isInProgress = Math.random() < 0.1 // 10% chance of in-progress
        const correctGuesses = isInProgress
          ? Math.floor(Math.random() * 3) + 7 // 7-9 if in progress
          : Math.floor(Math.random() * 3) + 8 // 8-10 if completed
        const wrongGuesses = isInProgress ? Math.floor(Math.random() * 2) : Math.floor(Math.random() * 2)
        const avgTimeMs = Math.floor(Math.random() * 2000) + 1500 // 1500-3500ms (fast)
        const completed = !isInProgress

        // Create game session with realistic timestamps
        const gameSessionId = randomBytes(16).toString('hex')
        const challengeDateStr =
          typeof challenge.challenge_date === 'string'
            ? challenge.challenge_date
            : challenge.challenge_date instanceof Date
              ? challenge.challenge_date.toISOString().split('T')[0]!
              : String(challenge.challenge_date)
        const [year, month, day] = challengeDateStr.split('-').map(Number)
        const challengeDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
        const hourOffset = Math.floor(Math.random() * 12) - 6
        const startedAt = new Date(challengeDate.getTime() + hourOffset * 60 * 60 * 1000)
        const completedAt = completed
          ? new Date(startedAt.getTime() + Math.floor(Math.random() * 10 + 3) * 60 * 1000)
          : null

        let totalScore = 0
        const guesses: Array<{
          screenshotId: number
          position: number
          guessedGameId: number | null
          guessedText: string
          isCorrect: boolean
          timeTakenMs: number
          scoreEarned: number
        }> = []

        // Generate guesses
        let correctCount = 0
        let wrongCount = 0
        let currentPosition = 1

        for (let i = 0; i < tierScreenshots.length; i++) {
          const tierScreenshot = tierScreenshots[i]!
          const screenshotId = tierScreenshot.screenshot_id
          const position = tierScreenshot.position

          if (correctCount < correctGuesses) {
            // Correct guess
            const gameId = screenshotToGameId.get(screenshotId)
            const timeTakenMs = avgTimeMs + Math.floor(Math.random() * 2000 - 1000)
            const scoreEarned = calculateScore(timeTakenMs)
            totalScore += scoreEarned

            guesses.push({
              screenshotId,
              position,
              guessedGameId: gameId ?? null,
              guessedText: 'Correct Game Name',
              isCorrect: true,
              timeTakenMs,
              scoreEarned,
            })

            correctCount++
            currentPosition = position + 1
          } else if (wrongCount < wrongGuesses && !completed) {
            // Wrong guess
            const timeTakenMs = avgTimeMs + Math.floor(Math.random() * 3000)
            const scoreEarned = 0
            totalScore = Math.max(0, totalScore - WRONG_GUESS_PENALTY)

            guesses.push({
              screenshotId,
              position,
              guessedGameId: null,
              guessedText: 'Wrong Guess',
              isCorrect: false,
              timeTakenMs,
              scoreEarned,
            })

            wrongCount++
          }

          if (!completed && correctCount >= correctGuesses && wrongCount >= wrongGuesses) {
            break
          }
        }

        // Insert game session
        await knex('game_sessions').insert({
          id: gameSessionId,
          user_id: adminUser.id,
          daily_challenge_id: challenge.id,
          current_tier: 1,
          current_position: completed ? TOTAL_SCREENSHOTS + 1 : currentPosition,
          total_score: totalScore,
          is_completed: completed,
          started_at: startedAt,
          completed_at: completedAt,
        })

        // Create tier session
        const tierSessionId = randomBytes(16).toString('hex')
        await knex('tier_sessions').insert({
          id: tierSessionId,
          game_session_id: gameSessionId,
          tier_id: tierId,
          score: totalScore,
          correct_answers: correctCount,
          wrong_guesses: wrongCount,
          is_completed: completed,
          started_at: startedAt,
          completed_at: completedAt,
        })

        // Insert guesses
        let sessionElapsedMs = 0
        for (const guess of guesses) {
          sessionElapsedMs += guess.timeTakenMs
          await knex('guesses').insert({
            tier_session_id: tierSessionId,
            screenshot_id: guess.screenshotId,
            position: guess.position,
            guessed_game_id: guess.guessedGameId,
            guessed_text: guess.guessedText,
            is_correct: guess.isCorrect,
            time_taken_ms: guess.timeTakenMs,
            session_elapsed_ms: sessionElapsedMs,
            score_earned: guess.scoreEarned,
          })
        }

        // Update user total_score and last_played_at if completed
        if (completed) {
          const currentUserScore = await knex('user')
            .where('id', adminUser.id)
            .select('total_score')
            .first<{ total_score: number }>()

          const newTotalScore = (currentUserScore?.total_score ?? 0) + totalScore

          await knex('user')
            .where('id', adminUser.id)
            .update({
              total_score: newTotalScore,
              last_played_at: completedAt,
            })
        }

        console.log(
          `Created additional admin history for ${challengeDateStr}: ` +
            `${correctCount} correct, ${wrongCount} wrong, score: ${totalScore}, completed: ${completed}`
        )
      }
    } else {
      console.warn('No older challenges found for additional admin history')
    }
  }

  console.log('✓ Game sessions seed completed')
}
