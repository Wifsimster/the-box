import { queueLogger } from '../../logger/logger.js'
import { geoScreenshotRepository } from '../../repositories/index.js'
import { rankBackfillTargets, type BackfillTarget } from '../../../domain/services/geo-backfill.service.js'
import { runGeoIngestTick } from './geo-ingest-tick-logic.js'

const log = queueLogger.child({ worker: 'geo-backfill-tick' })

const DEFAULT_BATCH = 10
// Coarse cap on how many sub-threshold games the ranker considers per tick.
const CANDIDATE_CAP = 500

export interface BackfillTickResult {
  scanned: number
  enqueuedGames: number
  targets: BackfillTarget[]
}

/**
 * One backfill pass (issue #331, phase 6). Ranks curated+resolved games that
 * aren't eligible yet by distance-to-eligibility and drives the existing
 * ingest tick for the top `batchSize` — concentrating sourcing on the games
 * closest to a first canonical pin. No LLM in-process: it reuses the same
 * ranked query + ingest path an external agent would drive by hand.
 */
export async function runGeoBackfillTick(batchSize = DEFAULT_BATCH): Promise<BackfillTickResult> {
  const candidates = await geoScreenshotRepository.listBackfillCandidates(CANDIDATE_CAP)
  const targets = rankBackfillTargets(candidates, batchSize)

  for (const target of targets) {
    // Per-game ingest cascade — same path as the admin "Run for this game"
    // button and the agent ingest trigger. Idempotent (deterministic jobIds +
    // per-source tombstones), so re-driving a game across ticks is safe.
    await runGeoIngestTick(undefined, target.gameId)
  }

  log.info(
    { scanned: candidates.length, enqueued: targets.length, batchSize },
    'geo-backfill-tick run',
  )
  return { scanned: candidates.length, enqueuedGames: targets.length, targets }
}
