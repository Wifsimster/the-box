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
 * Deletes all users where (isAnonymous = true OR email ends with @guest.thebox.local)
 * AND created more than 24 hours ago.
 */
export async function cleanupAnonymousUsers(
  onProgress?: ProgressCallback
): Promise<CleanupAnonymousUsersResult> {
  log.info('Starting anonymous users cleanup (>24 hours old)')

  onProgress?.(0, 4, 'Counting anonymous users...')

  // Step 1: Count anonymous users older than 24 hours
  // Use dual-condition: isAnonymous field OR email pattern matching
  const countResult = await db('user')
    .where(function () {
      this.whereRaw('"isAnonymous" = ?', [true])
        .orWhere('email', 'like', '%@guest.thebox.local')
    })
    .andWhereRaw('"createdAt" < NOW() - INTERVAL \'24 hours\'')
    .count('id as count')
    .first<{ count: string | number }>()

  const totalUsers = Number(countResult?.count ?? 0)

  log.info({ totalUsers }, 'Found anonymous users to delete (>24 hours old)')

  if (totalUsers === 0) {
    const message = 'No anonymous users older than 24 hours found to delete'
    log.info(message)
    onProgress?.(4, 4, message)
    return {
      usersDeleted: 0,
      message,
    }
  }

  onProgress?.(1, 4, `Found ${totalUsers} anonymous user(s) to delete...`)

  // Step 1.5: Log sample of users to be deleted for debugging
  const sampleUsers = await db('user')
    .select('id', 'email', 'isAnonymous', 'createdAt')
    .where(function () {
      this.whereRaw('"isAnonymous" = ?', [true])
        .orWhere('email', 'like', '%@guest.thebox.local')
    })
    .andWhereRaw('"createdAt" < NOW() - INTERVAL \'24 hours\'')
    .orderBy('createdAt', 'asc')
    .limit(5)

  log.info({ sampleUsers, totalUsers }, 'Sample of users to be deleted')

  onProgress?.(2, 4, `Deleting ${totalUsers} anonymous user(s)...`)

  // Step 2: Delete all matching anonymous users
  // CASCADE will automatically delete related records (sessions, accounts, game_sessions, etc.)
  const deletedCount = await db('user')
    .where(function () {
      this.whereRaw('"isAnonymous" = ?', [true])
        .orWhere('email', 'like', '%@guest.thebox.local')
    })
    .andWhereRaw('"createdAt" < NOW() - INTERVAL \'24 hours\'')
    .delete()

  log.info({
    deletedCount,
    totalUsers,
    difference: totalUsers - deletedCount
  }, 'Deleted anonymous users')

  if (deletedCount !== totalUsers) {
    log.warn(
      { deletedCount, totalUsers },
      'Mismatch between counted users and deleted users - possible concurrent modifications'
    )
  }

  onProgress?.(3, 4, `Successfully deleted ${deletedCount} anonymous user(s)`)

  const message = `Deleted ${deletedCount} anonymous user(s) older than 24 hours and all related records`
  onProgress?.(4, 4, 'Cleanup completed successfully!')

  const result: CleanupAnonymousUsersResult = {
    usersDeleted: deletedCount,
    message,
  }

  log.info(result, 'Anonymous users cleanup complete')
  return result
}
