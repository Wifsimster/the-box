import { Worker, Job as BullJob } from 'bullmq'
import { redisConnectionOptions } from '../connection.js'
import { queueLogger } from '../../logger/logger.js'
import type { JobData, JobResult } from '@the-box/types'
import { fetchGamesFromRAWG, saveData, downloadAllScreenshots } from './import-logic.js'
import { processBatch, scheduleNextBatch } from './batch-import-logic.js'
import { processSyncAllBatch, scheduleSyncAllNextBatch } from './sync-all-logic.js'
import { createDailyChallenge } from './daily-challenge-logic.js'
import { cleanupAnonymousUsers } from './cleanup-anonymous-logic.js'
import { processRecalculateScoresJob } from './recalculate-scores-logic.js'
import { clearDailyData } from './clear-daily-data-logic.js'

const log = queueLogger

export const importWorker = new Worker<JobData, JobResult>(
  'import-jobs',
  async (job: BullJob<JobData>) => {
    const { id, name, data } = job
    const repeatJobKey = job.repeatJobKey
    log.info({ jobId: id, type: name, repeatJobKey, timestamp: new Date().toISOString() }, 'starting import job')

    try {
      if (name === 'import-games') {
        const targetGames = data.targetGames || 200
        const screenshotsPerGame = data.screenshotsPerGame || 3
        const minMetacritic = data.minMetacritic ?? 70

        const result = await fetchGamesFromRAWG(
          targetGames,
          screenshotsPerGame,
          minMetacritic,
          (current, total) => {
            const progress = Math.round((current / total) * 100)
            job.updateProgress(progress)
          }
        )

        await saveData(result.games, result.screenshots)

        const jobResult: JobResult = {
          gamesProcessed: result.games.length,
          screenshotsProcessed: result.screenshots.length,
          skipped: result.skipped,
          message: `Fetched ${result.games.length} games with ${result.screenshots.length} screenshots (${result.skipped} skipped - already exist)`,
        }

        log.info({ jobId: id, result: jobResult }, 'import-games job completed')
        return jobResult
      }

      if (name === 'import-screenshots') {
        const result = await downloadAllScreenshots((current, total) => {
          const progress = Math.round((current / total) * 100)
          job.updateProgress(progress)
        })

        const jobResult: JobResult = {
          screenshotsProcessed: result.downloaded,
          failedCount: result.failed,
          message: `Downloaded ${result.downloaded} screenshots, ${result.failed} failed`,
        }

        log.info({ jobId: id, result: jobResult }, 'import-screenshots job completed')
        return jobResult
      }

      if (name === 'batch-import-games') {
        const { importStateId, isResume } = data
        if (!importStateId) {
          throw new Error('importStateId is required for batch-import-games job')
        }

        log.info({
          jobId: id,
          importStateId,
          isResume: !!isResume,
        }, `Processing batch-import-games job (${isResume ? 'RESUME' : 'NEW'})`)

        const result = await processBatch(importStateId, (current, total) => {
          const progress = total > 0 ? Math.round((current / total) * 100) : 0
          job.updateProgress(progress)
        })

        // If not complete and not paused, schedule next batch
        let nextBatchScheduled = false
        if (!result.isComplete && !result.isPaused) {
          const nextJob = await scheduleNextBatch(importStateId)
          nextBatchScheduled = !!nextJob
        }

        const jobResult: JobResult = {
          gamesProcessed: result.gamesProcessed,
          gamesImported: result.gamesImported,
          gamesSkipped: result.gamesSkipped,
          screenshotsProcessed: result.screenshotsDownloaded,
          failedCount: result.failedCount,
          importStateId: result.importStateId,
          batchNumber: result.currentBatch,
          totalBatches: result.totalBatches ?? undefined,
          totalGamesAvailable: result.totalGamesAvailable ?? undefined,
          isComplete: result.isComplete,
          nextBatchScheduled,
          message: result.isPaused
            ? `Batch paused after ${result.gamesProcessed} games`
            : result.isComplete
              ? `Import complete! ${result.gamesImported} games imported, ${result.gamesSkipped} skipped`
              : `Batch ${result.currentBatch} complete: ${result.gamesImported} imported, ${result.gamesSkipped} skipped`,
        }

        if (result.isPaused) {
          log.info({ jobId: id }, 'Batch job stopped (import paused by user)')
        } else if (result.isComplete) {
          log.info({ jobId: id, totalImported: result.gamesImported }, 'Full import completed successfully!')
        } else {
          log.info({ jobId: id, nextBatch: result.currentBatch + 1 }, 'Batch completed, next batch scheduled')
        }
        return jobResult
      }

      if (name === 'create-daily-challenge') {
        const result = await createDailyChallenge((current, total) => {
          const progress = Math.round((current / total) * 100)
          job.updateProgress(progress)
        })

        const jobResult: JobResult = {
          message: result.message,
        }

        log.info({ jobId: id, result: jobResult }, 'create-daily-challenge job completed')
        return jobResult
      }

      if (name === 'sync-all-games') {
        const { syncStateId, updateExistingMetadata, isResume } = data
        if (!syncStateId) {
          throw new Error('syncStateId is required for sync-all-games job')
        }

        log.info({
          jobId: id,
          syncStateId,
          updateExistingMetadata: updateExistingMetadata ?? true,
          isResume: !!isResume,
        }, `Processing sync-all-games job (${isResume ? 'RESUME' : 'NEW'})`)

        const result = await processSyncAllBatch(
          syncStateId,
          updateExistingMetadata ?? true,
          (current, total) => {
            const progress = total > 0 ? Math.round((current / total) * 100) : 0
            job.updateProgress(progress)
          }
        )

        // If not complete and not paused, schedule next batch
        let nextBatchScheduled = false
        if (!result.isComplete && !result.isPaused) {
          const nextJob = await scheduleSyncAllNextBatch(syncStateId)
          nextBatchScheduled = !!nextJob
        }

        const jobResult: JobResult = {
          gamesProcessed: result.gamesProcessed,
          gamesImported: result.gamesImported,
          gamesUpdated: result.gamesUpdated,
          gamesSkipped: result.gamesSkipped,
          screenshotsProcessed: result.screenshotsDownloaded,
          failedCount: result.failedCount,
          syncStateId: result.syncStateId,
          batchNumber: result.currentBatch,
          totalBatches: result.totalBatches ?? undefined,
          totalGamesAvailable: result.totalGamesAvailable ?? undefined,
          isComplete: result.isComplete,
          nextBatchScheduled,
          message: result.isPaused
            ? `Sync paused after ${result.gamesProcessed} games`
            : result.isComplete
              ? `Sync complete! ${result.gamesImported} new, ${result.gamesUpdated} updated`
              : `Sync batch ${result.currentBatch} complete: ${result.gamesImported} new, ${result.gamesUpdated} updated`,
        }

        if (result.isPaused) {
          log.info({ jobId: id }, 'Sync job stopped (paused by user)')
        } else if (result.isComplete) {
          log.info({ jobId: id, totalImported: result.gamesImported, totalUpdated: result.gamesUpdated }, 'Sync all games completed!')
        } else {
          log.info({ jobId: id, nextBatch: result.currentBatch + 1 }, 'Sync batch completed, next batch scheduled')
        }
        return jobResult
      }

      if (name === 'cleanup-anonymous-users') {
        const result = await cleanupAnonymousUsers((current, total) => {
          const progress = Math.round((current / total) * 100)
          job.updateProgress(progress)
        })

        const jobResult: JobResult = {
          usersDeleted: result.usersDeleted,
          message: result.message,
        }

        log.info({ jobId: id, result: jobResult }, 'cleanup-anonymous-users job completed')
        return jobResult
      }

      if (name === 'recalculate-scores') {
        let { recalculateStateId } = data
        const { isResume } = data

        // For recurring jobs, recalculateStateId may not be provided - create one
        if (!recalculateStateId) {
          const { importStateRepository } = await import('../../repositories/import-state.repository.js')
          const newState = await importStateRepository.create({
            importType: 'recalculate-scores',
            batchSize: data.batchSize || 100,
          })
          recalculateStateId = newState.id
          // Update job data with the new state ID for tracking
          await job.updateData({ ...data, recalculateStateId })
          log.info({ recalculateStateId }, 'Created new recalculate state for recurring job')
        }

        log.info({
          jobId: id,
          recalculateStateId,
          isResume: !!isResume,
          dryRun: data.dryRun ?? false,
        }, `Processing recalculate-scores job (${isResume ? 'RESUME' : 'NEW'})`)

        const result = await processRecalculateScoresJob(job, (current, total, _message, _state) => {
          const progress = total > 0 ? Math.round((current / total) * 100) : 0
          job.updateProgress(progress)
        })

        const jobResult: JobResult = {
          sessionsProcessed: result.sessionsProcessed,
          sessionsUpdated: result.sessionsUpdated,
          sessionsSkipped: result.sessionsSkipped,
          totalScoreChanges: result.totalScoreChanges,
          recalculateStateId: result.recalculateStateId,
          batchNumber: result.currentBatch,
          totalBatches: result.totalBatches ?? undefined,
          isComplete: result.isComplete,
          dryRun: result.dryRun,
          message: result.isPaused
            ? `Recalculation paused after ${result.sessionsProcessed} sessions`
            : result.isComplete
              ? result.dryRun
                ? `[DRY RUN] Would update ${result.sessionsUpdated} sessions (${result.sessionsSkipped} unchanged, total score changes: ${result.totalScoreChanges})`
                : `Recalculation complete! ${result.sessionsUpdated} sessions updated (${result.sessionsSkipped} unchanged, total score changes: ${result.totalScoreChanges})`
              : result.dryRun
                ? `[DRY RUN] Batch ${result.currentBatch}: ${result.sessionsUpdated} would be updated, ${result.sessionsSkipped} unchanged`
                : `Batch ${result.currentBatch} complete: ${result.sessionsUpdated} updated, ${result.sessionsSkipped} unchanged`,
        }

        if (result.isPaused) {
          log.info({ jobId: id }, 'Recalculate job stopped (paused by user)')
        } else if (result.isComplete) {
          log.info({
            jobId: id,
            sessionsUpdated: result.sessionsUpdated,
            totalScoreChanges: result.totalScoreChanges,
            dryRun: result.dryRun
          }, `Score recalculation completed${result.dryRun ? ' (dry run)' : ''}!`)
        } else {
          log.info({ jobId: id, nextBatch: result.currentBatch + 1 }, 'Recalculate batch completed, continuing...')
        }
        return jobResult
      }

      if (name === 'clear-daily-data') {
        const result = await clearDailyData((current, total) => {
          const progress = Math.round((current / total) * 100)
          job.updateProgress(progress)
        })

        const jobResult: JobResult = {
          sessionsDeleted: result.sessionsDeleted,
          challengeId: result.challengeId ?? undefined,
          challengeDate: result.challengeDate ?? undefined,
          message: result.message,
        }

        log.info({ jobId: id, result: jobResult }, 'clear-daily-data job completed')
        return jobResult
      }

      throw new Error(`Unknown job type: ${name}`)
    } catch (error) {
      log.error({ jobId: id, error: String(error) }, 'import job failed')
      throw error
    }
  },
  {
    connection: redisConnectionOptions,
    concurrency: 1, // One job at a time due to RAWG rate limits
    lockDuration: 300000, // 5 minutes lock (some jobs take a while)
    stalledInterval: 30000, // Check for stalled jobs every 30 seconds
    maxStalledCount: 2, // Allow 2 stalled attempts before failing
  }
)

importWorker.on('error', (error) => {
  log.error({ error: String(error) }, 'worker error')
})

importWorker.on('failed', (job, error) => {
  log.error({
    jobId: job?.id,
    name: job?.name,
    repeatJobKey: job?.repeatJobKey,
    error: String(error),
    attemptsMade: job?.attemptsMade,
  }, 'job failed')
})

importWorker.on('stalled', (jobId) => {
  log.warn({ jobId }, 'job stalled - worker may have lost connection')
})

importWorker.on('active', (job) => {
  log.debug({ jobId: job.id, name: job.name, repeatJobKey: job.repeatJobKey }, 'job became active')
})

importWorker.on('completed', (job) => {
  log.info({ jobId: job.id, name: job.name, repeatJobKey: job.repeatJobKey }, 'job completed')
})

log.info('import worker initialized with event handlers')
