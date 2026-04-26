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
import { scheduleDailyGeoChallenge } from './geo-schedule-logic.js'
import { resolveGeoMetadataBatch } from './geo-metadata-resolve-logic.js'
import { runGeoIngestTick } from './geo-ingest-tick-logic.js'
import { geoContributorService } from '../../../domain/services/index.js'
import { emitGeoTierUp } from '../../socket/socket.js'

const log = queueLogger.child({ worker: 'geo' })

export const geoWorker = new Worker<GeoJobData>(
  'geo-jobs',
  async (job: BullJob<GeoJobData>) => {
    const { id, data } = job
    log.info({ jobId: id, kind: data.kind }, 'processing geo job')

    if (data.kind === 'evaluate-consensus') {
      const result = await evaluateConsensusForCandidate(data.geoScreenshotCandidateId)
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

    if (data.kind === 'schedule-daily-challenge') {
      return await scheduleDailyGeoChallenge(data.date)
    }

    if (data.kind === 'resolve-metadata') {
      return await resolveGeoMetadataBatch(data.batchSize, data.gameId)
    }

    if (data.kind === 'ingest-tick') {
      return await runGeoIngestTick(data.batchSize, data.gameId)
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
  log.error(
    { jobId: job?.id, kind: (job?.data as GeoJobData | undefined)?.kind, err: String(err) },
    'geo job failed',
  )
})

geoWorker.on('completed', (job) => {
  log.debug({ jobId: job.id, kind: (job.data as GeoJobData).kind }, 'geo job completed')
})

log.info('geo worker initialized')
