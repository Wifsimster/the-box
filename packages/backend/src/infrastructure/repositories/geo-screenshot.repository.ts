import type { Knex } from 'knex'
import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'
import type {
  GeoCandidateGameSummary,
  GeoScreenshotCandidate,
  GeoScreenshotMeta,
} from '@the-box/types'

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
    if (row) return mapCandidate(row)

    // Conflict path: the unique (source, external_id) row already exists.
    // Re-fetch instead of dereferencing `row!` (which would crash here).
    const existing = await db('geo_screenshot_candidate')
      .where({ source: data.source, external_id: data.externalId ?? null })
      .first<GeoScreenshotCandidateRow>()
    if (!existing) {
      // The row was inserted-then-deleted between INSERT and SELECT, or
      // the unique constraint shape changed. Treat as a real failure
      // rather than silently returning empty data.
      throw new Error('createCandidate: insert ignored but no existing row')
    }
    return mapCandidate(existing)
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
      realWorldSetting: boolean
    }>
  > {
    const rows = await db('games as g')
      .join('geo_screenshot_candidate as gsc', 'gsc.game_id', 'g.id')
      .join('geo_screenshot_meta as gsm', 'gsm.geo_screenshot_candidate_id', 'gsc.id')
      .where('gsc.is_active', true)
      .groupBy('g.id', 'g.name', 'g.cover_image_url', 'g.real_world_setting')
      .orderByRaw('COUNT(DISTINCT gsm.id) DESC')
      .orderBy('g.name', 'asc')
      .select<
        Array<{
          id: number
          name: string
          cover_image_url: string | null
          real_world_setting: boolean
          screenshot_count: string
          map_count: string
        }>
      >(
        'g.id',
        'g.name',
        'g.cover_image_url',
        'g.real_world_setting',
        db.raw('COUNT(DISTINCT gsm.id) as screenshot_count'),
        db.raw('COUNT(DISTINCT gsm.geo_map_id) as map_count'),
      )
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      coverImageUrl: r.cover_image_url,
      mapCount: Number(r.map_count ?? 0),
      screenshotCount: Number(r.screenshot_count ?? 0),
      realWorldSetting: !!r.real_world_setting,
    }))
  },

  /**
   * Per-game summary for the moderation overview. One row per game that has
   * any candidate (active or not — we still want rejected/promoted counts so
   * the moderator can audit). Counts are computed via conditional aggregates
   * on a single GROUP BY so the totals are honest even when the per-candidate
   * listing is paginated. `oldestPendingAt` drives the default sort: games
   * with the longest-waiting captures float to the top.
   */
  async summarizeCandidatesByGame(args: {
    statusFilter?: GeoScreenshotCandidateRow['status']
    limit?: number
  } = {}): Promise<GeoCandidateGameSummary[]> {
    const { statusFilter, limit = 100 } = args
    const rows = await db('geo_screenshot_candidate as gsc')
      .leftJoin('games as g', 'g.id', 'gsc.game_id')
      .groupBy('gsc.game_id', 'g.name')
      .orderByRaw(
        // Games with the oldest pending capture come first. NULLS LAST so
        // games without any pending captures fall to the bottom regardless
        // of their other counts. Tie-break on pending count desc, then game id
        // for a stable ordering.
        `MIN(CASE WHEN gsc.status = 'pending' THEN gsc.created_at END) ASC NULLS LAST,
         COUNT(*) FILTER (WHERE gsc.status = 'pending') DESC,
         gsc.game_id ASC`,
      )
      .limit(limit)
      .select<
        Array<{
          game_id: number
          game_name: string | null
          collecting_count: string
          pending_count: string
          promoted_count: string
          rejected_count: string
          total_count: string
          oldest_pending_at: Date | null
        }>
      >(
        'gsc.game_id',
        db.raw('g.name as game_name'),
        db.raw(
          `COUNT(*) FILTER (WHERE gsc.status = 'collecting') as collecting_count`,
        ),
        db.raw(
          `COUNT(*) FILTER (WHERE gsc.status = 'pending') as pending_count`,
        ),
        db.raw(
          `COUNT(*) FILTER (WHERE gsc.status = 'promoted') as promoted_count`,
        ),
        db.raw(
          `COUNT(*) FILTER (WHERE gsc.status = 'rejected') as rejected_count`,
        ),
        // Refused captures are soft-deleted (is_active=false) and hidden
        // from the moderation listing, so the "all" filter count must
        // exclude them — otherwise a game with only rejected captures
        // would still show a non-zero badge with nothing to act on.
        db.raw(
          'COUNT(*) FILTER (WHERE gsc.is_active = true) as total_count',
        ),
        db.raw(
          `MIN(CASE WHEN gsc.status = 'pending' THEN gsc.created_at END) as oldest_pending_at`,
        ),
      )

    const summaries: GeoCandidateGameSummary[] = rows.map((r) => ({
      gameId: r.game_id,
      gameName: r.game_name,
      collectingCount: Number(r.collecting_count ?? 0),
      pendingCount: Number(r.pending_count ?? 0),
      promotedCount: Number(r.promoted_count ?? 0),
      rejectedCount: Number(r.rejected_count ?? 0),
      totalCount: Number(r.total_count ?? 0),
      oldestPendingAt: r.oldest_pending_at
        ? new Date(r.oldest_pending_at).toISOString()
        : null,
    }))

    // Status filter is applied AFTER aggregation so a "pending" view only
    // surfaces games that actually have pending captures while still
    // exposing the full counts the row needs to render context (e.g.
    // showing how many promoted captures the same game has).
    if (statusFilter === 'collecting') {
      return summaries.filter((s) => s.collectingCount > 0)
    }
    if (statusFilter === 'pending') {
      return summaries.filter((s) => s.pendingCount > 0)
    }
    if (statusFilter === 'promoted') {
      return summaries.filter((s) => s.promotedCount > 0)
    }
    if (statusFilter === 'rejected') {
      return summaries.filter((s) => s.rejectedCount > 0)
    }
    return summaries
  },

  /**
   * The "one pin away" diagnostic. Games that have an active map and captures
   * still collecting pins (pending/collecting, active) but NO canonical pin yet
   * — i.e. promoting one of their candidates would grow the GeoGamers-eligible
   * pool by one (assuming the game has never been a challenge). Games that
   * already have a promoted meta are excluded: their content exists, so they
   * don't need pinning effort.
   *
   * Per game we surface the candidate count and the single best candidate (most
   * pins, ties broken by id), so the admin card can deep-link straight to the
   * capture closest to promotion. Ordered by top pin count desc so the games
   * nearest the next consensus recompute float to the top.
   */
  async listGamesNeedingContent(limit = 25): Promise<
    Array<{
      gameId: number
      gameName: string | null
      candidateCount: number
      topPinCount: number
      bestCandidateId: number | null
    }>
  > {
    const result = await db.raw<{
      rows: Array<{
        game_id: number
        game_name: string | null
        candidate_count: string
        top_pin_count: string
        best_candidate_id: number | null
      }>
    }>(
      `
      SELECT
        g.id AS game_id,
        g.name AS game_name,
        stats.candidate_count,
        stats.top_pin_count,
        best.id AS best_candidate_id
      FROM games g
      JOIN LATERAL (
        SELECT
          COUNT(*) AS candidate_count,
          COALESCE(MAX(c.pin_count), 0) AS top_pin_count
        FROM geo_screenshot_candidate c
        WHERE c.game_id = g.id
          AND c.is_active = true
          AND c.status IN ('pending', 'collecting')
      ) stats ON stats.candidate_count > 0
      LEFT JOIN LATERAL (
        SELECT c.id
        FROM geo_screenshot_candidate c
        WHERE c.game_id = g.id
          AND c.is_active = true
          AND c.status IN ('pending', 'collecting')
        ORDER BY c.pin_count DESC, c.id ASC
        LIMIT 1
      ) best ON true
      WHERE EXISTS (
        SELECT 1 FROM geo_map m WHERE m.game_id = g.id AND m.is_active = true
      )
      AND NOT EXISTS (
        SELECT 1
        FROM geo_screenshot_meta sm
        JOIN geo_screenshot_candidate cc ON cc.id = sm.geo_screenshot_candidate_id
        WHERE cc.game_id = g.id AND cc.is_active = true
      )
      ORDER BY stats.top_pin_count DESC, stats.candidate_count DESC, g.id ASC
      LIMIT ?
      `,
      [limit],
    )
    return result.rows.map((r) => ({
      gameId: r.game_id,
      gameName: r.game_name,
      candidateCount: Number(r.candidate_count ?? 0),
      topPinCount: Number(r.top_pin_count ?? 0),
      bestCandidateId: r.best_candidate_id ?? null,
    }))
  },

  /**
   * Candidates for the backfill discovery worker (issue #331, phase 6):
   * curated + metadata-resolved games (so the ingest pipeline can act on them)
   * that are NOT yet eligible — i.e. have no promoted meta on any active
   * candidate. Returns the raw signals the ranking needs (active map? captures
   * collecting pins? top pin count?); the pure `rankBackfillTargets` decides
   * ordering. Coarsely pre-sorted + capped so a huge catalog doesn't fetch the
   * whole table.
   */
  async listBackfillCandidates(limit = 500): Promise<
    Array<{
      gameId: number
      hasActiveMap: boolean
      candidateCount: number
      topPinCount: number
    }>
  > {
    const result = await db.raw<{
      rows: Array<{
        game_id: number
        has_active_map: boolean
        candidate_count: string
        top_pin_count: string
      }>
    }>(
      `
      SELECT
        g.id AS game_id,
        EXISTS (
          SELECT 1 FROM geo_map m WHERE m.game_id = g.id AND m.is_active = true
        ) AS has_active_map,
        COALESCE(stats.candidate_count, 0) AS candidate_count,
        COALESCE(stats.top_pin_count, 0) AS top_pin_count
      FROM games g
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS candidate_count,
          COALESCE(MAX(c.pin_count), 0) AS top_pin_count
        FROM geo_screenshot_candidate c
        WHERE c.game_id = g.id
          AND c.is_active = true
          AND c.status IN ('pending', 'collecting')
      ) stats ON true
      WHERE g.geo_curated = true
        AND g.geo_metadata_status = 'resolved'
        AND NOT EXISTS (
          SELECT 1
          FROM geo_screenshot_meta sm
          JOIN geo_screenshot_candidate cc ON cc.id = sm.geo_screenshot_candidate_id
          WHERE cc.game_id = g.id AND cc.is_active = true
        )
      ORDER BY top_pin_count DESC, has_active_map DESC, g.id ASC
      LIMIT ?
      `,
      [limit],
    )
    return result.rows.map((r) => ({
      gameId: r.game_id,
      hasActiveMap: r.has_active_map === true,
      candidateCount: Number(r.candidate_count ?? 0),
      topPinCount: Number(r.top_pin_count ?? 0),
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
    // Refused captures soft-delete to is_active=false (see rejectCandidate).
    // Hide them from the moderation listing so the queue, the per-game drill-
    // down, and the prev/next picker stop re-surfacing a capture the
    // moderator just refused. An explicit `status='rejected'` request still
    // returns those rows so audit flows can opt in.
    if (status === 'rejected') {
      q.where('gsc.status', 'rejected')
    } else {
      q.where('gsc.is_active', true)
      if (status) q.where('gsc.status', status)
    }
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
