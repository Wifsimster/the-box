import type { Knex } from 'knex'
import { randomBytes } from 'crypto'

const TOTAL_SCREENSHOTS = 10
const BASE_SCORE = 100
const WRONG_GUESS_PENALTY = 30

function calculateSpeedMultiplier(timeTakenMs: number): number {
  const timeTakenSeconds = timeTakenMs / 1000
  if (timeTakenSeconds < 3) return 2.0
  if (timeTakenSeconds < 5) return 1.75
  if (timeTakenSeconds < 10) return 1.5
  if (timeTakenSeconds < 20) return 1.25
  return 1.0
}

function calculateScore(timeTakenMs: number): number {
  const speedMultiplier = calculateSpeedMultiplier(timeTakenMs)
  const score = Math.round(BASE_SCORE * speedMultiplier)
  return Math.min(score, 200)
}

export async function seed(knex: Knex): Promise<void> {
  const testUsers = await knex('user')
    .whereIn('email', [
      'testuser1@test.local',
      'testuser2@test.local',
      'testuser3@test.local',
      'testuser4@test.local',
      'testuser5@test.local',
      'testadmin@test.local',
      'admin@thebox.local',
    ])
    .select('id', 'email', 'username')

  if (testUsers.length === 0) {
    console.warn('No test users found. Please run 001_test_users.ts seed first.')
    return
  }

  const challenges = await knex('daily_challenges')
    .orderBy('challenge_date', 'desc')
    .limit(17)
    .select('id', 'challenge_date')

  if (challenges.length === 0) {
    console.warn('No daily challenges found. Please run 002_test_daily_challenges.ts seed first.')
    return
  }

  console.log(`Found ${testUsers.length} test users and ${challenges.length} challenges`)

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

  type UserPattern = {
    userEmail: string
    challengeIndices: number[]
    performance: 'high' | 'medium' | 'low'
    playAllDays: boolean
  }

  const userPatterns: UserPattern[] = [
    {
      userEmail: 'testuser1@test.local',
      challengeIndices: [0, 1, 2, 3, 4, 5, 6],
      performance: 'high',
      playAllDays: true,
    },
    {
      userEmail: 'testuser2@test.local',
      challengeIndices: [0, 1, 2, 3, 4, 5],
      performance: 'medium',
      playAllDays: false,
    },
    {
      userEmail: 'testuser3@test.local',
      challengeIndices: [0, 1, 2, 3, 4],
      performance: 'low',
      playAllDays: false,
    },
    {
      userEmail: 'testuser4@test.local',
      challengeIndices: [0, 1, 2],
      performance: 'medium',
      playAllDays: false,
    },
    {
      userEmail: 'testuser5@test.local',
      challengeIndices: [0, 1, 2, 3, 4, 5, 6],
      performance: 'medium',
      playAllDays: true,
    },
    {
      userEmail: 'testadmin@test.local',
      challengeIndices: [0, 1, 2, 3, 4, 5, 6],
      performance: 'high',
      playAllDays: true,
    },
    {
      userEmail: 'admin@thebox.local',
      challengeIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
      performance: 'high',
      playAllDays: true,
    },
  ]

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

      let correctGuesses: number
      let wrongGuesses: number
      let avgTimeMs: number
      let completed: boolean

      const isInProgress = Math.random() < 0.15

      if (pattern.performance === 'high') {
        correctGuesses = isInProgress
          ? Math.floor(Math.random() * 3) + 6
          : Math.floor(Math.random() * 3) + 8
        wrongGuesses = isInProgress ? Math.floor(Math.random() * 2) : Math.floor(Math.random() * 2)
        avgTimeMs = Math.floor(Math.random() * 2000) + 1500
        completed = !isInProgress
      } else if (pattern.performance === 'medium') {
        correctGuesses = isInProgress
          ? Math.floor(Math.random() * 3) + 4
          : Math.floor(Math.random() * 3) + 6
        wrongGuesses = isInProgress
          ? Math.floor(Math.random() * 3) + 2
          : Math.floor(Math.random() * 4) + 2
        avgTimeMs = Math.floor(Math.random() * 6000) + 5000
        completed = !isInProgress
      } else {
        correctGuesses = isInProgress
          ? Math.floor(Math.random() * 3) + 2
          : Math.floor(Math.random() * 3) + 4
        wrongGuesses = isInProgress
          ? Math.floor(Math.random() * 4) + 3
          : Math.floor(Math.random() * 6) + 4
        avgTimeMs = Math.floor(Math.random() * 8000) + 12000
        completed = !isInProgress
      }

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

    const tierScreenshots = await knex('tier_screenshots')
      .where('tier_id', tierId)
      .orderBy('position', 'asc')
      .select('screenshot_id', 'position')

    if (tierScreenshots.length === 0) {
      console.warn(`No screenshots found for tier ${tierId}, skipping scenario`)
      continue
    }

    const screenshotGameIds = await knex('screenshots')
      .whereIn(
        'id',
        tierScreenshots.map((ts) => ts.screenshot_id)
      )
      .select('id', 'game_id')

    const screenshotToGameId = new Map(
      screenshotGameIds.map((s) => [s.id, s.game_id])
    )

    const gameSessionId = randomBytes(16).toString('hex')
    const challengeDateStr = String(scenario.challengeDate)
    const [year, month, day] = challengeDateStr.split('-').map(Number)
    const challengeDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
    const hourOffset = Math.floor(Math.random() * 12) - 6
    const startedAt = new Date(challengeDate.getTime() + hourOffset * 60 * 60 * 1000)
    const completedAt = scenario.completed
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

    let correctCount = 0
    let wrongCount = 0
    let currentPosition = 1

    for (let i = 0; i < tierScreenshots.length; i++) {
      const tierScreenshot = tierScreenshots[i]!
      const screenshotId = tierScreenshot.screenshot_id
      const position = tierScreenshot.position

      const shouldBeCorrect = correctCount < scenario.correctGuesses

      if (shouldBeCorrect) {
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
      }

      if (!scenario.completed && correctCount >= scenario.correctGuesses && wrongCount >= scenario.wrongGuesses) {
        break
      }
    }

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

  const adminUsers = testUsers.filter((u) => 
    u.email === 'testadmin@test.local' || u.email === 'admin@thebox.local'
  )
  
  for (const adminUser of adminUsers) {
    console.log(`Creating additional history entries for ${adminUser.email}...`)
    
    const olderChallenges = await knex('daily_challenges')
      .orderBy('challenge_date', 'desc')
      .offset(7)
      .limit(10)
      .select('id', 'challenge_date')

    if (olderChallenges.length > 0) {
      for (const challenge of olderChallenges) {
        const existingSession = await knex('game_sessions')
          .where('user_id', adminUser.id)
          .where('daily_challenge_id', challenge.id)
          .first()

        if (existingSession) {
          console.log(
            `Game session already exists for ${adminUser.email} on ${challenge.challenge_date}, skipping`
          )
          continue
        }

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

        const tierScreenshots = await knex('tier_screenshots')
          .where('tier_id', tierId)
          .orderBy('position', 'asc')
          .select('screenshot_id', 'position')

        if (tierScreenshots.length === 0) {
          console.warn(`No screenshots found for tier ${tierId}, skipping`)
          continue
        }

        const screenshotGameIds = await knex('screenshots')
          .whereIn(
            'id',
            tierScreenshots.map((ts) => ts.screenshot_id)
          )
          .select('id', 'game_id')

        const screenshotToGameId = new Map(
          screenshotGameIds.map((s) => [s.id, s.game_id])
        )

        const isInProgress = Math.random() < 0.1
        const correctGuesses = isInProgress
          ? Math.floor(Math.random() * 3) + 7
          : Math.floor(Math.random() * 3) + 8
        const wrongGuesses = isInProgress ? Math.floor(Math.random() * 2) : Math.floor(Math.random() * 2)
        const avgTimeMs = Math.floor(Math.random() * 2000) + 1500
        const completed = !isInProgress

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

        let correctCount = 0
        let wrongCount = 0
        let currentPosition = 1

        for (let i = 0; i < tierScreenshots.length; i++) {
          const tierScreenshot = tierScreenshots[i]!
          const screenshotId = tierScreenshot.screenshot_id
          const position = tierScreenshot.position

          if (correctCount < correctGuesses) {
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
          `Created additional admin history for ${adminUser.email} on ${challengeDateStr}: ` +
            `${correctCount} correct, ${wrongCount} wrong, score: ${totalScore}, completed: ${completed}`
        )
      }
    } else {
      console.warn(`No older challenges found for additional admin history for ${adminUser.email}`)
    }
  }

  const mainAdminUser = testUsers.find((u) => u.email === 'admin@thebox.local')
  if (mainAdminUser) {
    const allAdminSessions = await knex('game_sessions')
      .where('user_id', mainAdminUser.id)
      .where('is_completed', true)
      .select('total_score', 'completed_at')
      .orderBy('completed_at', 'asc')

    if (allAdminSessions.length > 0) {
      const totalScore = allAdminSessions.reduce((sum, s) => sum + s.total_score, 0)
      
      let currentStreak = 0
      let longestStreak = 0
      let tempStreak = 0
      let lastDate: Date | null = null

      for (const session of allAdminSessions) {
        const sessionDate = new Date(session.completed_at)
        sessionDate.setHours(0, 0, 0, 0)
        
        if (lastDate) {
          const daysDiff = Math.floor((sessionDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
          if (daysDiff === 1) {
            tempStreak++
          } else {
            longestStreak = Math.max(longestStreak, tempStreak)
            tempStreak = 1
          }
        } else {
          tempStreak = 1
        }
        
        lastDate = sessionDate
      }
      longestStreak = Math.max(longestStreak, tempStreak)
      
      const mostRecentSession = allAdminSessions[allAdminSessions.length - 1]
      if (mostRecentSession) {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const mostRecentDate = new Date(mostRecentSession.completed_at)
        mostRecentDate.setHours(0, 0, 0, 0)
        const daysSinceLastPlay = Math.floor((today.getTime() - mostRecentDate.getTime()) / (1000 * 60 * 60 * 24))
        
        if (daysSinceLastPlay === 0 || daysSinceLastPlay === 1) {
          currentStreak = tempStreak
        }
      }

      await knex('user')
        .where('id', mainAdminUser.id)
        .update({
          total_score: totalScore,
          current_streak: currentStreak,
          longest_streak: longestStreak,
          last_played_at: allAdminSessions[allAdminSessions.length - 1]?.completed_at || null,
        })

      console.log(
        `Updated admin user stats: total_score=${totalScore}, current_streak=${currentStreak}, longest_streak=${longestStreak}`
      )
    }
  }

  console.log('✓ Game sessions seed completed')
}
