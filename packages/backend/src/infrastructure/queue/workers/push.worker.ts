import { Worker, Job as BullJob } from 'bullmq'
import { redisConnectionOptions } from '../connection.js'
import { queueLogger } from '../../logger/logger.js'
import type { PushJobData } from '../queues.js'
import { fanOutPush } from './push-fanout-logic.js'

const log = queueLogger.child({ worker: 'push' })

export const pushWorker = new Worker<PushJobData>(
  'push-jobs',
  async (job: BullJob<PushJobData>) => {
    if (job.data.kind !== 'send-to-user') {
      throw new Error(`unknown push job kind: ${(job.data as { kind: string }).kind}`)
    }
    const result = await fanOutPush(job.data)
    if (result.attempted > 0 && result.succeeded === 0 && result.retryable > 0) {
      throw new Error(
        `push fan-out had ${result.retryable} retryable failures and 0 successes`,
      )
    }
    return result
  },
  {
    connection: redisConnectionOptions,
    concurrency: 10,
    lockDuration: 30_000,
    stalledInterval: 30_000,
  },
)

pushWorker.on('failed', (job, error) => {
  log.warn(
    { jobId: job?.id, attemptsMade: job?.attemptsMade, error: String(error) },
    'push job failed',
  )
})

pushWorker.on('error', (error) => {
  log.error({ error: String(error) }, 'push worker error')
})

log.info('push worker initialized')
