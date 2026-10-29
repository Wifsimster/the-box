import type { GeoJobData } from '../queues.js'

export type MapsFetchChildJob = Extract<GeoJobData, { kind: `maps:fetch-from-${string}` }>

export function isMapsFetchChildJob(
  data: GeoJobData | undefined,
): data is MapsFetchChildJob {
  return !!data && typeof data.kind === 'string' && data.kind.startsWith('maps:fetch-from-')
}

export interface FailedJobLike {
  data?: GeoJobData
  attemptsMade?: number
  opts?: { attempts?: number }
}

export function shouldAdvanceAfterFailure(job: FailedJobLike): boolean {
  if (!isMapsFetchChildJob(job.data)) return false
  const maxAttempts = job.opts?.attempts ?? 1
  const made = job.attemptsMade ?? 0
  return made >= maxAttempts
}
