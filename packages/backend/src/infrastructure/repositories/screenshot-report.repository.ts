import type { Knex } from 'knex'
import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'
import type { ScreenshotReportReason } from '@the-box/types'

const log = repoLogger.child({ repository: 'screenshot-report' })

export interface ScreenshotReportRow {
  id: number
  user_id: string
  screenshot_id: number | null
  geo_screenshot_candidate_id: number | null
  reason: ScreenshotReportReason
  details: string | null
  created_at: Date
}

export interface SubmitReportArgs {
  userId: string
  reason: ScreenshotReportReason
  details?: string
  screenshotId?: number
  geoScreenshotCandidateId?: number
}

export interface SubmitReportOutcome {
  inserted: boolean
  reportCount: number
  deactivated: boolean
}

// Three independent users flagging the same capture is enough signal to pull
// it out of rotation; admins can re-enable later if it was a false positive.
export const REPORT_DEACTIVATION_THRESHOLD = 3

export const screenshotReportRepository = {
  async submit(args: SubmitReportArgs): Promise<SubmitReportOutcome> {
    if (
      (args.screenshotId == null && args.geoScreenshotCandidateId == null) ||
      (args.screenshotId != null && args.geoScreenshotCandidateId != null)
    ) {
      throw new Error('exactly one of screenshotId or geoScreenshotCandidateId is required')
    }

    return await db.transaction(async (trx: Knex.Transaction) => {
      // Insert with ON CONFLICT DO NOTHING via the partial unique indexes from
      // the migration. We can't use knex's onConflict() builder because the
      // unique index is partial; raw insert + catch dup-key would also work
      // but the count query gives us idempotent semantics either way.
      const inserted = await trx('screenshot_reports')
        .insert({
          user_id: args.userId,
          screenshot_id: args.screenshotId ?? null,
          geo_screenshot_candidate_id: args.geoScreenshotCandidateId ?? null,
          reason: args.reason,
          details: args.details ?? null,
        })
        .onConflict()
        .ignore()
        .returning<{ id: number }[]>('id')

      const didInsert = inserted.length > 0

      const target = args.screenshotId
        ? { column: 'screenshot_id', value: args.screenshotId }
        : { column: 'geo_screenshot_candidate_id', value: args.geoScreenshotCandidateId! }

      const countRow = await trx('screenshot_reports')
        .where(target.column, target.value)
        .count<{ count: string }[]>('id as count')
        .first()
      const reportCount = Number(countRow?.count ?? 0)

      let deactivated = false
      if (reportCount >= REPORT_DEACTIVATION_THRESHOLD) {
        deactivated = await deactivateTarget(trx, args)
      }

      if (didInsert) {
        log.info(
          {
            userId: args.userId,
            screenshotId: args.screenshotId,
            geoScreenshotCandidateId: args.geoScreenshotCandidateId,
            reason: args.reason,
            reportCount,
            deactivated,
          },
          'screenshot report recorded',
        )
      }

      return { inserted: didInsert, reportCount, deactivated }
    })
  },

  async countForScreenshot(screenshotId: number): Promise<number> {
    const row = await db('screenshot_reports')
      .where({ screenshot_id: screenshotId })
      .count<{ count: string }[]>('id as count')
      .first()
    return Number(row?.count ?? 0)
  },

  async countForGeoCandidate(candidateId: number): Promise<number> {
    const row = await db('screenshot_reports')
      .where({ geo_screenshot_candidate_id: candidateId })
      .count<{ count: string }[]>('id as count')
      .first()
    return Number(row?.count ?? 0)
  },

  // Admin-facing aggregate: one row per reported target, with total count and
  // most recent reason/details. Used to power the moderation queue. Filtering
  // by `onlyDeactivated` lets admins focus on captures already pulled from
  // rotation; the default returns everything so they can intervene before the
  // threshold trips when needed.
  async listAggregated(args: {
    limit?: number
    onlyDeactivated?: boolean
  }): Promise<AdminReportSummary[]> {
    const { limit = 100, onlyDeactivated = false } = args

    const rows = await db('screenshot_reports as r')
      .leftJoin('screenshots as s', 's.id', 'r.screenshot_id')
      .leftJoin('geo_screenshot_candidate as g', 'g.id', 'r.geo_screenshot_candidate_id')
      .select<RawAdminReportRow[]>(
        db.raw('r.screenshot_id as screenshot_id'),
        db.raw('r.geo_screenshot_candidate_id as geo_screenshot_candidate_id'),
        db.raw('s.is_active as screenshot_is_active'),
        db.raw('g.is_active as geo_candidate_is_active'),
        db.raw('count(r.id)::int as count'),
        db.raw('max(r.created_at) as last_reported_at'),
      )
      .groupBy(
        'r.screenshot_id',
        'r.geo_screenshot_candidate_id',
        's.is_active',
        'g.is_active',
      )
      .orderBy('count', 'desc')
      .limit(limit)

    let summaries = rows.map<AdminReportSummary>((row) => {
      const active =
        row.screenshot_id != null
          ? !!row.screenshot_is_active
          : !!row.geo_candidate_is_active
      return {
        screenshotId: row.screenshot_id ?? undefined,
        geoScreenshotCandidateId: row.geo_screenshot_candidate_id ?? undefined,
        reportCount: Number(row.count),
        lastReportedAt:
          row.last_reported_at instanceof Date
            ? row.last_reported_at.toISOString()
            : String(row.last_reported_at),
        isActive: active,
      }
    })

    if (onlyDeactivated) {
      summaries = summaries.filter((s) => !s.isActive)
    }
    return summaries
  },

  // Re-enable a target an admin reviewed and judged a false positive. We don't
  // delete the underlying reports — they stay as audit trail, but a flag is
  // flipped so the capture is back in rotation. Re-reports past the threshold
  // will deactivate it again.
  async reactivate(args: {
    screenshotId?: number
    geoScreenshotCandidateId?: number
  }): Promise<{ reactivated: boolean }> {
    if (
      (args.screenshotId == null && args.geoScreenshotCandidateId == null) ||
      (args.screenshotId != null && args.geoScreenshotCandidateId != null)
    ) {
      throw new Error('exactly one of screenshotId or geoScreenshotCandidateId is required')
    }

    return await db.transaction(async (trx: Knex.Transaction) => {
      let reactivated = false

      if (args.screenshotId != null) {
        const updated = await trx('screenshots')
          .where({ id: args.screenshotId, is_active: false })
          .update({ is_active: true })
        if (updated > 0) reactivated = true
        // Also drop the reports so a single 3-report wave doesn't immediately
        // re-trip the threshold; leaving the audit trail in place would be
        // nicer but we'd need a separate `resolved_at` column for that.
        await trx('screenshot_reports').where({ screenshot_id: args.screenshotId }).del()
      }

      if (args.geoScreenshotCandidateId != null) {
        const updated = await trx('geo_screenshot_candidate')
          .where({ id: args.geoScreenshotCandidateId, is_active: false })
          .update({ is_active: true })
        if (updated > 0) reactivated = true
        await trx('screenshot_reports')
          .where({ geo_screenshot_candidate_id: args.geoScreenshotCandidateId })
          .del()
      }

      log.info({ ...args, reactivated }, 'screenshot report reactivated')
      return { reactivated }
    })
  },
}

