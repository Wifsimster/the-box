import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'
import type {
  GeoPinConfidence,
  GeoPinSource,
  GeoPinStatus,
  GeoPinSubmission,
  GeoPoint,
} from '@the-box/types'

const log = repoLogger.child({ repository: 'geo-pin' })

export interface GeoPinSubmissionRow {
  id: number
  user_id: string | null
  geo_screenshot_candidate_id: number
  x: number
  y: number
  status: GeoPinStatus
  confidence: number | null
  is_anonymous: boolean
  source: GeoPinSource
  agent_key_id: number | null
  agent_rationale: string | null
  agent_model: string | null
  vision_pass: number
  distance_from_centroid: number | null
  reviewed_at: Date | null
  created_at: Date
}

function mapPin(row: GeoPinSubmissionRow): GeoPinSubmission {
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
    source: row.source ?? 'human',
    agentRationale: row.agent_rationale ?? undefined,
    agentModel: row.agent_model ?? undefined,
    visionPass: row.vision_pass ?? undefined,
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

  async submitAgent(data: {
    agentKeyId: number
    geoScreenshotCandidateId: number
    pin: GeoPoint
    source: Exclude<GeoPinSource, 'human'>
    rationale: string
    model?: string
    confidence?: GeoPinConfidence
    visionPass?: number
  }): Promise<GeoPinSubmission | null> {
    log.info(
      {
        agentKeyId: data.agentKeyId,
        candidateId: data.geoScreenshotCandidateId,
        source: data.source,
      },
      'submit agent pin',
    )
    try {
      const [row] = await db('geo_pin_submission')
        .insert({
          user_id: null,
          agent_key_id: data.agentKeyId,
          geo_screenshot_candidate_id: data.geoScreenshotCandidateId,
          x: data.pin.x,
          y: data.pin.y,
          confidence: data.confidence ?? null,
          is_anonymous: false,
          source: data.source,
          agent_rationale: data.rationale,
          agent_model: data.model ?? null,
          vision_pass: data.visionPass ?? 0,
        })
        .returning<GeoPinSubmissionRow[]>('*')
      return row ? mapPin(row) : null
    } catch (err) {
      if ((err as { code?: string }).code === '23505') return null
      throw err
    }
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

  async agentKeyRejectionRatio7d(
    agentKeyId: number,
  ): Promise<{ submitted: number; rejected: number }> {
    const sevenDaysSeconds = 7 * 24 * 60 * 60
    const rows = await db('geo_pin_submission')
      .where({ agent_key_id: agentKeyId })
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

  async userRejectionRatio7d(userId: string): Promise<{ submitted: number; rejected: number }> {
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
