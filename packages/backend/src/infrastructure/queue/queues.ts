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
  | {
      kind: 'evaluate-consensus'
      geoScreenshotCandidateId: number
      // Post-increment pin count captured at submit time. The worker uses
      // this (not the freshly-read value) for the threshold gate so two
      // pins arriving in quick succession can't *both* skip the same
      // threshold (e.g. 5 → 6 with neither evaluating at 5). Optional for
      // back-compat with already-queued jobs from older deploys.
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
  // ===== Multi-source map fetch pipeline (replaces topup-screenshots) =====
  // Parent orchestrator job. Re-enqueued by each child on completion until
  // the pipeline reaches awaiting_curation, ready, or blocked.
  | { kind: 'maps:pipeline'; gameId: number; correlationId?: string }
  // Per-source children. The orchestrator picks one based on priority +
  // cooldown + circuit-breaker state, then enqueues exactly one of these.
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

// Push fan-out queue. One job per (userId, payload) — the worker handles the
// per-device fan-out internally with `Promise.allSettled` so a slow provider
// can't stall delivery to a user's other devices. Kept as its own queue so
// concurrency can be tuned independently of the heavier import jobs.
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
