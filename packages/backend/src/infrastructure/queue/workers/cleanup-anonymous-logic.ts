/**
 * Cleanup Anonymous Users Logic
 *
 * This module handles the recurring job that:
 * - Deletes all anonymous users from the database
 * - Runs daily at 1 AM UTC
 * - Related records (sessions, accounts, game_sessions, etc.) are automatically
 *   deleted via CASCADE foreign key constraints
 */

import { queueLogger } from '../../logger/logger.js'
import { db } from '../../database/connection.js'

const log = queueLogger.child({ module: 'cleanup-anonymous-users' })

export type ProgressCallback = (current: number, total: number, message: string) => void

export interface CleanupAnonymousUsersResult {
  usersDeleted: number
  message: string
}

/**
 * Main function to cleanup all anonymous users.
 * Deletes all users where isAnonymous = true.
 */
export async function cleanupAnonymousUsers(
  onProgress?: ProgressCallback
): Promise<CleanupAnonymousUsersResult> {
  log.info('Starting anonymous users cleanup')

  onProgress?.(0, 3, 'Counting anonymous users...')

  // Step 1: Count anonymous users
  const countResult = await db('user')
    .whereRaw('"isAnonymous" = ?', [true])
    .count('id as count')
    .first<{ count: string | number }>()

  const totalUsers = Number(countResult?.count ?? 0)

  log.info({ totalUsers }, 'Found anonymous users to delete')

  if (totalUsers === 0) {
    const message = 'No anonymous users found to delete'
    log.info(message)
    onProgress?.(3, 3, message)
    return {
      usersDeleted: 0,
      message,
    }
  }

  onProgress?.(1, 3, `Deleting ${totalUsers} anonymous user(s)...`)

  // Step 2: Delete all anonymous users
  // CASCADE will automatically delete related records (sessions, accounts, game_sessions, etc.)
  const deletedCount = await db('user')
    .whereRaw('"isAnonymous" = ?', [true])
    .delete()

  log.info({ deletedCount }, 'Deleted anonymous users')

  onProgress?.(2, 3, `Successfully deleted ${deletedCount} anonymous user(s)`)

  const message = `Deleted ${deletedCount} anonymous user(s) and all related records`
  onProgress?.(3, 3, 'Cleanup completed successfully!')

  const result: CleanupAnonymousUsersResult = {
    usersDeleted: deletedCount,
    message,
  }

  log.info(result, 'Anonymous users cleanup complete')
  return result
}
