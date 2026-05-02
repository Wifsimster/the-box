import type { Knex } from 'knex'
import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'
import type { GeoScreenshotCandidate, GeoScreenshotMeta } from '@the-box/types'

const log = repoLogger.child({ repository: 'geo-screenshot' })

export interface GeoScreenshotCandidateRow {
  id: number
  game_id: number
  geo_map_id: number
  screenshot_id: number | null
  image_url: string
  thumbnail_url: string | null
  source: 'steam' | 'rawg' | 'manual'
  external_id: string | null
  status: 'pending' | 'collecting' | 'promoted' | 'rejected'
  pin_count: number
  is_active: boolean
  created_at: Date
}

export interface GeoScreenshotMetaRow {
  id: number
  geo_screenshot_candidate_id: number
  geo_map_id: number
  canonical_x: number
  canonical_y: number
  confidence: number
  consensus_version: number
  promoted_via: 'consensus' | 'admin'
  promoted_by: string | null
  promoted_at: Date
}

function mapCandidate(row: GeoScreenshotCandidateRow): GeoScreenshotCandidate {
  return {
    id: row.id,
    gameId: row.game_id,
    geoMapId: row.geo_map_id,
    screenshotId: row.screenshot_id ?? undefined,
    imageUrl: row.image_url,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    source: row.source,
    externalId: row.external_id ?? undefined,
    status: row.status,
    pinCount: row.pin_count,
  }
}

function mapMeta(row: GeoScreenshotMetaRow): GeoScreenshotMeta {
  return {
    id: row.id,
    geoScreenshotCandidateId: row.geo_screenshot_candidate_id,
    geoMapId: row.geo_map_id,
    canonical: { x: row.canonical_x, y: row.canonical_y },
    confidence: row.confidence,
    consensusVersion: row.consensus_version,
    promotedVia: row.promoted_via,
  }
}

