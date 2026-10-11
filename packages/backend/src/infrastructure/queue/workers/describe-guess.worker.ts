import { Worker, Job as BullJob } from 'bullmq'
import { redisConnectionOptions } from '../connection.js'
import { queueLogger } from '../../logger/logger.js'
import type { DescribeGuessJobData } from '../queues.js'
import { getDescribeGuessService } from '../../../composition/describe-guess.js'

const log = queueLogger.child({ worker: 'describe-guess' })

// "Describe the game" shadow capture. Runs off the guess request path. The
// settings are re-read per job: if the feature was turned off (or the key
// removed) after the guess was enqueued, the job is dropped. Concurrency 2
// bounds parallel model calls; each call is capped at 5 s by the service.
// Never logs the guess text.
export const describeGuessWorker = new Worker<DescribeGuessJobData>(
  'describe-guess',
  async (job: BullJob<DescribeGuessJobData>) => {
    if (job.data.kind !== 'capture') return { status: 'skipped', reason: 'unknown_kind' }
    const service = await getDescribeGuessService()
    if (!service) return { status: 'skipped', reason: 'disabled' }
    const { kind: _kind, ...capture } = job.data
    const outcome = await service.capture(capture)
    return outcome.status === 'recorded'
      ? { status: 'recorded', attemptId: outcome.attemptId }
      : outcome
  },
  {
    connection: redisConnectionOptions,
    concurrency: 2,
    lockDuration: 30_000,
  },
)

describeGuessWorker.on('failed', (job, error) => {
  log.warn({ jobId: job?.id, error: String(error) }, 'describe-guess job failed')
})

describeGuessWorker.on('error', (error) => {
  log.error({ error: String(error) }, 'describe-guess worker error')
})

log.info('describe-guess worker initialized')
