import {
  createCaptureGate,
  createWindowLimiter,
  DESCRIBE_CAPTURES_PER_HOUR,
} from '../domain/services/describe-guess.service.js'
import { describeGuessQueue } from '../infrastructure/queue/queues.js'
import { isDescribeGuessLive } from './describe-guess.js'

export const maybeCaptureDescription = createCaptureGate({
  isActive: isDescribeGuessLive,
  limiter: createWindowLimiter({ max: DESCRIBE_CAPTURES_PER_HOUR, windowMs: 3_600_000 }),
  enqueue: async (job) => {
    await describeGuessQueue.add('capture', { kind: 'capture', ...job }, { jobId: `${job.tierSessionId}-p${job.position}` })
  },
})
