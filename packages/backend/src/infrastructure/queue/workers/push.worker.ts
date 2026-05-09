import { Worker, Job as BullJob } from 'bullmq'
import { redisConnectionOptions } from '../connection.js'
import { queueLogger } from '../../logger/logger.js'
import type { PushJobData } from '../queues.js'
import { fanOutPush } from './push-fanout-logic.js'

const log = queueLogger.child({ worker: 'push' })

// Push worker. Concurrency is intentionally higher than the import worker
// because each send is small, the bottleneck is the push provider's edge,
// and `Promise.allSettled` inside fanOutPush keeps a single slow device
// from blocking siblings. A throw here marks the BullMQ job as failed and
// triggers the retry policy in queues.ts (4 attempts, exponential backoff).
export const pushWorker = new Worker<PushJobData>(
  'push-jobs',
  async (job: BullJob<PushJobData>) => {
    if (job.data.kind !== 'send-to-user') {
      throw new Error(`unknown push job kind: ${(job.data as { kind: string }).kind}`)
    }
    const result = await fanOutPush(job.data)
    if (result.attempted > 0 && result.succeeded === 0 && result.retryable > 0) {
      // Every device failed transiently — let BullMQ retry. If the user has
      // mixed retryable + permanent failures we still consider the job done
      // (permanent errors won't get any better on retry).
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
