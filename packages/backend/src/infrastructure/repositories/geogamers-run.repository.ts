import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'
import type { Knex } from 'knex'
import type {
  CreateRunInput,
  GeoGamersRunRecord,
  GeoGamersRunRepository,
  UpdateRunInput,
} from '../../domain/services/geogamers.service.js'
import type { GeoGamersGameAttempt } from '@the-box/types'

const log = repoLogger.child({ repository: 'geogamers-run' })

interface GeoGamersRunRow {
  id: number
  geogamers_challenge_id: number
  user_id: string | null
  anonymous_session_id: string | null
  run_token: string
  geo_screenshot_meta_id: number | null
  game_attempts: GeoGamersGameAttempt[] | string
  game_points: number | null
  guess_x: number | null
  guess_y: number | null
  distance: number | null
  location_points: number | null
  total_points: number | null
  score_version: number | null
  time_spent_ms: number
  started_at: Date | string
  completed_at: Date | string | null
  joker_used: boolean
  claimed_at: Date | string | null
  claimed_by_user_id: string | null
}

function toIso(v: Date | string | null): string | null {
  if (v == null) return null
  return v instanceof Date ? v.toISOString() : String(v)
}

function mapRun(row: GeoGamersRunRow): GeoGamersRunRecord {
  // jsonb comes back parsed under pg, but guard for string just in case a
  // driver hands us raw text.
  const attempts =
    typeof row.game_attempts === 'string'
      ? (JSON.parse(row.game_attempts) as GeoGamersGameAttempt[])
      : row.game_attempts
  const guess =
    row.guess_x != null && row.guess_y != null ? { x: row.guess_x, y: row.guess_y } : null
  return {
    id: row.id,
    challengeId: row.geogamers_challenge_id,
    userId: row.user_id,
    anonymousSessionId: row.anonymous_session_id,
    runToken: row.run_token,
    geoScreenshotMetaId: row.geo_screenshot_meta_id,
    gameAttempts: attempts ?? [],
    gamePoints: row.game_points,
    guess,
    distance: row.distance,
    locationPoints: row.location_points,
    totalPoints: row.total_points,
    scoreVersion: row.score_version,
    timeSpentMs: row.time_spent_ms,
    startedAt: toIso(row.started_at)!,
    completedAt: toIso(row.completed_at),
    jokerUsed: row.joker_used,
    claimedAt: toIso(row.claimed_at),
    claimedByUserId: row.claimed_by_user_id,
  }
}

// Translate a domain UpdateRunInput into a snake_case DB patch, only touching
// the columns actually provided.
function toDbPatch(patch: UpdateRunInput): Record<string, unknown> {
  const db_: Record<string, unknown> = {}
  if (patch.gameAttempts !== undefined) db_['game_attempts'] = JSON.stringify(patch.gameAttempts)
  if (patch.gamePoints !== undefined) db_['game_points'] = patch.gamePoints
  if (patch.geoScreenshotMetaId !== undefined) db_['geo_screenshot_meta_id'] = patch.geoScreenshotMetaId
  if (patch.guess !== undefined) {
    db_['guess_x'] = patch.guess?.x ?? null
    db_['guess_y'] = patch.guess?.y ?? null
  }
  if (patch.distance !== undefined) db_['distance'] = patch.distance
  if (patch.locationPoints !== undefined) db_['location_points'] = patch.locationPoints
  if (patch.totalPoints !== undefined) db_['total_points'] = patch.totalPoints
  if (patch.scoreVersion !== undefined) db_['score_version'] = patch.scoreVersion
  if (patch.timeSpentMs !== undefined) db_['time_spent_ms'] = patch.timeSpentMs
  if (patch.completedAt !== undefined) db_['completed_at'] = patch.completedAt
  if (patch.jokerUsed !== undefined) db_['joker_used'] = patch.jokerUsed
  return db_
}

export const geoGamersRunRepository: GeoGamersRunRepository = {
  async findByToken(runToken: string): Promise<GeoGamersRunRecord | null> {
    const row = await db('geogamers_run').where({ run_token: runToken }).first<GeoGamersRunRow>()
    return row ? mapRun(row) : null
  },

  async findRankedForUser(challengeId: number, userId: string): Promise<GeoGamersRunRecord | null> {
    const row = await db('geogamers_run')
      .where({ geogamers_challenge_id: challengeId, user_id: userId })
      .first<GeoGamersRunRow>()
    return row ? mapRun(row) : null
  },

  async create(input: CreateRunInput): Promise<GeoGamersRunRecord> {
    const [row] = await db('geogamers_run')
      .insert({
        geogamers_challenge_id: input.challengeId,
        user_id: input.userId,
        anonymous_session_id: input.anonymousSessionId,
        run_token: input.runToken,
        game_attempts: JSON.stringify([]),
      })
      .returning<GeoGamersRunRow[]>('*')
    return mapRun(row!)
  },

  async update(runId: number, patch: UpdateRunInput): Promise<GeoGamersRunRecord> {
    const [row] = await db('geogamers_run')
      .where({ id: runId })
      .update(toDbPatch(patch))
      .returning<GeoGamersRunRow[]>('*')
    return mapRun(row!)
  },

  async countCompletedBetter(challengeId: number, points: number): Promise<number> {
    const res = await db('geogamers_run')
      .where({ geogamers_challenge_id: challengeId })
      .whereNotNull('completed_at')
      .whereNotNull('user_id')
      .where('total_points', '>', points)
      .count<{ count: string }>('id as count')
      .first()
    return Number(res?.count ?? 0)
  },

  // Copy a completed guest run into a NEW user-owned row and mark the guest
  // row claimed. The unique claim index (claimed_by_user_id, challenge) plus
  // the ranked-run unique index make a double-claim/double-play trip a unique
  // violation, which surfaces as null (caller maps to CLAIM_INVALID/ALREADY).
  async claimGuestRun({ guestRunId, userId, challengeId }): Promise<GeoGamersRunRecord | null> {
    try {
      return await db.transaction(async (trx: Knex.Transaction) => {
        const guest = await trx('geogamers_run')
          .where({ id: guestRunId })
          .whereNull('user_id')
          .whereNull('claimed_at')
          .first<GeoGamersRunRow>()
        if (!guest) return null

        await trx('geogamers_run')
          .where({ id: guestRunId })
          .update({ claimed_at: new Date().toISOString(), claimed_by_user_id: userId })

        const [copy] = await trx('geogamers_run')
          .insert({
            geogamers_challenge_id: challengeId,
            user_id: userId,
            anonymous_session_id: null,
            run_token: globalThis.crypto.randomUUID(),
            geo_screenshot_meta_id: guest.geo_screenshot_meta_id,
            game_attempts:
              typeof guest.game_attempts === 'string'
                ? guest.game_attempts
                : JSON.stringify(guest.game_attempts),
            game_points: guest.game_points,
            guess_x: guest.guess_x,
            guess_y: guest.guess_y,
            distance: guest.distance,
            location_points: guest.location_points,
            total_points: guest.total_points,
            score_version: guest.score_version,
            time_spent_ms: guest.time_spent_ms,
            started_at: guest.started_at,
            completed_at: guest.completed_at,
            joker_used: guest.joker_used,
          })
          .returning<GeoGamersRunRow[]>('*')
        return mapRun(copy!)
      })
    } catch (err) {
      // Unique-violation on claim-once or ranked-run index → not claimable.
      log.warn({ err, guestRunId, userId }, 'claimGuestRun conflict')
      return null
    }
  },
}
