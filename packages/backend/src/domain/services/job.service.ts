import type { Job, JobType, JobData, JobStatus } from '@the-box/types'
import type {
  DomainLogger,
  ImportQueuePort,
  ReadOnlyQueuePort,
  BullJobLike,
} from '../ports/index.js'

async function mapBullJobToJob(
  bullJob: BullJobLike,
  nextRunMap?: Map<string, number>
): Promise<Job> {
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
    id: bullJob.id ?? '',
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

export interface JobService {
  createJob(type: JobType, data?: JobData): Promise<Job>
  getJob(id: string): Promise<Job | null>
  listJobs(limit?: number): Promise<Job[]>
  cancelJob(id: string): Promise<boolean>
  clearCompleted(): Promise<number>
  getQueueStats(): Promise<{
    waiting: number
    active: number
    completed: number
    failed: number
    delayed: number
  }>
  getRecurringJobs(): Promise<
    {
      id: string
      name: string
      pattern: string | null
      every: number | null
      nextRun: string | null
      isActive: boolean
    }[]
  >
  removeRecurringJob(key: string): Promise<boolean>
}

export interface JobServiceDeps {
  logger: DomainLogger
  importQueue: ImportQueuePort
  // Optional secondary queue whose repeatable jobs should also surface in
  // the admin job list. Currently nothing operator-facing flows through it,
  // so the surfacing list is empty — the queue is kept around so future
  // geo cron-style jobs can opt in.
  geoQueue?: ReadOnlyQueuePort
}

/**
 * Create a JobService with injected dependencies.
 */
export function createJobService(deps: JobServiceDeps): JobService {
  const { importQueue, geoQueue } = deps
  const log = deps.logger.child({ service: 'job' })

  return {
    async createJob(type: JobType, data: JobData = {}): Promise<Job> {
      const jobId = `${type}-${Date.now()}`
      log.info({ type, data, jobId }, 'creating job')

      const job = await importQueue.add(type, data, { jobId })
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
      log.info(
        {
          total: jobs.length,
          states: jobs.map(j => ({ id: j.id, name: j.name, state: j.getState() })),
        },
        'attempting to clear jobs'
      )
      let removed = 0

      for (const job of jobs) {
        try {
          await job.remove()
          removed++
          log.debug({ jobId: job.id, name: job.name }, 'removed job')
        } catch (err) {
          // Job might already be removed or in a state that can't be removed
          log.debug(
            { jobId: job.id, name: job.name, error: err },
            'failed to remove job, skipping'
          )
        }
      }

      log.info({ total: jobs.length, removed }, 'cleared jobs')
      return removed
    },

    async getQueueStats() {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        importQueue.getWaitingCount(),
        importQueue.getActiveCount(),
        importQueue.getCompletedCount(),
        importQueue.getFailedCount(),
        importQueue.getDelayedCount(),
      ])

      return { waiting, active, completed, failed, delayed }
    },

    async getRecurringJobs() {
      const [importRepeats, importActive] = await Promise.all([
        importQueue.getRepeatableJobs(),
        importQueue.getJobs(['active']),
      ])

      const allRepeats = [...importRepeats]
      const allActive = [...importActive]

      if (geoQueue) {
        const [geoRepeats, geoActive] = await Promise.all([
          geoQueue.getRepeatableJobs(),
          geoQueue.getJobs(['active']),
        ])
        // No operator-facing geo cron jobs are surfaced today; `resolve-metadata`
        // and `ingest-tick` stay hidden as background plumbing.
        const geoSurfaced = new Set<string>()
        allRepeats.push(...geoRepeats.filter(j => geoSurfaced.has(j.name)))
        allActive.push(...geoActive.filter(j => geoSurfaced.has(j.name)))
      }

      const activeJobNames = new Set(allActive.map(j => j.name))

      return allRepeats.map(job => ({
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
}
