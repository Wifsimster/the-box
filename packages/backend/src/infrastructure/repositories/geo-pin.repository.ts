import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'
import type {
  GeoPinConfidence,
  GeoPinStatus,
  GeoPinSubmission,
  GeoPoint,
} from '@the-box/types'

const log = repoLogger.child({ repository: 'geo-pin' })

export interface GeoPinSubmissionRow {
  id: number
  user_id: string
  geo_screenshot_candidate_id: number
  x: number
  y: number
  status: GeoPinStatus
  confidence: number | null
  is_anonymous: boolean
  distance_from_centroid: number | null
  reviewed_at: Date | null
  created_at: Date
}

function mapPin(row: GeoPinSubmissionRow): GeoPinSubmission {
  // CHECK constraint already restricts confidence to {1,2,3}; the cast
  // is just to match the narrowed wire type without re-validating.
  const confidence =
    row.confidence === 1 || row.confidence === 2 || row.confidence === 3
      ? (row.confidence as GeoPinConfidence)
      : undefined
  return {
    id: row.id,
    userId: row.user_id,
    geoScreenshotCandidateId: row.geo_screenshot_candidate_id,
    pin: { x: row.x, y: row.y },
    status: row.status,
    confidence,
    isAnonymous: row.is_anonymous === true,
    distanceFromCentroid: row.distance_from_centroid ?? undefined,
    reviewedAt: row.reviewed_at?.toISOString(),
    createdAt: row.created_at.toISOString(),
  }
}

export const geoPinRepository = {
  async submit(data: {
    userId: string
    geoScreenshotCandidateId: number
    pin: GeoPoint
    confidence?: GeoPinConfidence
    isAnonymous?: boolean
  }): Promise<GeoPinSubmission | null> {
    log.info(
      {
        userId: data.userId,
        candidateId: data.geoScreenshotCandidateId,
        isAnonymous: data.isAnonymous ?? false,
      },
      'submit pin',
    )

    // ON CONFLICT on the (user_id, candidate_id) unique index: silently no-op
    // so callers can treat duplicate submissions as a benign client retry.
    const [row] = await db('geo_pin_submission')
      .insert({
        user_id: data.userId,
        geo_screenshot_candidate_id: data.geoScreenshotCandidateId,
        x: data.pin.x,
        y: data.pin.y,
        confidence: data.confidence ?? null,
        is_anonymous: data.isAnonymous ?? false,
      })
      .onConflict(['user_id', 'geo_screenshot_candidate_id'])
      .ignore()
      .returning<GeoPinSubmissionRow[]>('*')

    return row ? mapPin(row) : null
  },

  async listByCandidate(candidateId: number): Promise<GeoPinSubmission[]> {
    const rows = await db('geo_pin_submission')
      .where({ geo_screenshot_candidate_id: candidateId })
      .select<GeoPinSubmissionRow[]>('*')
    return rows.map(mapPin)
  },

  async listPendingByCandidate(candidateId: number): Promise<GeoPinSubmission[]> {
    const rows = await db('geo_pin_submission')
      .where({ geo_screenshot_candidate_id: candidateId, status: 'pending' })
      .select<GeoPinSubmissionRow[]>('*')
    return rows.map(mapPin)
  },

  async applyDecision(args: {
    pinId: number
    status: GeoPinStatus
    distanceFromCentroid: number
  }): Promise<void> {
    await db('geo_pin_submission')
      .where({ id: args.pinId })
      .update({
        status: args.status,
        distance_from_centroid: args.distanceFromCentroid,
        reviewed_at: db.fn.now(),
      })
  },

  // Counts pin submissions inside the last `windowSeconds`. The window is a
  // bound numeric parameter (no string interpolation) so this helper can't be
  // turned into a SQL-injection seam by a future caller. Window is clamped
  // to a positive integer to keep the SQL plan honest.
  async countByUserInWindow(userId: string, windowSeconds: number): Promise<number> {
    const seconds = Math.max(1, Math.floor(windowSeconds))
    const result = await db('geo_pin_submission')
      .where({ user_id: userId })
      .where(
        'created_at',
        '>=',
        db.raw(`NOW() - make_interval(secs => ?)`, [seconds]),
      )
      .count<{ count: string }[]>('id as count')
      .first()
    return Number(result?.count ?? 0)
  },

  // Total pins submitted today (UTC). Cheap aggregate read used by the
  // public "X épingles posées aujourd'hui" social-proof counter on the
  // empty/first-run state. Counts every submission regardless of status
  // — a contribution is a contribution, accepted or not.
  async countSinceUtcMidnight(): Promise<number> {
    const result = await db('geo_pin_submission')
      .where(
        'created_at',
        '>=',
        db.raw(`date_trunc('day', NOW() AT TIME ZONE 'UTC')`),
      )
      .count<{ count: string }[]>('id as count')
      .first()
    return Number(result?.count ?? 0)
  },

  async userRejectionRatio7d(userId: string): Promise<{ submitted: number; rejected: number }> {
    // 7 days = 604800 seconds, expressed as a bound parameter for the same
    // reason as countByUserInWindow.
    const sevenDaysSeconds = 7 * 24 * 60 * 60
    const rows = await db('geo_pin_submission')
      .where({ user_id: userId })
      .where(
        'created_at',
        '>=',
        db.raw(`NOW() - make_interval(secs => ?)`, [sevenDaysSeconds]),
      )
      .select<Array<{ status: GeoPinStatus; count: string }>>(
        'status',
        db.raw('COUNT(*) as count'),
      )
      .groupBy('status')

    let submitted = 0
    let rejected = 0
    for (const r of rows) {
      const c = Number(r.count)
      submitted += c
      if (r.status === 'rejected') rejected += c
    }
    return { submitted, rejected }
  },
}
