import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Request } from 'express'
import { recordAdminGeoAudit } from './admin-audit.js'
import { adminAuditRepository } from '../../infrastructure/repositories/admin-audit.repository.js'

// We don't have a DB in this unit test, so swap the repository's `record`
// out for a spy and verify the helper passes the right shape through.
// The repository itself is exercised in the e2e tests where a real
// Postgres connection is available.

function fakeReq(over: Partial<Request> = {}): Request {
  return {
    userId: 'admin-1',
    headers: {
      'x-forwarded-for': '203.0.113.4, 10.0.0.1',
      'x-request-id': 'req-abc',
    },
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    ...over,
  } as unknown as Request
}

describe('recordAdminGeoAudit', () => {
  it('forwards admin id, target, before/after, request id, and the first XFF hop', async () => {
    const calls: Parameters<typeof adminAuditRepository.record>[0][] = []
    const original = adminAuditRepository.record
    adminAuditRepository.record = async (entry) => {
      calls.push(entry)
    }
    try {
      await recordAdminGeoAudit(fakeReq(), {
        action: 'geo.maps.manual',
        target: { kind: 'geo-map', id: 42 },
        before: { isActive: false },
        after: { isActive: true },
      })
    } finally {
      adminAuditRepository.record = original
    }
    assert.equal(calls.length, 1)
    const call = calls[0]!
    assert.equal(call.adminId, 'admin-1')
    assert.equal(call.action, 'geo.maps.manual')
    assert.equal(call.targetKind, 'geo-map')
    assert.equal(call.targetId, 42)
    assert.deepEqual(call.before, { isActive: false })
    assert.deepEqual(call.after, { isActive: true })
    assert.equal(call.requestId, 'req-abc')
    // First hop of x-forwarded-for, never the trailing private one.
    assert.equal(call.ip, '203.0.113.4')
  })

  it('skips silently when there is no admin user (logged-out / hooks)', async () => {
    const calls: Parameters<typeof adminAuditRepository.record>[0][] = []
    const original = adminAuditRepository.record
    adminAuditRepository.record = async (entry) => {
      calls.push(entry)
    }
    try {
      await recordAdminGeoAudit(fakeReq({ userId: undefined }), {
        action: 'whatever',
        target: { kind: 'global' },
      })
    } finally {
      adminAuditRepository.record = original
    }
    assert.equal(calls.length, 0)
  })

  it('falls back to req.ip when no x-forwarded-for is present', async () => {
    const calls: Parameters<typeof adminAuditRepository.record>[0][] = []
    const original = adminAuditRepository.record
    adminAuditRepository.record = async (entry) => {
      calls.push(entry)
    }
    try {
      await recordAdminGeoAudit(
        fakeReq({ headers: {} }),
        { action: 'geo.maps.manual', target: { kind: 'geo-map', id: 1 } },
      )
    } finally {
      adminAuditRepository.record = original
    }
    assert.equal(calls.length, 1)
    assert.equal(calls[0]!.ip, '127.0.0.1')
    assert.equal(calls[0]!.requestId, null)
  })
})
