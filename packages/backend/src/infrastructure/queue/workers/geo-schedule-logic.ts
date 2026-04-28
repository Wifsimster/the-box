import { queueLogger } from '../../logger/logger.js'
import { db } from '../../database/connection.js'
import {
  geoChallengeRepository,
  geoScreenshotRepository,
} from '../../repositories/index.js'

const log = queueLogger.child({ worker: 'geo-schedule' })

export interface ScheduleDailyChallengeResult {
  created: boolean
  challengeDate: string
  geoChallengeId?: number
  geoScreenshotMetaId?: number
  reason?: string
}

/**
 * Pick a promoted (canonical) screenshot at random from any game that has
 * one and create a challenge for the given date (defaults to today, since
 * we no longer auto-rotate at midnight). Idempotent on (date, tier=1):
 * re-runs are safe.
 *
 * The slow-rollout model: this used to run from a recurring cron and
 * stamp tomorrow's date. It is now invoked manually by an admin via
 * POST /api/admin/geo/schedule (or the dedicated /release endpoint), and
 * the newly created row is also marked `is_current = true` so the public
 * /api/geo/current endpoint surfaces it immediately. Whatever was
 * previously current is rotated off in the same transaction.
 */
export async function scheduleDailyGeoChallenge(
  date?: string,
): Promise<ScheduleDailyChallengeResult> {
  const target = date ?? today()

  const existing = await geoChallengeRepository.findByDate(target, 1)
  if (existing) {
    // Idempotent re-runs still re-promote to current — useful when an
    // admin clicks "release again" after manually demoting via SQL.
    await geoChallengeRepository.setCurrent({ challengeId: existing.id, tier: 1 })
    return {
      created: false,
      challengeDate: target,
      geoChallengeId: existing.id,
      geoScreenshotMetaId: existing.geoScreenshotMetaId,
      reason: 'already scheduled',
    }
  }

  // Global random over all promoted metas whose candidate is still active
  // (i.e. not deactivated by user reports) AND whose owning map is still
  // enabled. The map filter matters in multi-map mode: an admin can
  // disable a region (say, BG3 Nautiloid) without us needing to also
  // archive every screenshot pinned to it — the schedule picker simply
  // skips them. RANDOM() is fine at pilot scale.
  type Row = { id: number; game_id: number }
  const rows = await db<Row>('geo_screenshot_meta')
    .join(
      'geo_screenshot_candidate',
      'geo_screenshot_meta.geo_screenshot_candidate_id',
      'geo_screenshot_candidate.id',
    )
    .join('geo_map', 'geo_screenshot_meta.geo_map_id', 'geo_map.id')
    .where('geo_screenshot_candidate.is_active', true)
    .andWhere('geo_map.is_active', true)
    .orderByRaw('RANDOM()')
    .limit(1)
    .select<Row[]>(
      'geo_screenshot_meta.id as id',
      'geo_screenshot_candidate.game_id as game_id',
    )
  const pick = rows[0]

  if (!pick) {
    return {
      created: false,
      challengeDate: target,
      reason: 'no promoted screenshots available',
    }
  }

  const meta = await geoScreenshotRepository.findMetaById(pick.id)
  if (!meta) {
    return {
      created: false,
      challengeDate: target,
      reason: 'meta lookup failed',
    }
  }

  const challenge = await geoChallengeRepository.create({
    challengeDate: target,
    geoScreenshotMetaId: meta.id,
    tier: 1,
  })

  await geoChallengeRepository.setCurrent({ challengeId: challenge.id, tier: 1 })

  log.info(
    { challengeDate: target, challengeId: challenge.id, metaId: meta.id },
    'scheduled geo challenge (released as current)',
  )

  return {
    created: true,
    challengeDate: target,
    geoChallengeId: challenge.id,
    geoScreenshotMetaId: meta.id,
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}