export const geoScreenshotRepository = {
  async findCandidateById(id: number): Promise<GeoScreenshotCandidate | null> {
    const row = await db('geo_screenshot_candidate').where({ id }).first<GeoScreenshotCandidateRow>()
    return row ? mapCandidate(row) : null
  },

  async findRandomUnlabeledForGame(gameId: number): Promise<GeoScreenshotCandidate | null> {
    const row = await db('geo_screenshot_candidate')
      .where({ game_id: gameId, is_active: true })
      .whereIn('status', ['pending', 'collecting'])
      .orderByRaw('RANDOM()')
      .first<GeoScreenshotCandidateRow>()
    return row ? mapCandidate(row) : null
  },

  async createCandidate(data: {
    gameId: number
    geoMapId: number
    screenshotId?: number
    imageUrl: string
    thumbnailUrl?: string
    source: 'steam' | 'rawg' | 'manual'
    externalId?: string
    contentSha256?: string
  }): Promise<GeoScreenshotCandidate> {
    log.info({ gameId: data.gameId, source: data.source }, 'createCandidate')
    const [row] = await db('geo_screenshot_candidate')
      .insert({
        game_id: data.gameId,
        geo_map_id: data.geoMapId,
        screenshot_id: data.screenshotId ?? null,
        image_url: data.imageUrl,
        thumbnail_url: data.thumbnailUrl ?? null,
        source: data.source,
        external_id: data.externalId ?? null,
        content_sha256: data.contentSha256 ?? null,
      })
      .onConflict(['source', 'external_id'])
      .ignore()
      .returning<GeoScreenshotCandidateRow[]>('*')
    return mapCandidate(row!)
  },

  async findCandidateByContentHash(
    gameId: number,
    contentSha256: string,
  ): Promise<GeoScreenshotCandidate | null> {
    const row = await db('geo_screenshot_candidate')
      .where({ game_id: gameId, content_sha256: contentSha256 })
      .first<GeoScreenshotCandidateRow>()
    return row ? mapCandidate(row) : null
  },

  async incrementPinCount(candidateId: number): Promise<number> {
    const [row] = await db('geo_screenshot_candidate')
      .where({ id: candidateId })
      .increment('pin_count', 1)
      .returning<Array<{ pin_count: number }>>(['pin_count'])
    return row?.pin_count ?? 0
  },

  async setCandidateStatus(
    candidateId: number,
    status: GeoScreenshotCandidateRow['status'],
  ): Promise<void> {
    await db('geo_screenshot_candidate').where({ id: candidateId }).update({ status })
  },

  /**
   * Soft-delete a candidate that isn't suitable for the geo game (e.g. a UI
   * screenshot that has no in-world location). Marks it `rejected` and
   * deactivates it so contributors stop seeing it and the daily picker skips
   * it. Existing pins are kept for audit. Refuses to act if the candidate is
   * already promoted — the admin must demote the meta first.
   */
  async rejectCandidate(
    candidateId: number,
  ): Promise<{ rejected: boolean; alreadyPromoted: boolean }> {
    log.info({ candidateId }, 'rejectCandidate')
    const meta = await db('geo_screenshot_meta')
      .where({ geo_screenshot_candidate_id: candidateId })
      .first<{ id: number }>()
    if (meta) return { rejected: false, alreadyPromoted: true }
    const updated = await db('geo_screenshot_candidate')
      .where({ id: candidateId })
      .update({ status: 'rejected', is_active: false })
    return { rejected: updated > 0, alreadyPromoted: false }
  },

  async findMetaByCandidateId(candidateId: number): Promise<GeoScreenshotMeta | null> {
    const row = await db('geo_screenshot_meta')
      .where({ geo_screenshot_candidate_id: candidateId })
      .first<GeoScreenshotMetaRow>()
    return row ? mapMeta(row) : null
  },

  async findMetaById(id: number): Promise<GeoScreenshotMeta | null> {
    const row = await db('geo_screenshot_meta').where({ id }).first<GeoScreenshotMetaRow>()
    return row ? mapMeta(row) : null
  },

  async promoteCandidateToMeta(data: {
    candidateId: number
    geoMapId: number
    canonicalX: number
    canonicalY: number
    confidence: number
    consensusVersion: number
    promotedVia: 'consensus' | 'admin'
    promotedBy?: string
  }): Promise<GeoScreenshotMeta> {
    log.info({ candidateId: data.candidateId, via: data.promotedVia }, 'promoteCandidateToMeta')

    return await db.transaction(async (trx: Knex.Transaction) => {
      const rows = (await trx('geo_screenshot_meta')
        .insert({
          geo_screenshot_candidate_id: data.candidateId,
          geo_map_id: data.geoMapId,
          canonical_x: data.canonicalX,
          canonical_y: data.canonicalY,
          confidence: data.confidence,
          consensus_version: data.consensusVersion,
          promoted_via: data.promotedVia,
          promoted_by: data.promotedBy ?? null,
        })
        .returning('*')) as GeoScreenshotMetaRow[]

      await trx('geo_screenshot_candidate')
        .where({ id: data.candidateId })
        .update({ status: 'promoted' })

      return mapMeta(rows[0]!)
    })
  },

  async countPromotedForGame(gameId: number): Promise<number> {
    const result = await db('geo_screenshot_meta')
      .join(
        'geo_screenshot_candidate',
        'geo_screenshot_meta.geo_screenshot_candidate_id',
        'geo_screenshot_candidate.id',
      )
      .where('geo_screenshot_candidate.game_id', gameId)
      .where('geo_screenshot_candidate.is_active', true)
      .count<{ count: string }[]>('geo_screenshot_meta.id as count')
      .first()
    return Number(result?.count ?? 0)
  },

  async pickRandomPromotedForGame(
    gameId: number,
    geoMapId?: number,
    excludeMetaIds?: number[],
  ): Promise<GeoScreenshotMeta | null> {
    const q = db('geo_screenshot_meta')
      .join(
        'geo_screenshot_candidate',
        'geo_screenshot_meta.geo_screenshot_candidate_id',
        'geo_screenshot_candidate.id',
      )
      .where('geo_screenshot_candidate.game_id', gameId)
      .where('geo_screenshot_candidate.is_active', true)
      .orderByRaw('RANDOM()')
      .select<GeoScreenshotMetaRow>('geo_screenshot_meta.*')
    if (geoMapId !== undefined) {
      q.where('geo_screenshot_meta.geo_map_id', geoMapId)
    }
    if (excludeMetaIds && excludeMetaIds.length > 0) {
      q.whereNotIn('geo_screenshot_meta.id', excludeMetaIds)
    }
    const row = await q.first()
    return row ? mapMeta(row) : null
  },

  // Catalog of games that the free-play browser can offer: any game whose
  // catalogue contains at least one promoted (consensus-confirmed) screenshot
  // on an active candidate. Returned with the count of enabled maps and the
  // count of playable screenshots so the picker can render badges without an
  // N+1. Ordered by recent activity (most promoted-screenshots first) so the
  // list feels alive.
  async listPlayableGames(): Promise<
    Array<{
      id: number
      name: string
      coverImageUrl: string | null
      mapCount: number
      screenshotCount: number
    }>
  > {
    const rows = await db('games as g')
      .join('geo_screenshot_candidate as gsc', 'gsc.game_id', 'g.id')
      .join('geo_screenshot_meta as gsm', 'gsm.geo_screenshot_candidate_id', 'gsc.id')
      .where('gsc.is_active', true)
      .groupBy('g.id', 'g.name', 'g.cover_image_url')
      .orderByRaw('COUNT(DISTINCT gsm.id) DESC')
      .orderBy('g.name', 'asc')
      .select<
        Array<{
          id: number
          name: string
          cover_image_url: string | null
          screenshot_count: string
          map_count: string
        }>
      >(
        'g.id',
        'g.name',
        'g.cover_image_url',
        db.raw('COUNT(DISTINCT gsm.id) as screenshot_count'),
        db.raw('COUNT(DISTINCT gsm.geo_map_id) as map_count'),
      )
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      coverImageUrl: r.cover_image_url,
      mapCount: Number(r.map_count ?? 0),
      screenshotCount: Number(r.screenshot_count ?? 0),
    }))
  },

  async listCandidatesForReview(args: {
    status?: GeoScreenshotCandidateRow['status']
    gameId?: number
    limit?: number
  }): Promise<GeoScreenshotCandidate[]> {
    const { status, gameId, limit = 50 } = args
    // Join games so the Pins list can show game names without N+1 lookups.
    // The status/gameId filters narrow the set before the join, keeping the
    // query cheap even at full catalog scale.
    const q = db('geo_screenshot_candidate as gsc')
      .leftJoin('games as g', 'g.id', 'gsc.game_id')
      .orderBy('gsc.pin_count', 'desc')
      .limit(limit)
    if (status) q.where('gsc.status', status)
    if (gameId !== undefined) q.where('gsc.game_id', gameId)
    const rows = await q.select<Array<GeoScreenshotCandidateRow & { game_name: string | null }>>(
      'gsc.*',
      'g.name as game_name',
    )
    return rows.map((row) => ({
      ...mapCandidate(row),
      gameName: row.game_name ?? undefined,
    }))
  },

  /**
   * Demote a canonical meta back to an unlabeled candidate. Fails at the DB
   * layer (FK RESTRICT on geo_challenge) if any challenge references it —
   * the caller should surface a 409 so admins explicitly unlink challenges
   * before retrying rather than silently breaking an active day.
   */
  async deleteMeta(metaId: number): Promise<{ deleted: boolean; candidateId?: number }> {
    log.info({ metaId }, 'deleteMeta')
    return await db.transaction(async (trx: Knex.Transaction) => {
      const meta = await trx('geo_screenshot_meta')
        .where({ id: metaId })
        .first<{ id: number; geo_screenshot_candidate_id: number }>()
      if (!meta) return { deleted: false }

      await trx('geo_screenshot_meta').where({ id: metaId }).del()
      await trx('geo_screenshot_candidate')
        .where({ id: meta.geo_screenshot_candidate_id })
        .update({ status: 'collecting' })

      return { deleted: true, candidateId: meta.geo_screenshot_candidate_id }
    })
  },
}
