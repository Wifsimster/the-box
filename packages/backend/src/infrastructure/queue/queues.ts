import { Queue, QueueEvents } from 'bullmq'
import { redisConnectionOptions } from './connection.js'
import type { JobData } from '@the-box/types'
import type { RegistryEntry } from './workers/geo-registry-import-logic.js'

export const importQueue = new Queue<JobData>('import-jobs', {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
})

export const importQueueEvents = new QueueEvents('import-jobs', {
  connection: redisConnectionOptions,
})

export type GeoJobData =
  | {
      kind: 'evaluate-consensus'
      geoScreenshotCandidateId: number
      pinCountAtEnqueue?: number
    }
  | { kind: 'promote-contributor-tier'; userId: string }
  | {
      kind: 'import-registry-map'
      gameId: number
      entry: RegistryEntry
    }
  | {
      kind: 'import-fandom-map'
      gameId: number
      wikiSubdomain: string
      pageTitle: string
    }
  | {
      kind: 'import-strategywiki-map'
      gameId: number
      gameName: string
      slug: string
    }
  | {
      kind: 'import-fextralife-map'
      gameId: number
      gameName: string
      slug: string
    }
  | {
      kind: 'import-wikidata-map'
      gameId: number
      wikidataQid: string
    }
  | {
      kind: 'import-wand-map'
      gameId: number
      wandUrl: string
      region?: string
    }
  | {
      kind: 'import-steam-screenshots'
      gameId: number
      geoMapId: number
      steamAppId: number
      maxItems?: number
    }
  | {
      kind: 'import-rawg-screenshots'
      gameId: number
      geoMapId: number
      rawgId: number
      maxItems?: number
    }
  | { kind: 'resolve-metadata'; batchSize?: number; gameId?: number }
  | { kind: 'ingest-tick'; batchSize?: number; gameId?: number }
  | { kind: 'backfill-tick'; batchSize?: number }
  | { kind: 'maps:pipeline'; gameId: number; correlationId?: string }
  | {
      kind:
        | 'maps:fetch-from-fandom'
        | 'maps:fetch-from-strategywiki'
        | 'maps:fetch-from-mapgenie'
        | 'maps:fetch-from-wand'
        | 'maps:fetch-from-steam'
        | 'maps:fetch-from-rawg'
      gameId: number
      correlationId?: string
    }

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

export type PushJobData = {
  kind: 'send-to-user'
  userId: string
  payload: {
    type: string
    title: string
    body: string
    url?: string
    data?: Record<string, unknown>
  }
}

export const pushQueue = new Queue<PushJobData>('push-jobs', {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    attempts: 4,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 100 },
  },
})

export const pushQueueEvents = new QueueEvents('push-jobs', {
  connection: redisConnectionOptions,
})

export type WebhookDeliveryJobData = {
  kind: 'deliver'
  deliveryId: number
}

export const webhookQueue = new Queue<WebhookDeliveryJobData>('webhook-delivery', {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 15_000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 200 },
  },
})

export const webhookQueueEvents = new QueueEvents('webhook-delivery', {
  connection: redisConnectionOptions,
})

export type DescribeGuessJobData = {
  kind: 'capture'
  userId: string
  isGuest: boolean
  tierSessionId: string
  position: number
  screenshotId: number
  guessText: string
  locale: 'fr' | 'en'
}

export const describeGuessQueue = new Queue<DescribeGuessJobData>('describe-guess', {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: true,
  },
})
