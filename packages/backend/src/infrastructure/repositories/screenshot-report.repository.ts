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
