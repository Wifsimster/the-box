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
 * one and create tomorrow's — or a given date's — geo challenge. Idempotent
 * on (date, tier=1): re-runs are safe.
 *
 * Intentionally simple: the MVP pilots on a single game, so global-random
 * effectively picks among Elden Ring's promoted entries. When we open a
 * second game, this can be replaced with a rotation strategy.
 */
export async function scheduleDailyGeoChallenge(
  date?: string,
): Promise<ScheduleDailyChallengeResult> {
  const target = date ?? isoDate(tomorrow())

  const existing = await geoChallengeRepository.findByDate(target, 1)
  if (existing) {
    return {
      created: false,
      challengeDate: target,
      geoChallengeId: existing.id,
      geoScreenshotMetaId: existing.geoScreenshotMetaId,
      reason: 'already scheduled',
    }
  }

  // Global random over all promoted metas whose candidate is still active
  // (i.e. not deactivated by user reports). RANDOM() is fine at pilot scale.
  type Row = { id: number; game_id: number }
  const rows = await db<Row>('geo_screenshot_meta')
    .join(
      'geo_screenshot_candidate',
      'geo_screenshot_meta.geo_screenshot_candidate_id',
      'geo_screenshot_candidate.id',
    )
    .where('geo_screenshot_candidate.is_active', true)
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

  log.info(
    { challengeDate: target, challengeId: challenge.id, metaId: meta.id },
    'scheduled geo challenge',
  )

  return {
    created: true,
    challengeDate: target,
    geoChallengeId: challenge.id,
    geoScreenshotMetaId: meta.id,
  }
}

function tomorrow(): Date {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 1)
  return d
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}
