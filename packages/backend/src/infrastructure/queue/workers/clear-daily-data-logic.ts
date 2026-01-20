/**
 * Clear Daily Data Logic
 *
 * This module handles the job that:
 * - Deletes all users' game session data for the current day's daily challenge
 * - Runs on demand or can be scheduled
 * - Related records (tier_sessions, guesses, power_ups, bonus_rounds) are
 *   automatically deleted via CASCADE foreign key constraints
 */

import { queueLogger } from '../../logger/logger.js'
import { db } from '../../database/connection.js'

const log = queueLogger.child({ module: 'clear-daily-data' })

export type ProgressCallback = (current: number, total: number, message: string) => void

export interface ClearDailyDataResult {
  sessionsDeleted: number
  challengeId: number | null
  challengeDate: string | null
  message: string
}

/**
 * Get today's date in UTC as YYYY-MM-DD string
 */
function getTodayDateUTC(): string {
  const now = new Date()
  return now.toISOString().split('T')[0]!
}

/**
 * Main function to clear all users' daily game data for the current date.
 * Deletes all game_sessions for today's daily challenge.
 * CASCADE will automatically delete related records (tier_sessions, guesses, etc.)
 */
export async function clearDailyData(
  onProgress?: ProgressCallback
): Promise<ClearDailyDataResult> {
  const challengeDate = getTodayDateUTC()
  log.info({ challengeDate }, 'Starting clear daily data job')

  onProgress?.(0, 4, 'Finding today\'s daily challenge...')

  // Step 1: Find today's daily challenge
  const challenge = await db('daily_challenges')
    .where('challenge_date', challengeDate)
    .first<{ id: number; challenge_date: string } | undefined>()

  if (!challenge) {
    const message = `No daily challenge found for date ${challengeDate}`
    log.info(message)
    onProgress?.(4, 4, message)
    return {
      sessionsDeleted: 0,
      challengeId: null,
      challengeDate,
      message,
    }
  }

  log.info({ challengeId: challenge.id, challengeDate }, 'Found daily challenge')
  onProgress?.(1, 4, `Found challenge #${challenge.id} for ${challengeDate}`)

  // Step 2: Count game sessions for this challenge
  const countResult = await db('game_sessions')
    .where('daily_challenge_id', challenge.id)
    .count('id as count')
    .first<{ count: string | number }>()

  const totalSessions = Number(countResult?.count ?? 0)

  log.info({ totalSessions, challengeId: challenge.id }, 'Found game sessions to delete')

  if (totalSessions === 0) {
    const message = `No game sessions found for challenge #${challenge.id} (${challengeDate})`
    log.info(message)
    onProgress?.(4, 4, message)
    return {
      sessionsDeleted: 0,
      challengeId: challenge.id,
      challengeDate,
      message,
    }
  }

  onProgress?.(2, 4, `Found ${totalSessions} game session(s) to delete...`)

  // Step 3: Delete all game sessions for this challenge
  // CASCADE will automatically delete tier_sessions, guesses, power_ups, bonus_rounds
  const deletedCount = await db('game_sessions')
    .where('daily_challenge_id', challenge.id)
    .delete()

  log.info({
    deletedCount,
    totalSessions,
    challengeId: challenge.id,
    challengeDate,
  }, 'Deleted game sessions')

  if (deletedCount !== totalSessions) {
    log.warn(
      { deletedCount, totalSessions },
      'Mismatch between counted sessions and deleted sessions - possible concurrent modifications'
    )
  }

  onProgress?.(3, 4, `Successfully deleted ${deletedCount} game session(s)`)

  const message = `Deleted ${deletedCount} game session(s) for challenge #${challenge.id} (${challengeDate}) and all related records`
  onProgress?.(4, 4, 'Clear daily data completed successfully!')

  const result: ClearDailyDataResult = {
    sessionsDeleted: deletedCount,
    challengeId: challenge.id,
    challengeDate: challenge.challenge_date,
    message,
  }

  log.info(result, 'Clear daily data job complete')
  return result
}
