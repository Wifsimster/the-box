import { importQueue } from '../../infrastructure/queue/queues.js'
import type { Job, JobType, JobData, JobStatus } from '@the-box/types'
import { serviceLogger } from '../../infrastructure/logger/logger.js'

const log = serviceLogger.child({ service: 'job' })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function mapBullJobToJob(bullJob: any): Promise<Job> {
  const state = await bullJob.getState()
  const statusMap: Record<string, JobStatus> = {
    waiting: 'waiting',
    active: 'active',
    completed: 'completed',
    failed: 'failed',
    delayed: 'delayed',
  }

  return {
    id: bullJob.id,
    type: bullJob.name as JobType,
    status: statusMap[state] || 'waiting',
    progress: typeof bullJob.progress === 'number' ? bullJob.progress : 0,
    data: bullJob.data,
    result: bullJob.returnvalue,
    error: bullJob.failedReason,
    createdAt: new Date(bullJob.timestamp).toISOString(),
    startedAt: bullJob.processedOn ? new Date(bullJob.processedOn).toISOString() : undefined,
    completedAt: bullJob.finishedOn ? new Date(bullJob.finishedOn).toISOString() : undefined,
  }
}

export const jobService = {
  async createJob(type: JobType, data: JobData = {}): Promise<Job> {
    const jobId = `${type}-${Date.now()}`
    log.info({ type, data, jobId }, 'creating job')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const job = await importQueue.add(type as any, data, { jobId })
    return mapBullJobToJob(job)
  },

  async getJob(id: string): Promise<Job | null> {
    const job = await importQueue.getJob(id)
    if (!job) {
      log.debug({ id }, 'job not found')
      return null
    }
    return mapBullJobToJob(job)
  },

  async listJobs(limit = 50): Promise<Job[]> {
    const jobs = await importQueue.getJobs(
      ['waiting', 'active', 'completed', 'failed', 'delayed'],
      0,
      limit
    )

    // Sort by creation time (newest first)
    jobs.sort((a, b) => b.timestamp - a.timestamp)

    log.debug({ count: jobs.length }, 'listing jobs')
    return Promise.all(jobs.map(mapBullJobToJob))
  },

  async cancelJob(id: string): Promise<boolean> {
    const job = await importQueue.getJob(id)
    if (!job) {
      log.debug({ id }, 'job not found for cancellation')
      return false
    }

    const state = await job.getState()
    log.info({ id, state }, 'attempting to cancel job')

    if (state === 'active') {
      // Cannot directly cancel active job, mark as failed
      await job.moveToFailed(new Error('Cancelled by user'), 'admin')
      return true
    }

    if (state === 'waiting' || state === 'delayed') {
      await job.remove()
      return true
    }

    log.debug({ id, state }, 'job cannot be cancelled in current state')
    return false
  },

  async clearCompleted(): Promise<number> {
    const jobs = await importQueue.getJobs(['completed'])
    await Promise.all(jobs.map((j) => j.remove()))
    log.info({ count: jobs.length }, 'cleared completed jobs')
    return jobs.length
  },

  async getQueueStats(): Promise<{
    waiting: number
    active: number
    completed: number
    failed: number
  }> {
    const [waiting, active, completed, failed] = await Promise.all([
      importQueue.getWaitingCount(),
      importQueue.getActiveCount(),
      importQueue.getCompletedCount(),
      importQueue.getFailedCount(),
    ])

    return { waiting, active, completed, failed }
  },
}
