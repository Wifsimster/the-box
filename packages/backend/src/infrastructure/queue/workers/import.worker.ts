import { Worker, Job as BullJob } from 'bullmq'
import { redisConnectionOptions } from '../connection.js'
import { queueLogger } from '../../logger/logger.js'
import type { JobData, JobResult, JobProgressEvent, JobCompletedEvent, JobFailedEvent } from '@the-box/types'
import { fetchGamesFromRAWG, saveData, downloadAllScreenshots } from './import-logic.js'

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

export const importWorker = new Worker<JobData, JobResult>(
  'import-jobs',
  async (job: BullJob<JobData>) => {
    const { id, name, data } = job
    log.info({ jobId: id, type: name }, 'starting import job')

    try {
      if (name === 'import-games') {
        const targetGames = data.targetGames || 200
        const screenshotsPerGame = data.screenshotsPerGame || 3

        const result = await fetchGamesFromRAWG(
          targetGames,
          screenshotsPerGame,
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
          message: `Fetched ${result.games.length} games with ${result.screenshots.length} screenshots`,
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
