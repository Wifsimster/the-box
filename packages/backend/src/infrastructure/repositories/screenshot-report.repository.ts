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

  // Admin-facing aggregate: one row per reported target, enriched with the
  // capture preview (image + game name) and a reason breakdown so moderators
  // can act on a report without leaving the panel. `onlyDeactivated` focuses
  // the queue on captures already pulled from rotation; the default returns
  // everything so admins can intervene before the threshold trips.
  async listAggregated(args: {
    limit?: number
    onlyDeactivated?: boolean
  }): Promise<AdminReportSummary[]> {
    const { limit = 100, onlyDeactivated = false } = args

    const rows = await db('screenshot_reports as r')
      .leftJoin('screenshots as s', 's.id', 'r.screenshot_id')
      .leftJoin('games as sg', 'sg.id', 's.game_id')
      .leftJoin('geo_screenshot_candidate as g', 'g.id', 'r.geo_screenshot_candidate_id')
      .leftJoin('games as gg', 'gg.id', 'g.game_id')
      .select<RawAdminReportRow[]>(
        db.raw('r.screenshot_id as screenshot_id'),
        db.raw('r.geo_screenshot_candidate_id as geo_screenshot_candidate_id'),
        db.raw('s.is_active as screenshot_is_active'),
        db.raw('g.is_active as geo_candidate_is_active'),
        // COALESCE to the geo URL when this is a geo-only candidate (no
        // linked main screenshot row).
        db.raw('COALESCE(s.image_url, g.image_url) as image_url'),
        db.raw('COALESCE(s.thumbnail_url, g.thumbnail_url) as thumbnail_url'),
        db.raw('COALESCE(sg.name, gg.name) as game_name'),
        db.raw('count(r.id)::int as count'),
        db.raw('max(r.created_at) as last_reported_at'),
      )
      .groupBy(
        'r.screenshot_id',
        'r.geo_screenshot_candidate_id',
        's.is_active',
        'g.is_active',
        's.image_url',
        'g.image_url',
        's.thumbnail_url',
        'g.thumbnail_url',
        'sg.name',
        'gg.name',
      )
      .orderBy('count', 'desc')
      .limit(limit)

    // Reason breakdown is fetched in a single follow-up query and merged in
    // memory; cheaper than a window function and keeps the SQL readable.
    const reasonRows = await db('screenshot_reports')
      .select<ReasonBreakdownRow[]>(
        db.raw('screenshot_id as screenshot_id'),
        db.raw('geo_screenshot_candidate_id as geo_screenshot_candidate_id'),
        'reason',
        db.raw('count(*)::int as count'),
      )
      .groupBy('screenshot_id', 'geo_screenshot_candidate_id', 'reason')

    const reasonsByKey = new Map<string, Partial<Record<ScreenshotReportReason, number>>>()
    for (const r of reasonRows) {
      const reason = r.reason as ScreenshotReportReason
      const key =
        r.screenshot_id != null
          ? `s:${r.screenshot_id}`
          : `g:${r.geo_screenshot_candidate_id}`
      const bucket = reasonsByKey.get(key) ?? {}
      bucket[reason] = Number(r.count)
      reasonsByKey.set(key, bucket)
    }

    let summaries = rows.map<AdminReportSummary>((row) => {
      const active =
        row.screenshot_id != null
          ? !!row.screenshot_is_active
          : !!row.geo_candidate_is_active
      const key =
        row.screenshot_id != null
          ? `s:${row.screenshot_id}`
          : `g:${row.geo_screenshot_candidate_id}`
      return {
        screenshotId: row.screenshot_id ?? undefined,
        geoScreenshotCandidateId: row.geo_screenshot_candidate_id ?? undefined,
        reportCount: Number(row.count),
        lastReportedAt:
          row.last_reported_at instanceof Date
            ? row.last_reported_at.toISOString()
            : String(row.last_reported_at),
        isActive: active,
        imageUrl: row.image_url ?? undefined,
        thumbnailUrl: row.thumbnail_url ?? undefined,
        gameName: row.game_name ?? undefined,
        reasons: reasonsByKey.get(key) ?? {},
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
  imageUrl?: string
  thumbnailUrl?: string
  gameName?: string
  // Partial map: only reasons that have at least one report appear as keys.
  reasons: Partial<Record<ScreenshotReportReason, number>>
}

interface RawAdminReportRow {
  screenshot_id: number | null
  geo_screenshot_candidate_id: number | null
  screenshot_is_active: boolean | null
  geo_candidate_is_active: boolean | null
  image_url: string | null
  thumbnail_url: string | null
  game_name: string | null
  count: number
  last_reported_at: Date
}

interface ReasonBreakdownRow {
  screenshot_id: number | null
  geo_screenshot_candidate_id: number | null
  reason: ScreenshotReportReason
  count: number
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
