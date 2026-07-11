import { db } from '../../database/connection.js'
import { queueLogger } from '../../logger/logger.js'
import { geoMapRepository, geoScreenshotRepository } from '../../repositories/index.js'
import { buildManualCaptureCandidates } from '../../../domain/services/geo-manual-capture.service.js'

const log = queueLogger.child({ worker: 'geo-manual-capture' })

export interface SeedManualCapturesInput {
  gameId: number
  geoMapId: number
  urls: readonly string[]
}

export interface SeedManualCapturesResult {
  received: number // URLs supplied
  valid: number // URLs that passed validation + in-batch dedup
  inserted: number // rows actually created this run
  skipped: number // valid candidates that already existed (idempotent re-seed)
}

/**
 * Seed curated, geolocatable capture URLs for a game as `source='manual'`
 * candidates against the given map. Idempotent — re-seeding the same URLs is a
 * no-op — and the returned counts distinguish new inserts from already-present
 * rows. Invalid/duplicate URLs are dropped before insertion (see
 * buildManualCaptureCandidates).
 */
export async function seedManualCaptures(
  input: SeedManualCapturesInput,
): Promise<SeedManualCapturesResult> {
  const candidates = buildManualCaptureCandidates(input.urls)
  if (candidates.length === 0) {
    return { received: input.urls.length, valid: 0, inserted: 0, skipped: 0 }
  }

  // The map must exist and belong to this game — never seed captures against a
  // different game's map (the exact class of bug this feature exists to avoid).
  const map = await geoMapRepository.findById(input.geoMapId)
  if (!map || map.gameId !== input.gameId) {
    throw new Error(
      `geoMapId ${input.geoMapId} does not belong to game ${input.gameId}`,
    )
  }

  // Pre-fetch which external ids already exist so the returned counts are
  // accurate on an idempotent re-seed — createCandidate's onConflict-ignore
  // returns the existing row, making insert-vs-conflict indistinguishable from
  // its result alone.
  const externalIds = candidates.map((c) => c.externalId)
  const existingRows = await db('geo_screenshot_candidate')
    .where('source', 'manual')
    .whereIn('external_id', externalIds)
    .select<Array<{ external_id: string }>>('external_id')
  const existing = new Set(existingRows.map((r) => r.external_id))

  let inserted = 0
  for (const c of candidates) {
    if (existing.has(c.externalId)) continue
    await geoScreenshotRepository.createCandidate({
      gameId: input.gameId,
      geoMapId: input.geoMapId,
      imageUrl: c.imageUrl,
      source: 'manual',
      externalId: c.externalId,
    })
    inserted++
  }
  const skipped = candidates.length - inserted
  log.info(
    {
      gameId: input.gameId,
      geoMapId: input.geoMapId,
      received: input.urls.length,
      valid: candidates.length,
      inserted,
      skipped,
    },
    'seeded manual geolocatable captures',
  )
  return { received: input.urls.length, valid: candidates.length, inserted, skipped }
}
