import { importQueue } from '../../infrastructure/queue/queues.js'
import type { Job, JobType, JobData, JobStatus } from '@the-box/types'
import { serviceLogger } from '../../infrastructure/logger/logger.js'

const log = serviceLogger.child({ service: 'job' })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function mapBullJobToJob(bullJob: any, nextRunMap?: Map<string, number>): Promise<Job> {
  const state = await bullJob.getState()
  const statusMap: Record<string, JobStatus> = {
    waiting: 'waiting',
    active: 'active',
    completed: 'completed',
    failed: 'failed',
    delayed: 'delayed',
  }

  // For repeatable jobs, get next run time from the map if available
  let nextRunAt: string | undefined
  if (bullJob.id?.startsWith('repeat:') && nextRunMap) {
    const nextRunTime = nextRunMap.get(bullJob.name)
    if (nextRunTime) {
      nextRunAt = new Date(nextRunTime).toISOString()
    }
  }

  return {
    id: bullJob.id,
    type: bullJob.name as JobType,
    status: statusMap[state] || 'waiting',
    progress: typeof bullJob.progress === 'number' ? bullJob.progress : 0,
    priority: bullJob.opts?.priority,
    data: bullJob.data,
    result: bullJob.returnvalue,
    error: bullJob.failedReason,
    createdAt: new Date(bullJob.timestamp).toISOString(),
    startedAt: bullJob.processedOn ? new Date(bullJob.processedOn).toISOString() : undefined,
    completedAt: bullJob.finishedOn ? new Date(bullJob.finishedOn).toISOString() : undefined,
    nextRunAt,
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

    // Build a map of job name -> next run time for repeatable jobs
    const repeatableJobs = await importQueue.getRepeatableJobs()
    const nextRunMap = new Map<string, number>()
    for (const repeatJob of repeatableJobs) {
      if (repeatJob.next) {
        nextRunMap.set(repeatJob.name, repeatJob.next)
      }
    }

    log.debug({ count: jobs.length }, 'listing jobs')
    return Promise.all(jobs.map(job => mapBullJobToJob(job, nextRunMap)))
  },

  async cancelJob(id: string): Promise<boolean> {
    const job = await importQueue.getJob(id)
    if (!job) {
      log.debug({ id }, 'job not found for cancellation')
      return false
    }

    const state = await job.getState()
    log.info({ id, state }, 'attempting to cancel/remove job')

    if (state === 'active') {
      // Cannot directly cancel active job, mark as failed
      await job.moveToFailed(new Error('Cancelled by user'), 'admin')
      return true
    }

    if (state === 'waiting' || state === 'delayed') {
      await job.remove()
      return true
    }

    if (state === 'completed' || state === 'failed') {
      // Allow removal of completed/failed jobs
      await job.remove()
      return true
    }

    log.debug({ id, state }, 'job cannot be cancelled in current state')
    return false
  },

  async clearCompleted(): Promise<number> {
    const jobs = await importQueue.getJobs(['completed', 'failed', 'waiting', 'delayed'])
    log.info({ total: jobs.length, states: jobs.map(j => ({ id: j.id, name: j.name, state: j.getState() })) }, 'attempting to clear jobs')
    let removed = 0

    for (const job of jobs) {
      try {
        await job.remove()
        removed++
        log.debug({ jobId: job.id, name: job.name }, 'removed job')
      } catch (err) {
        // Job might already be removed or in a state that can't be removed
        log.debug({ jobId: job.id, name: job.name, error: err }, 'failed to remove job, skipping')
      }
    }

    log.info({ total: jobs.length, removed }, 'cleared jobs')
    return removed
  },

  async getQueueStats(): Promise<{
    waiting: number
    active: number
    completed: number
    failed: number
    delayed: number
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      importQueue.getWaitingCount(),
      importQueue.getActiveCount(),
      importQueue.getCompletedCount(),
      importQueue.getFailedCount(),
      importQueue.getDelayedCount(),
    ])

    return { waiting, active, completed, failed, delayed }
  },

  async getRecurringJobs(): Promise<{
    id: string
    name: string
    pattern: string | null
    every: number | null
    nextRun: string | null
    isActive: boolean
  }[]> {
    const repeatableJobs = await importQueue.getRepeatableJobs()

    // Get active jobs to check if any recurring job is currently running
    const activeJobs = await importQueue.getJobs(['active'])
    const activeJobNames = new Set(activeJobs.map(j => j.name))

    return repeatableJobs.map(job => ({
      id: job.id || job.key,
      name: job.name,
      pattern: job.pattern || null,
      every: job.every ? parseInt(job.every, 10) : null,
      nextRun: job.next ? new Date(job.next).toISOString() : null,
      isActive: activeJobNames.has(job.name),
    }))
  },

  async removeRecurringJob(key: string): Promise<boolean> {
    try {
      log.info({ key }, 'removing recurring job')
      await importQueue.removeRepeatableByKey(key)
      return true
    } catch (error) {
      log.error({ key, error }, 'failed to remove recurring job')
      return false
    }
  },
}
