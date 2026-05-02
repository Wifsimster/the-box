import type { GeoSourceName } from '@the-box/types'
import { queueLogger } from '../../logger/logger.js'
import { geoIngestAttemptRepository } from '../../repositories/geo-ingest-attempt.repository.js'
import { geoSourceConfigRepository } from '../../repositories/geo-source-config.repository.js'
import { advancePipeline } from './maps-pipeline-logic.js'

const log = queueLogger.child({ worker: 'maps-fetch-stub' })

/**
 * Placeholder fetcher used by every per-source job until the real workers
 * land. Records a `not_found` outcome (so the cooldown engages and the
 * orchestrator advances) and re-enqueues the pipeline.
 *
 * Replaced source-by-source in the next commit. Each source will get its own
 * `geo-{source}-fetch-logic.ts` file.
 */
export async function runMapsFetchStub(input: {
  gameId: number
  source: GeoSourceName
  correlationId?: string
}): Promise<{ stub: true; source: GeoSourceName; gameId: number }> {
  const { gameId, source } = input
  log.warn({ gameId, source }, 'stub fetcher invoked — real implementation pending')

  const cfg = await geoSourceConfigRepository.findByName(source)
  await geoIngestAttemptRepository.record({
    gameId,
    source,
    attemptKind: cfg?.kind === 'map' ? 'map' : 'candidates',
    outcome: 'not_found',
    errorCode: 'STUB_NOT_IMPLEMENTED',
    correlationId: input.correlationId,
  })

  await advancePipeline({ gameId, correlationId: input.correlationId, delayMs: 100 })
  return { stub: true, source, gameId }
}
