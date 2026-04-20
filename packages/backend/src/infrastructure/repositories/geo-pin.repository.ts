import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'
import type { GeoPinStatus, GeoPinSubmission, GeoPoint } from '@the-box/types'

const log = repoLogger.child({ repository: 'geo-pin' })

export interface GeoPinSubmissionRow {
  id: number
  user_id: string
  geo_screenshot_candidate_id: number
  x: number
  y: number
  status: GeoPinStatus
  distance_from_centroid: number | null
  reviewed_at: Date | null
  created_at: Date
}

function mapPin(row: GeoPinSubmissionRow): GeoPinSubmission {
  return {
    id: row.id,
    userId: row.user_id,
    geoScreenshotCandidateId: row.geo_screenshot_candidate_id,
    pin: { x: row.x, y: row.y },
    status: row.status,
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
  }): Promise<GeoPinSubmission | null> {
    log.info(
      { userId: data.userId, candidateId: data.geoScreenshotCandidateId },
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

  async countByUserInWindow(userId: string, intervalSql: string): Promise<number> {
    const result = await db('geo_pin_submission')
      .where({ user_id: userId })
      .where('created_at', '>=', db.raw(`NOW() - INTERVAL '${intervalSql}'`))
      .count<{ count: string }[]>('id as count')
      .first()
    return Number(result?.count ?? 0)
  },

  async userRejectionRatio7d(userId: string): Promise<{ submitted: number; rejected: number }> {
    const rows = await db('geo_pin_submission')
      .where({ user_id: userId })
      .where('created_at', '>=', db.raw(`NOW() - INTERVAL '7 days'`))
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
