/**
 * Daily Challenge Creation Logic
 *
 * This module handles the recurring job that:
 * - Creates a new daily challenge for the current day (UTC)
 * - Randomly selects 10 screenshots from games with Metacritic score >= 85
 * - Allows reuse if fewer than 10 unique screenshots available
 * - Skips creation if challenge already exists for the date (idempotent)
 */

import { queueLogger } from '../../logger/logger.js'
import { challengeRepository } from '../../repositories/challenge.repository.js'
import { sessionRepository } from '../../repositories/session.repository.js'
import { db } from '../../database/connection.js'

const log = queueLogger.child({ module: 'daily-challenge' })

const TOTAL_SCREENSHOTS = 10
const UNFOUND_PENALTY = 0

export type ProgressCallback = (current: number, total: number, message: string) => void

export interface DailyChallengeResult {
  created: boolean
  challengeId?: number
  challengeDate: string
  screenshotsAssigned: number
  message: string
}

/**
 * Get today's date in YYYY-MM-DD format (UTC)
 */
function getTodayDateUTC(): string {
  const now = new Date()
  return now.toISOString().split('T')[0]!
}

/**
 * Select N random screenshots from the database.
 * Only selects screenshots from games with metacritic >= 85.
 * If fewer than N unique screenshots are available, allows reuse.
 */
async function selectRandomScreenshots(count: number): Promise<number[]> {
  // Get count of available screenshots from games with metascore >= 85
  const result = await db('screenshots')
    .join('games', 'screenshots.game_id', 'games.id')
    .where('screenshots.is_active', true)
    .where('games.metacritic', '>=', 85)
    .count('screenshots.id as count')
    .first()
  const available = Number(result?.count ?? 0)

  if (available === 0) {
    throw new Error('No screenshots available from games with metascore >= 85')
  }

  log.info({ available, needed: count, minMetascore: 85 }, 'Selecting random screenshots')

  // If we have enough unique screenshots, use ORDER BY RANDOM()
  if (available >= count) {
    const rows = await db('screenshots')
      .join('games', 'screenshots.game_id', 'games.id')
      .where('screenshots.is_active', true)
      .where('games.metacritic', '>=', 85)
      .orderByRaw('RANDOM()')
      .limit(count)
      .pluck<number[]>('screenshots.id')
    return rows
  }

  // Not enough unique screenshots - allow reuse
  log.warn(
    { available, needed: count, minMetascore: 85 },
    'Not enough unique screenshots with metascore >= 85, allowing reuse'
  )

  // Get all screenshot IDs from games with metascore >= 85
  const allIds = await db('screenshots')
    .join('games', 'screenshots.game_id', 'games.id')
    .where('screenshots.is_active', true)
    .where('games.metacritic', '>=', 85)
    .pluck<number[]>('screenshots.id')

  // Build selection with reuse
  const selected: number[] = []
  while (selected.length < count) {
    // Shuffle for randomness
    const shuffled = [...allIds].sort(() => Math.random() - 0.5)
    const needed = count - selected.length
    selected.push(...shuffled.slice(0, needed))
  }

  return selected.slice(0, count)
}

/**
 * End all in-progress game sessions by applying penalties for unfound screenshots.
 * This is called when a new daily challenge is created to ensure users can't continue
 * playing previous day's games.
 */
