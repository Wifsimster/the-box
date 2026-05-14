import { Worker, Job as BullJob } from 'bullmq'
import { redisConnectionOptions } from '../connection.js'
import { queueLogger } from '../../logger/logger.js'
import type { GeoJobData } from '../queues.js'
import { evaluateConsensusForCandidate } from './geo-consensus-logic.js'
import { importFandomMap } from './geo-fandom-import-logic.js'
import { importFextralifeMap } from './geo-fextralife-import-logic.js'
import { importRegistryMap } from './geo-registry-import-logic.js'
import { importStrategyWikiMap } from './geo-strategywiki-import-logic.js'
import { importWandMap } from './geo-wand-import-logic.js'
import { importWikidataMap } from './geo-wikidata-import-logic.js'
import { importSteamScreenshots } from './geo-steam-import-logic.js'
import { importRawgScreenshots } from './geo-rawg-import-logic.js'
import { resolveGeoMetadataBatch } from './geo-metadata-resolve-logic.js'
import { runGeoIngestTick } from './geo-ingest-tick-logic.js'
import { advancePipeline, runMapsPipeline } from './maps-pipeline-logic.js'
import {
  shouldAdvanceAfterFailure,
  type MapsFetchChildJob,
} from './geo-worker-predicates.js'
import { runMapsFetchSteam } from './maps-fetch-steam.js'
import { runMapsFetchRawg } from './maps-fetch-rawg.js'
import { runMapsFetchFandom } from './maps-fetch-fandom.js'
import { runMapsFetchStrategyWiki } from './maps-fetch-strategywiki.js'
import { runMapsFetchWand } from './maps-fetch-wand.js'
import { runMapsFetchMapgenie } from './maps-fetch-mapgenie.js'
import { geoContributorService } from '../../../domain/services/index.js'
import { emitGeoTierUp } from '../../socket/socket.js'

const log = queueLogger.child({ worker: 'geo' })

export const geoWorker = new Worker<GeoJobData>(
  'geo-jobs',
  async (job: BullJob<GeoJobData>) => {
    const { id, data } = job
    log.info({ jobId: id, kind: data.kind }, 'processing geo job')

    if (data.kind === 'evaluate-consensus') {
      const result = await evaluateConsensusForCandidate(
        data.geoScreenshotCandidateId,
        { pinCountAtEnqueue: data.pinCountAtEnqueue },
      )
      log.info({ jobId: id, result }, 'consensus job done')
      return result
    }

    if (data.kind === 'promote-contributor-tier') {
      const result = await geoContributorService.evaluateAndMaybePromote(data.userId)
      if (result?.promoted) {
        emitGeoTierUp({
          userId: data.userId,
          previousTier: result.previousTier,
          newTier: result.newTier,
        })
      }
      return result
    }

    if (data.kind === 'import-registry-map') {
      return await importRegistryMap({
        gameId: data.gameId,
        entry: data.entry,
      })
    }

    if (data.kind === 'import-fandom-map') {
      return await importFandomMap({
        gameId: data.gameId,
        wikiSubdomain: data.wikiSubdomain,
        pageTitle: data.pageTitle,
      })
    }

    if (data.kind === 'import-strategywiki-map') {
      return await importStrategyWikiMap({
        gameId: data.gameId,
        gameName: data.gameName,
        slug: data.slug,
      })
    }

    if (data.kind === 'import-fextralife-map') {
      return await importFextralifeMap({
        gameId: data.gameId,
        gameName: data.gameName,
        slug: data.slug,
      })
    }

    if (data.kind === 'import-wikidata-map') {
      return await importWikidataMap({
        gameId: data.gameId,
        wikidataQid: data.wikidataQid,
      })
    }

    if (data.kind === 'import-wand-map') {
      return await importWandMap({
        gameId: data.gameId,
        wandUrl: data.wandUrl,
        region: data.region,
      })
    }

    if (data.kind === 'import-steam-screenshots') {
      return await importSteamScreenshots({
        gameId: data.gameId,
        geoMapId: data.geoMapId,
        steamAppId: data.steamAppId,
        maxItems: data.maxItems,
      })
    }

    if (data.kind === 'import-rawg-screenshots') {
      return await importRawgScreenshots({
        gameId: data.gameId,
        geoMapId: data.geoMapId,
        rawgId: data.rawgId,
        maxItems: data.maxItems,
      })
    }

    if (data.kind === 'resolve-metadata') {
      return await resolveGeoMetadataBatch(data.batchSize, data.gameId)
    }

    if (data.kind === 'ingest-tick') {
      return await runGeoIngestTick(data.batchSize, data.gameId)
    }

    if (data.kind === 'maps:pipeline') {
      return await runMapsPipeline({
        gameId: data.gameId,
        correlationId: data.correlationId,
      })
    }

    if (data.kind === 'maps:fetch-from-steam') {
      return await runMapsFetchSteam({
        gameId: data.gameId,
        correlationId: data.correlationId,
      })
    }

    if (data.kind === 'maps:fetch-from-rawg') {
      return await runMapsFetchRawg({
        gameId: data.gameId,
        correlationId: data.correlationId,
      })
    }

    if (data.kind === 'maps:fetch-from-fandom') {
      return await runMapsFetchFandom({
        gameId: data.gameId,
        correlationId: data.correlationId,
      })
    }

    if (data.kind === 'maps:fetch-from-strategywiki') {
      return await runMapsFetchStrategyWiki({
        gameId: data.gameId,
        correlationId: data.correlationId,
      })
    }

    if (data.kind === 'maps:fetch-from-wand') {
      return await runMapsFetchWand({
        gameId: data.gameId,
        correlationId: data.correlationId,
      })
    }

    if (data.kind === 'maps:fetch-from-mapgenie') {
      return await runMapsFetchMapgenie({
        gameId: data.gameId,
        correlationId: data.correlationId,
      })
    }

    throw new Error(`unknown geo job kind: ${JSON.stringify(data)}`)
  },
  {
    connection: redisConnectionOptions,
    concurrency: 4,
    lockDuration: 60_000,
    stalledInterval: 30_000,
  },
)

geoWorker.on('error', (err) => {
  log.error({ err: String(err) }, 'geo worker error')
})

geoWorker.on('failed', (job, err) => {
  const data = job?.data as GeoJobData | undefined
  log.error(
    { jobId: job?.id, kind: data?.kind, attemptsMade: job?.attemptsMade, err: String(err) },
    'geo job failed',
  )

  if (!job || !shouldAdvanceAfterFailure(job)) return

  // `runSourceFetch` in maps-fetch-runtime.ts records the attempt and rethrows
  // on transient errors, so its post-recordAttempt `advancePipeline` call is
  // unreachable on the throw path. Without re-enqueueing here the pipeline
  // state would stay pinned at `fetching_*` with `active_source` on the dead
  // source and BullMQ has no more retries to run.
  void advancePipeline({
    gameId: (data as MapsFetchChildJob).gameId,
    correlationId: (data as MapsFetchChildJob).correlationId,
  }).catch((advanceErr) => {
    log.error(
      { jobId: job.id, gameId: (data as MapsFetchChildJob).gameId, err: String(advanceErr) },
      'failed to advance pipeline after maps:fetch-from-* exhaustion',
    )
  })
})

geoWorker.on('completed', (job) => {
  log.debug({ jobId: job.id, kind: (job.data as GeoJobData).kind }, 'geo job completed')
})

log.info('geo worker initialized')
