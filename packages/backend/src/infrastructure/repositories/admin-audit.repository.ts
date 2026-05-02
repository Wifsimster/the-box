import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'

const log = repoLogger.child({ repository: 'admin-audit' })

export interface AdminAuditEntry {
  adminId: string
  action: string
  targetKind: string
  targetId?: string | number | null
  before?: unknown
  after?: unknown
  requestId?: string | null
  ip?: string | null
}

export interface AdminAuditRow {
  id: string
  adminId: string
  action: string
  targetKind: string
  targetId: string | null
  before: unknown
  after: unknown
  requestId: string | null
  ip: string | null
  createdAt: string
}

interface DbRow {
  id: string | number
  admin_id: string
  action: string
  target_kind: string
  target_id: string | null
  before: unknown
  after: unknown
  request_id: string | null
  ip: string | null
  created_at: Date
}

function rowTo(row: DbRow): AdminAuditRow {
  return {
    id: String(row.id),
    adminId: row.admin_id,
    action: row.action,
    targetKind: row.target_kind,
    targetId: row.target_id,
    before: row.before,
    after: row.after,
    requestId: row.request_id,
    ip: row.ip,
    createdAt: row.created_at.toISOString(),
  }
}

export const adminAuditRepository = {
  async record(entry: AdminAuditEntry): Promise<void> {
    try {
      await db('admin_audit_log').insert({
        admin_id: entry.adminId,
        action: entry.action,
        target_kind: entry.targetKind,
        target_id: entry.targetId == null ? null : String(entry.targetId),
        before: entry.before == null ? null : JSON.stringify(entry.before),
        after: entry.after == null ? null : JSON.stringify(entry.after),
        request_id: entry.requestId ?? null,
        ip: entry.ip ?? null,
      })
    } catch (err) {
      // Never let audit failure break the request — the action already
      // happened. Log loudly so operators can detect a broken trail.
      log.error({ err: String(err), action: entry.action }, 'failed to record admin audit')
    }
  },

  async listRecent(args: {
    adminId?: string
    action?: string
    targetKind?: string
    targetId?: string | number
    limit?: number
    offset?: number
  } = {}): Promise<AdminAuditRow[]> {
    const limit = Math.min(args.limit ?? 100, 500)
    const offset = args.offset ?? 0
    let q = db('admin_audit_log').orderBy('created_at', 'desc')
    if (args.adminId) q = q.where({ admin_id: args.adminId })
    if (args.action) q = q.where({ action: args.action })
    if (args.targetKind) q = q.where({ target_kind: args.targetKind })
    if (args.targetId !== undefined) q = q.where({ target_id: String(args.targetId) })
    const rows = await q.limit(limit).offset(offset).select<DbRow[]>('*')
    return rows.map(rowTo)
  },
}