export interface AdminReportSummary {
  screenshotId?: number
  geoScreenshotCandidateId?: number
  reportCount: number
  lastReportedAt: string
  isActive: boolean
}

interface RawAdminReportRow {
  screenshot_id: number | null
  geo_screenshot_candidate_id: number | null
  screenshot_is_active: boolean | null
  geo_candidate_is_active: boolean | null
  count: number
  last_reported_at: Date
}

// Deactivate both the geo candidate (if applicable) and any linked main
// screenshot row, so the capture is filtered out of every selection path.
// Returns whether any row was actually flipped from active → inactive on
// this call (idempotent for re-runs past the threshold).
async function deactivateTarget(
  trx: Knex.Transaction,
  args: SubmitReportArgs,
): Promise<boolean> {
  let flipped = false

  if (args.screenshotId != null) {
    const updated = await trx('screenshots')
      .where({ id: args.screenshotId, is_active: true })
      .update({ is_active: false })
    if (updated > 0) flipped = true
  }

  if (args.geoScreenshotCandidateId != null) {
    const candidate = await trx('geo_screenshot_candidate')
      .where({ id: args.geoScreenshotCandidateId })
      .first<{ id: number; screenshot_id: number | null; is_active: boolean }>()

    if (candidate) {
      if (candidate.is_active) {
        await trx('geo_screenshot_candidate')
          .where({ id: candidate.id })
          .update({ is_active: false })
        flipped = true
      }
      // Cascade: if this candidate references a main screenshot, take that
      // out of rotation too so the daily-game picker honors the report.
      if (candidate.screenshot_id != null) {
        const updated = await trx('screenshots')
          .where({ id: candidate.screenshot_id, is_active: true })
          .update({ is_active: false })
        if (updated > 0) flipped = true
      }
    }
  }

  return flipped
}
