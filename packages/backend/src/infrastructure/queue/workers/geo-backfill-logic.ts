import { queueLogger } from '../../logger/logger.js'
import { geoScreenshotRepository } from '../../repositories/index.js'
import { rankBackfillTargets, type BackfillTarget } from '../../../domain/services/geo-backfill.service.js'
import { runGeoIngestTick } from './geo-ingest-tick-logic.js'

const log = queueLogger.child({ worker: 'geo-backfill-tick' })

const DEFAULT_BATCH = 10
const CANDIDATE_CAP = 500

export interface BackfillTickResult {
  scanned: number
  enqueuedGames: number
  targets: BackfillTarget[]
}

export async function runGeoBackfillTick(batchSize = DEFAULT_BATCH): Promise<BackfillTickResult> {
  const candidates = await geoScreenshotRepository.listBackfillCandidates(CANDIDATE_CAP)
  const targets = rankBackfillTargets(candidates, batchSize)

  for (const target of targets) {
    await runGeoIngestTick(undefined, target.gameId)
  }

  log.info(
    { scanned: candidates.length, enqueued: targets.length, batchSize },
    'geo-backfill-tick run',
  )
  return { scanned: candidates.length, enqueuedGames: targets.length, targets }
}
