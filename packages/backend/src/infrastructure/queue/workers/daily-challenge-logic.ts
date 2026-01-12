/**
 * Daily Challenge Creation Logic
 *
 * This module handles the recurring job that:
 * - Creates a new daily challenge for the current day (UTC)
 * - Randomly selects 10 screenshots from the available pool
 * - Allows reuse if fewer than 10 unique screenshots available
 * - Skips creation if challenge already exists for the date (idempotent)
 */

import { queueLogger } from '../../logger/logger.js'
import { challengeRepository } from '../../repositories/challenge.repository.js'
import { db } from '../../database/connection.js'

const log = queueLogger.child({ module: 'daily-challenge' })

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
 * If fewer than N unique screenshots are available, allows reuse.
 */
async function selectRandomScreenshots(count: number): Promise<number[]> {
  // Get count of available screenshots
  const [{ count: totalCount }] = await db('screenshots').count('id as count')
  const available = Number(totalCount)

  if (available === 0) {
    throw new Error('No screenshots available in database')
  }

  log.info({ available, needed: count }, 'Selecting random screenshots')

  // If we have enough unique screenshots, use ORDER BY RANDOM()
  if (available >= count) {
    const rows = await db('screenshots')
      .orderByRaw('RANDOM()')
      .limit(count)
      .pluck<number[]>('id')
    return rows
  }

  // Not enough unique screenshots - allow reuse
  log.warn(
    { available, needed: count },
    'Not enough unique screenshots, allowing reuse'
  )

  // Get all screenshot IDs
  const allIds = await db('screenshots').pluck<number[]>('id')

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
 * Main function to create a daily challenge for today.
 * This function is idempotent - it will skip if a challenge already exists.
 */
export async function createDailyChallenge(
  onProgress?: ProgressCallback
): Promise<DailyChallengeResult> {
  const challengeDate = getTodayDateUTC()

  log.info({ challengeDate }, 'Starting daily challenge creation')
  onProgress?.(0, 4, `Checking for existing challenge on ${challengeDate}...`)

  // Step 1: Check if challenge already exists for this date
  const existingChallenge = await challengeRepository.findByDate(challengeDate)
  if (existingChallenge) {
    log.info(
      { challengeId: existingChallenge.id, challengeDate },
      'Challenge already exists for date, skipping'
    )

    return {
      created: false,
      challengeId: existingChallenge.id,
      challengeDate,
      screenshotsAssigned: 0,
      message: `Challenge already exists for ${challengeDate} (ID: ${existingChallenge.id})`,
    }
  }

  onProgress?.(1, 4, 'Selecting random screenshots...')

  // Step 2: Select 10 random screenshots
  const screenshotIds = await selectRandomScreenshots(10)
  log.info({ count: screenshotIds.length }, 'Selected screenshots for challenge')

  onProgress?.(2, 4, 'Creating daily challenge entry...')

  // Step 3: Create the daily challenge
  const challenge = await challengeRepository.create(challengeDate)
  log.info({ challengeId: challenge.id }, 'Created daily challenge')

  onProgress?.(3, 4, 'Creating tier and assigning screenshots...')

  // Step 4: Create tier (single "Daily Challenge" tier)
  const tier = await challengeRepository.createTier({
    dailyChallengeId: challenge.id,
    tierNumber: 1,
    name: 'Daily Challenge',
    timeLimitSeconds: 30,
  })

  // Step 5: Assign screenshots to positions 1-10
  await challengeRepository.createTierScreenshots(tier.id, screenshotIds)

  onProgress?.(4, 4, 'Daily challenge created successfully!')

  const result: DailyChallengeResult = {
    created: true,
    challengeId: challenge.id,
    challengeDate,
    screenshotsAssigned: screenshotIds.length,
    message: `Created daily challenge for ${challengeDate} with ${screenshotIds.length} screenshots`,
  }

  log.info(result, 'Daily challenge creation complete')
  return result
}
