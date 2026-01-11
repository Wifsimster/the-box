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
