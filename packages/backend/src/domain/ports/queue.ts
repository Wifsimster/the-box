import type { JobData, JobType } from '@the-box/types'

export type BullJobState =
  | 'waiting'
  | 'active'
  | 'completed'
  | 'failed'
  | 'delayed'
  | 'waiting-children'
  | 'prioritized'

export type BullJobStateResult = BullJobState | 'unknown'

export interface BullJobLike {
  id?: string
  name: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  opts: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  progress: number | object | string | boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  returnvalue: any
  failedReason?: string
  timestamp: number
  processedOn?: number
  finishedOn?: number
  getState(): Promise<BullJobStateResult>
  remove(): Promise<void>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  moveToFailed(err: Error, token: string, fetchNext?: boolean): Promise<void | any[]>
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

export interface ImportQueuePort {
  add(
    name: JobType | string,
    data: JobData,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    opts?: any
  ): Promise<BullJobLike>
  getJob(id: string): Promise<BullJobLike | undefined | null>
  getJobs(
    types: BullJobState[],
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

export interface ReadOnlyQueuePort {
  getJobs(
    types: BullJobState[],
    start?: number,
    end?: number,
    asc?: boolean
  ): Promise<BullJobLike[]>
  getRepeatableJobs(start?: number, end?: number, asc?: boolean): Promise<RepeatableJobLike[]>
}
