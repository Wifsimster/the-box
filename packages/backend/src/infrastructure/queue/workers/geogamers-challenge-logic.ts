import { queueLogger } from '../../logger/logger.js'
import { env } from '../../../config/env.js'
import { geoGamersChallengeRepository } from '../../repositories/geogamers-challenge.repository.js'

const log = queueLogger.child({ module: 'geogamers-challenge' })

export interface GeoGamersChallengeResult {
  created: boolean
  skipped?: 'ALREADY_EXISTS' | 'INSUFFICIENT_CONTENT'
  challengeId?: number
  challengeDate: string
  geoScreenshotMetaId?: number
  eligibleGames?: number
  message: string
}

function getTodayDateUTC(referenceMs?: number): string {
  const ref = typeof referenceMs === 'number' ? new Date(referenceMs) : new Date()
  return ref.toISOString().split('T')[0]!
}

export async function createGeoGamersChallenge(options?: {
  referenceMs?: number
  targetDate?: string
}): Promise<GeoGamersChallengeResult> {
  const challengeDate = options?.targetDate ?? getTodayDateUTC(options?.referenceMs)
  log.info({ challengeDate }, 'creating geogamers challenge')

  const existing = await geoGamersChallengeRepository.findByDate(challengeDate)
  if (existing) {
    log.info({ challengeId: existing.id, challengeDate }, 'challenge already exists, skipping')
    return {
      created: false,
      skipped: 'ALREADY_EXISTS',
      challengeId: existing.id,
      challengeDate,
      message: `GeoGamers challenge already exists for ${challengeDate}`,
    }
  }

  const cooldownDays = Number(env.GEOGAMERS_GAME_COOLDOWN_DAYS) || 14
  const minGames = Number(env.GEOGAMERS_MIN_ELIGIBLE_GAMES) || 10
  const cooldownGameIds = await geoGamersChallengeRepository.gameIdsUsedSince(cooldownDays)

  const eligible = await geoGamersChallengeRepository.listEligibleMetas({ cooldownGameIds })
  const distinctGames = new Set(eligible.map((r) => r.gameId)).size

  if (distinctGames < minGames) {
    log.warn(
      { challengeDate, distinctGames, minGames, cooldownDays },
      'GeoGamers content starved: not enough eligible games — skipping challenge creation',
    )
    return {
      created: false,
      skipped: 'INSUFFICIENT_CONTENT',
      challengeDate,
      eligibleGames: distinctGames,
      message: `Only ${distinctGames} eligible games (need ${minGames}); skipped ${challengeDate}`,
    }
  }

  const pick = eligible[Math.floor(Math.random() * eligible.length)]!
  const challenge = await geoGamersChallengeRepository.create({
    challengeDate,
    geoScreenshotMetaId: pick.metaId,
  })
  await geoGamersChallengeRepository.setCurrent(challenge.id)

  log.info(
    { challengeId: challenge.id, challengeDate, metaId: pick.metaId, eligibleGames: distinctGames },
    'geogamers challenge created and set current',
  )
  return {
    created: true,
    challengeId: challenge.id,
    challengeDate,
    geoScreenshotMetaId: pick.metaId,
    eligibleGames: distinctGames,
    message: `Created GeoGamers challenge for ${challengeDate}`,
  }
}
