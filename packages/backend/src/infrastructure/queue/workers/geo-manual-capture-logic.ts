import { queueLogger } from '../../logger/logger.js'
import { geoScreenshotRepository } from '../../repositories/index.js'
import { buildManualCaptureCandidates } from '../../../domain/services/geo-manual-capture.service.js'

const log = queueLogger.child({ worker: 'geo-manual-capture' })

export interface SeedManualCapturesInput {
  gameId: number
  geoMapId: number
  urls: readonly string[]
}

export interface SeedManualCapturesResult {
  received: number
  valid: number
  inserted: number
}

/**
 * Seed curated, geolocatable capture URLs for a game as `source='manual'`
 * candidates against the given map. Idempotent: createCandidate's
 * (source, external_id) unique index means re-seeding the same URLs inserts
 * nothing new. Invalid/duplicate URLs are dropped before insertion (see
 * buildManualCaptureCandidates).
 */
export async function seedManualCaptures(
  input: SeedManualCapturesInput,
): Promise<SeedManualCapturesResult> {
  const candidates = buildManualCaptureCandidates(input.urls)
  let inserted = 0
  for (const c of candidates) {
    await geoScreenshotRepository.createCandidate({
      gameId: input.gameId,
      geoMapId: input.geoMapId,
      imageUrl: c.imageUrl,
      source: 'manual',
      externalId: c.externalId,
    })
    inserted++
  }
  log.info(
    { gameId: input.gameId, geoMapId: input.geoMapId, received: input.urls.length, valid: candidates.length },
    'seeded manual geolocatable captures',
  )
  return { received: input.urls.length, valid: candidates.length, inserted }
}
