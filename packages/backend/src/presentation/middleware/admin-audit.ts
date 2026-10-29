import type { Request } from 'express'
import { adminAuditRepository } from '../../infrastructure/repositories/admin-audit.repository.js'

export interface AdminAuditTarget {
  kind: string
  id?: string | number | null
}

export interface AdminAuditPayload {
  action: string
  target: AdminAuditTarget
  before?: unknown
  after?: unknown
}

function clientIp(req: Request): string | null {
  const xff = req.headers['x-forwarded-for']
  if (typeof xff === 'string') return xff.split(',')[0]?.trim() ?? null
  return req.ip ?? req.socket.remoteAddress ?? null
}

function requestId(req: Request): string | null {
  const id = req.headers['x-request-id']
  return typeof id === 'string' ? id : null
}

export async function recordAdminGeoAudit(
  req: Request,
  payload: AdminAuditPayload,
): Promise<void> {
  const adminId = req.userId
  if (!adminId) return
  await adminAuditRepository.record({
    adminId,
    action: payload.action,
    targetKind: payload.target.kind,
    targetId: payload.target.id,
    before: payload.before,
    after: payload.after,
    requestId: requestId(req),
    ip: clientIp(req),
  })
}
