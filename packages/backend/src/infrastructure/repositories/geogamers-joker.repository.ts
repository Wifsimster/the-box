import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'
import type { GeoGamersJokerRepository } from '../../domain/services/geogamers.service.js'

const log = repoLogger.child({ repository: 'geogamers-joker' })

// Once-per-season joker ledger. The (user_id, season_month) primary key is the
// real enforcement; `record` lets a unique violation propagate so the service
// can map a race to JOKER_ALREADY_USED.
export const geoGamersJokerRepository: GeoGamersJokerRepository = {
  async hasUsed(userId: string, seasonMonth: string): Promise<boolean> {
    const row = await db('geogamers_joker')
      .where({ user_id: userId, season_month: seasonMonth })
      .first<{ user_id: string }>()
    return !!row
  },

  async record({ userId, seasonMonth, challengeId, rerolledMetaId }): Promise<void> {
    log.info({ userId, seasonMonth, rerolledMetaId }, 'record joker')
    await db('geogamers_joker').insert({
      user_id: userId,
      season_month: seasonMonth,
      geogamers_challenge_id: challengeId,
      rerolled_geo_screenshot_meta_id: rerolledMetaId,
    })
  },
}
