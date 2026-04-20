import { Worker, Job as BullJob } from 'bullmq'
import { redisConnectionOptions } from '../connection.js'
import { queueLogger } from '../../logger/logger.js'
import type { GeoJobData } from '../queues.js'
import { evaluateConsensusForCandidate } from './geo-consensus-logic.js'
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
