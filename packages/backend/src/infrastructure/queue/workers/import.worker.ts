import { Worker, Job as BullJob } from 'bullmq'
import { redisConnectionOptions } from '../connection.js'
import { queueLogger } from '../../logger/logger.js'
import type { JobData, JobResult, JobProgressEvent, JobCompletedEvent, JobFailedEvent, BatchImportProgressEvent } from '@the-box/types'
import { fetchGamesFromRAWG, saveData, downloadAllScreenshots } from './import-logic.js'
import { syncNewGamesFromRAWG } from './sync-logic.js'
import { processBatch, scheduleNextBatch } from './batch-import-logic.js'

const log = queueLogger

// Socket.io instance - will be set after initialization
let ioInstance: { to: (room: string) => { emit: (event: string, data: unknown) => void } } | null = null

export function setSocketInstance(io: typeof ioInstance): void {
  ioInstance = io
  log.debug('socket instance set for worker')
}

function emitProgress(jobId: string, progress: number, current: number, total: number, message: string): void {
  if (ioInstance) {
    const event: JobProgressEvent = { jobId, progress, current, total, message }
    ioInstance.to('admin').emit('job_progress', event)
  }
}

function emitCompleted(jobId: string, result: JobResult): void {
  if (ioInstance) {
    const event: JobCompletedEvent = { jobId, result }
    ioInstance.to('admin').emit('job_completed', event)
  }
}

function emitFailed(jobId: string, error: string): void {
  if (ioInstance) {
    const event: JobFailedEvent = { jobId, error }
    ioInstance.to('admin').emit('job_failed', event)
  }
}

function emitBatchProgress(jobId: string, event: BatchImportProgressEvent): void {
  if (ioInstance) {
    ioInstance.to('admin').emit('batch_import_progress', { jobId, ...event })
  }
}

export const importWorker = new Worker<JobData, JobResult>(
  'import-jobs',
  async (job: BullJob<JobData>) => {
    const { id, name, data } = job
    log.info({ jobId: id, type: name }, 'starting import job')

    try {
      if (name === 'import-games') {
        const targetGames = data.targetGames || 200
        const screenshotsPerGame = data.screenshotsPerGame || 3
        const minMetacritic = data.minMetacritic ?? 70

        const result = await fetchGamesFromRAWG(
          targetGames,
          screenshotsPerGame,
          minMetacritic,
          (current, total, message) => {
            const progress = Math.round((current / total) * 100)
            job.updateProgress(progress)
            emitProgress(id!, progress, current, total, message)
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
        const result = await downloadAllScreenshots((current, total, message) => {
          const progress = Math.round((current / total) * 100)
          job.updateProgress(progress)
          emitProgress(id!, progress, current, total, message)
        })

        const jobResult: JobResult = {
          screenshotsProcessed: result.downloaded,
          failedCount: result.failed,
          message: `Downloaded ${result.downloaded} screenshots, ${result.failed} failed`,
        }

        log.info({ jobId: id, result: jobResult }, 'import-screenshots job completed')
        return jobResult
      }

      if (name === 'sync-new-games') {
        const maxGames = data.maxGames || 10
        const screenshotsPerGame = data.screenshotsPerGame || 3

        const result = await syncNewGamesFromRAWG(
          maxGames,
          screenshotsPerGame,
          (current, total, message) => {
            const progress = Math.round((current / total) * 100)
            job.updateProgress(progress)
            emitProgress(id!, progress, current, total, message)
          }
        )

        const jobResult: JobResult = {
          newGames: result.newGames,
          screenshotsProcessed: result.screenshotsProcessed,
          skipped: result.skipped,
          failedCount: result.failedCount,
          message: result.message,
        }

        log.info({ jobId: id, result: jobResult }, 'sync-new-games job completed')
        return jobResult
      }

      if (name === 'batch-import-games') {
        const { importStateId } = data
        if (!importStateId) {
          throw new Error('importStateId is required for batch-import-games job')
        }

        const result = await processBatch(importStateId, (current, total, message, state) => {
          const progress = total > 0 ? Math.round((current / total) * 100) : 0
          job.updateProgress(progress)

          // Emit standard progress
          emitProgress(id!, progress, current, total, message)

          // Emit batch-specific progress
          emitBatchProgress(id!, {
            jobId: id!,
            progress,
            current,
            total,
            message,
            importStateId: state.id,
            totalGamesAvailable: state.totalGamesAvailable || 0,
            currentBatch: state.currentBatch,
            totalBatches: state.totalBatchesEstimated || 0,
            gamesImported: state.gamesImported,
            gamesSkipped: state.gamesSkipped,
            screenshotsDownloaded: state.screenshotsDownloaded,
            estimatedTimeRemaining: null, // Could calculate this based on average time per game
          })
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

        log.info({ jobId: id, result: jobResult }, 'batch-import-games job completed')
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
  }
)

// Event handlers for Socket.io updates
importWorker.on('completed', (job, result) => {
  emitCompleted(job.id!, result)
})

importWorker.on('failed', (job, error) => {
  emitFailed(job?.id || 'unknown', error.message)
})

importWorker.on('error', (error) => {
  log.error({ error: String(error) }, 'worker error')
})

log.info('import worker initialized')
