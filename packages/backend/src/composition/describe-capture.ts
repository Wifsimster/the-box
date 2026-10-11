/**
 * Wiring for the "describe the game" capture gate used by POST /api/game/guess.
 * Separate from describe-guess.ts so the BullMQ queue is only imported where
 * a guess can enqueue a capture.
 */
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
    // jobId: at most one queued capture per screenshot per session; the DB
    // claim in the worker is the durable cap.
    await describeGuessQueue.add('capture', { kind: 'capture', ...job }, { jobId: `${job.tierSessionId}-p${job.position}` })
  },
})
