/**
 * Domain-facing queue ports.
 *
 * Captures the subset of the BullMQ Queue surface that domain services
 * (currently `job.service.ts`) rely on. Stage 1 keeps this wide so the
 * existing BullMQ `importQueue` instance is directly assignable.
 */
import type { JobData, JobType } from '@the-box/types'

export type BullJobState =
  | 'waiting'
  | 'active'
  | 'completed'
  | 'failed'
  | 'delayed'
  | 'waiting-children'
  | 'prioritized'
  | 'unknown'

/**
 * Minimal shape of a BullMQ Job as used by job.service.ts.
 * Kept loose (fields optional where BullMQ exposes them as optional) to
 * match the real object without forcing a dependency on bullmq types here.
 */
export interface BullJobLike {
  id?: string
  name: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  opts: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  progress: number | object
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  returnvalue: any
  failedReason?: string
  timestamp: number
  processedOn?: number
  finishedOn?: number
  getState(): Promise<BullJobState>
  remove(): Promise<void>
  moveToFailed(err: Error, token: string, fetchNext?: boolean): Promise<void>
}

export interface RepeatableJobLike {
  key: string
  name: string
  id?: string | null
  endDate?: number | null
  tz?: string | null
  pattern?: string | null
  every?: string | null
  next?: number
}

/**
 * Port describing the queue surface used by the job domain service.
 * Matches BullMQ Queue methods enough for the singleton to satisfy it.
 */
export interface ImportQueuePort {
  add(
    name: JobType | string,
    data: JobData,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    opts?: any
  ): Promise<BullJobLike>
  getJob(id: string): Promise<BullJobLike | undefined | null>
  getJobs(
    types: BullJobState[] | readonly BullJobState[],
    start?: number,
    end?: number,
    asc?: boolean
  ): Promise<BullJobLike[]>
  getRepeatableJobs(start?: number, end?: number, asc?: boolean): Promise<RepeatableJobLike[]>
  removeRepeatableByKey(key: string): Promise<boolean>
  getWaitingCount(): Promise<number>
  getActiveCount(): Promise<number>
  getCompletedCount(): Promise<number>
  getFailedCount(): Promise<number>
  getDelayedCount(): Promise<number>
}