async function endAllInProgressGames(): Promise<{ ended: number; failed: number }> {
  log.info('Starting to end all in-progress games')

  let ended = 0
  let failed = 0

  try {
    const inProgressSessions = await sessionRepository.findAllInProgressSessions()
    log.info({ count: inProgressSessions.length }, 'Found in-progress game sessions')

    for (const session of inProgressSessions) {
      try {
        // Get correct positions to calculate unfound count
        const correctPositions = await sessionRepository.getCorrectPositions(session.id)
        const screenshotsFound = correctPositions.length
        const unfoundCount = TOTAL_SCREENSHOTS - screenshotsFound

        // Calculate penalty
        const penaltyApplied = unfoundCount * UNFOUND_PENALTY

        // Calculate final score (allow negative)
        const finalScore = session.total_score - penaltyApplied

        // Mark session as completed
        await sessionRepository.updateGameSession(session.id, {
          totalScore: finalScore,
          currentPosition: session.current_position,
          isCompleted: true,
        })

        log.info(
          {
            sessionId: session.id,
            userId: session.user_id,
            finalScore,
            screenshotsFound,
            unfoundCount,
            penaltyApplied,
            completionReason: 'midnight_auto_end',
          },
          'game ended automatically at midnight'
        )

        ended++
      } catch (error) {
        failed++
        log.error(
          { sessionId: session.id, userId: session.user_id, error: String(error) },
          'failed to end game session'
        )
      }
    }

    log.info({ ended, failed, total: inProgressSessions.length }, 'Finished ending in-progress games')
  } catch (error) {
    log.error({ error: String(error) }, 'failed to fetch in-progress sessions')
  }

  return { ended, failed }
}

/**
 * Main function to create a daily challenge for today.
 * This function is idempotent - it will skip if a challenge already exists.
 */
export async function createDailyChallenge(
  onProgress?: ProgressCallback
): Promise<DailyChallengeResult> {
  const challengeDate = getTodayDateUTC()

  log.info({ challengeDate }, 'Starting daily challenge creation')
  onProgress?.(0, 5, `Checking for existing challenge on ${challengeDate}...`)

  // Step 1: Check if challenge already exists for this date
  const existingChallenge = await challengeRepository.findByDate(challengeDate)
  if (existingChallenge) {
    log.info(
      { challengeId: existingChallenge.id, challengeDate },
      'Challenge already exists for date, skipping creation'
    )

    // Still end in-progress games even if challenge already exists
    onProgress?.(4, 5, 'Ending all in-progress games...')
    const endGamesResult = await endAllInProgressGames()
    log.info(
      { ended: endGamesResult.ended, failed: endGamesResult.failed },
      'Finished ending in-progress games'
    )

    return {
      created: false,
      challengeId: existingChallenge.id,
      challengeDate,
      screenshotsAssigned: 0,
      message: `Challenge already exists for ${challengeDate} (ID: ${existingChallenge.id}). Ended ${endGamesResult.ended} in-progress games.`,
    }
  }

  onProgress?.(1, 5, 'Selecting random screenshots...')

  // Step 2: Select 10 random screenshots
  const screenshotIds = await selectRandomScreenshots(10)
  log.info({ count: screenshotIds.length }, 'Selected screenshots for challenge')

  onProgress?.(2, 5, 'Creating daily challenge entry...')

  // Step 3: Create the daily challenge
  const challenge = await challengeRepository.create(challengeDate)
  log.info({ challengeId: challenge.id }, 'Created daily challenge')

  onProgress?.(3, 5, 'Creating tier and assigning screenshots...')

  // Step 4: Create tier (single "Daily Challenge" tier)
  const tier = await challengeRepository.createTier({
    dailyChallengeId: challenge.id,
    tierNumber: 1,
    name: 'Daily Challenge',
    timeLimitSeconds: 30,
  })

  // Step 5: Assign screenshots to positions 1-10
  await challengeRepository.createTierScreenshots(tier.id, screenshotIds)

  onProgress?.(4, 5, 'Ending all in-progress games...')

  // Step 6: End all in-progress games
  const endGamesResult = await endAllInProgressGames()
  log.info(
    { ended: endGamesResult.ended, failed: endGamesResult.failed },
    'Finished ending in-progress games'
  )

  onProgress?.(5, 5, 'Daily challenge created successfully!')

  const result: DailyChallengeResult = {
    created: true,
    challengeId: challenge.id,
    challengeDate,
    screenshotsAssigned: screenshotIds.length,
    message: `Created daily challenge for ${challengeDate} with ${screenshotIds.length} screenshots. Ended ${endGamesResult.ended} in-progress games.`,
  }

  log.info(result, 'Daily challenge creation complete')
  return result
}
