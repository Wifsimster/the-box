import { Queue, QueueEvents } from 'bullmq'
import { redisConnectionOptions } from './connection.js'
import type { JobData } from '@the-box/types'

export const importQueue = new Queue<JobData>('import-jobs', {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: { count: 100 }, // Keep last 100 completed
    removeOnFail: { count: 50 }, // Keep last 50 failed
  },
})

export const importQueueEvents = new QueueEvents('import-jobs', {
  connection: redisConnectionOptions,
})

// Job payloads carried on the geo-jobs queue. Kept inline (not exported to
// @the-box/types) because only the backend workers and the enqueueing route
// need to know the shape.
export type GeoJobData =
  | { kind: 'evaluate-consensus'; geoScreenshotCandidateId: number }
  | { kind: 'promote-contributor-tier'; userId: string }
  | {
      kind: 'import-fandom-map'
      gameId: number
      wikiSubdomain: string
      pageTitle: string
    }
  | {
      kind: 'import-steam-screenshots'
      gameId: number
      geoMapId: number
      steamAppId: number
      maxItems?: number
    }
  | { kind: 'schedule-daily-challenge'; date?: string }

export const geoQueue = new Queue<GeoJobData>('geo-jobs', {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1500 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 100 },
  },
})

export const geoQueueEvents = new QueueEvents('geo-jobs', {
  connection: redisConnectionOptions,
})
