import type { GeoJobData } from '../queues.js'

export type MapsFetchChildJob = Extract<GeoJobData, { kind: `maps:fetch-from-${string}` }>

export function isMapsFetchChildJob(
  data: GeoJobData | undefined,
): data is MapsFetchChildJob {
  return !!data && typeof data.kind === 'string' && data.kind.startsWith('maps:fetch-from-')
}

// Shape of the BullMQ Job fields we read; kept narrow so the predicate is
// pure and unit-testable without booting Redis.
export interface FailedJobLike {
  data?: GeoJobData
  attemptsMade?: number
  opts?: { attempts?: number }
}

// True when a `maps:fetch-from-*` child job has exhausted its retries and
// the orchestrator must be re-enqueued to pick the next source. BullMQ
// increments `attemptsMade` before invoking the processor, so on the
// terminal failure `attemptsMade === opts.attempts`. `attempts` defaults
// to 1 when unset (single-shot job).
export function shouldAdvanceAfterFailure(job: FailedJobLike): boolean {
  if (!isMapsFetchChildJob(job.data)) return false
  const maxAttempts = job.opts?.attempts ?? 1
  const made = job.attemptsMade ?? 0
  return made >= maxAttempts
}
