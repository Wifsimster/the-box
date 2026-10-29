import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'
import type {
  GeoGamersChallengeRecord,
  GeoGamersChallengeRepository,
} from '../../domain/services/geogamers.service.js'

const log = repoLogger.child({ repository: 'geogamers-challenge' })

interface GeoGamersChallengeRow {
  id: number
  challenge_date: Date | string
  geo_screenshot_meta_id: number
  is_current: boolean
  created_at: Date
}

function mapChallenge(row: GeoGamersChallengeRow): GeoGamersChallengeRecord {
  return {
    id: row.id,
    challengeDate:
      row.challenge_date instanceof Date
        ? row.challenge_date.toISOString().slice(0, 10)
        : String(row.challenge_date).slice(0, 10),
    geoScreenshotMetaId: row.geo_screenshot_meta_id,
  }
}

export interface EligibleMeta {
  metaId: number
  gameId: number
}

export const geoGamersChallengeRepository: GeoGamersChallengeRepository & {
  create(data: { challengeDate: string; geoScreenshotMetaId: number }): Promise<GeoGamersChallengeRecord>
  setCurrent(challengeId: number): Promise<void>
  gameIdsUsedSince(days: number): Promise<number[]>
  listEligibleMetas(opts: { cooldownGameIds?: number[]; excludeMetaId?: number }): Promise<EligibleMeta[]>
  pickAlternateMeta(excludeMetaId: number): Promise<number | null>
} = {
  async findCurrent(): Promise<GeoGamersChallengeRecord | null> {
    const row = await db('geogamers_challenge')
      .where({ is_current: true })
      .first<GeoGamersChallengeRow>()
    return row ? mapChallenge(row) : null
  },

  async findByDate(date: string): Promise<GeoGamersChallengeRecord | null> {
    const row = await db('geogamers_challenge')
      .where({ challenge_date: date })
      .first<GeoGamersChallengeRow>()
    return row ? mapChallenge(row) : null
  },

  async create(data): Promise<GeoGamersChallengeRecord> {
    log.info({ date: data.challengeDate }, 'create geogamers challenge')
    const [row] = await db('geogamers_challenge')
      .insert({
        challenge_date: data.challengeDate,
        geo_screenshot_meta_id: data.geoScreenshotMetaId,
      })
      .onConflict('challenge_date')
      .ignore()
      .returning<GeoGamersChallengeRow[]>('*')
    if (row) return mapChallenge(row)
    const existing = await db('geogamers_challenge')
      .where({ challenge_date: data.challengeDate })
      .first<GeoGamersChallengeRow>()
    return mapChallenge(existing!)
  },

  async setCurrent(challengeId: number): Promise<void> {
    await db.transaction(async (trx) => {
      await trx('geogamers_challenge')
        .where({ is_current: true })
        .whereNot('id', challengeId)
        .update({ is_current: false })
      await trx('geogamers_challenge').where({ id: challengeId }).update({ is_current: true })
    })
  },

  async gameIdsUsedSince(days: number): Promise<number[]> {
    const rows = await db('geogamers_challenge as gc')
      .join('geo_screenshot_meta as m', 'm.id', 'gc.geo_screenshot_meta_id')
      .join('geo_screenshot_candidate as c', 'c.id', 'm.geo_screenshot_candidate_id')
      .where('gc.challenge_date', '>=', db.raw(`CURRENT_DATE - INTERVAL '${days} days'`))
      .distinct<{ game_id: number }[]>('c.game_id')
    return rows.map((r) => r.game_id)
  },

  async listEligibleMetas({ cooldownGameIds = [], excludeMetaId }): Promise<EligibleMeta[]> {
    const q = db('geo_screenshot_meta as m')
      .join('geo_screenshot_candidate as c', 'c.id', 'm.geo_screenshot_candidate_id')
      .join('geo_map as map', function joinMap() {
        this.on('map.id', '=', 'm.geo_map_id').andOn('map.is_active', '=', db.raw('true'))
      })
      .join('games as g', 'g.id', 'c.game_id')
      .whereNotExists(function usedBefore() {
        this.select(db.raw('1'))
          .from('geogamers_challenge as gc')
          .whereRaw('gc.geo_screenshot_meta_id = m.id')
      })
    if (cooldownGameIds.length > 0) q.whereNotIn('c.game_id', cooldownGameIds)
    if (excludeMetaId != null) q.whereNot('m.id', excludeMetaId)
    const rows = await q.select<Array<{ meta_id: number; game_id: number }>>(
      'm.id as meta_id',
      'c.game_id',
    )
    return rows.map((r) => ({ metaId: r.meta_id, gameId: r.game_id }))
  },

  async pickAlternateMeta(excludeMetaId: number): Promise<number | null> {
    const eligible = await this.listEligibleMetas({ excludeMetaId })
    if (eligible.length === 0) return null
    const pick = eligible[Math.floor(Math.random() * eligible.length)]!
    return pick.metaId
  },
}
