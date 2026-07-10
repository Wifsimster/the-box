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

// Concrete repository. Implements the domain port plus the create/setCurrent
// helpers the daily-scheduler worker needs and the eligibility queries shared
// by the scheduler (daily pick) and the joker re-roll.
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
    // onConflict().ignore() returns nothing when the row already exists —
    // fall back to a read so the caller always gets the canonical record.
    if (row) return mapChallenge(row)
    const existing = await db('geogamers_challenge')
      .where({ challenge_date: data.challengeDate })
      .first<GeoGamersChallengeRow>()
    return mapChallenge(existing!)
  },

  // Atomically promote `challengeId` to current, demoting any prior current
  // row. The partial unique index geogamers_challenge_one_current rejects two
  // current rows, so both statements must share a transaction.
  async setCurrent(challengeId: number): Promise<void> {
    await db.transaction(async (trx) => {
      await trx('geogamers_challenge')
        .where({ is_current: true })
        .whereNot('id', challengeId)
        .update({ is_current: false })
      await trx('geogamers_challenge').where({ id: challengeId }).update({ is_current: true })
    })
  },

  // Game-cooldown support: which game ids have been featured in the last
  // `days` days. The worker excludes these so the same game isn't reused too
  // soon. Joins meta -> candidate to reach game_id.
  async gameIdsUsedSince(days: number): Promise<number[]> {
    const rows = await db('geogamers_challenge as gc')
      .join('geo_screenshot_meta as m', 'm.id', 'gc.geo_screenshot_meta_id')
      .join('geo_screenshot_candidate as c', 'c.id', 'm.geo_screenshot_candidate_id')
      .where('gc.challenge_date', '>=', db.raw(`CURRENT_DATE - INTERVAL '${days} days'`))
      .distinct<{ game_id: number }[]>('c.game_id')
    return rows.map((r) => r.game_id)
  },

  // Metas eligible to be a challenge: canonical pin (it's a meta), active map,
  // present game, and NEVER previously used as a GeoGamers challenge. Optional
  // game cooldown + single-meta exclusion (for joker re-rolls).
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

  // Joker re-roll: any eligible meta other than the current one. No cooldown
  // (variety for one player, not the day-to-day rotation). Null when none.
  async pickAlternateMeta(excludeMetaId: number): Promise<number | null> {
    const eligible = await this.listEligibleMetas({ excludeMetaId })
    if (eligible.length === 0) return null
    const pick = eligible[Math.floor(Math.random() * eligible.length)]!
    return pick.metaId
  },
}
