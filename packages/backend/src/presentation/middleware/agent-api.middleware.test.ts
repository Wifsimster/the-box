import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import type { Request, Response } from 'express'
import type { ApiKeyScope } from '@the-box/types'
import { env } from '../../config/env.js'
import {
  requireAgentApiEnabled,
  requireScope,
} from './agent-api.middleware.js'

// Minimal Express res double: captures the status + json body and whether the
// handler chain continued (next called).
function mockRes() {
  const state: { status: number; body: unknown } = { status: 200, body: undefined }
  const res = {
    status(code: number) {
      state.status = code
      return res
    },
    json(payload: unknown) {
      state.body = payload
      return res
    },
  } as unknown as Response
  return { res, state }
}

function reqWithScopes(scopes: ApiKeyScope[] | undefined): Request {
  return { apiKey: scopes ? { id: 1, scopes } : undefined } as unknown as Request
}

function errorCode(body: unknown): string | undefined {
  return (body as { error?: { code?: string } } | undefined)?.error?.code
}

describe('requireScope', () => {
  it('passes a read-only agent key requesting geo-agent:read', () => {
    const { res, state } = mockRes()
    let nexted = false
    requireScope('geo-agent:read')(reqWithScopes(['geo-agent:read']), res, () => {
      nexted = true
    })
    assert.equal(nexted, true)
    assert.equal(state.status, 200)
  })

  it('rejects when the key lacks the requested scope (read key, ingest route)', () => {
    const { res, state } = mockRes()
    let nexted = false
    requireScope('geo-agent:ingest')(reqWithScopes(['geo-agent:read']), res, () => {
      nexted = true
    })
    assert.equal(nexted, false)
    assert.equal(state.status, 403)
    assert.equal(errorCode(state.body), 'INSUFFICIENT_SCOPE')
  })

  it('rejects a streamer key even though it authenticated', () => {
    // A key carrying only streamer scopes can never reach the agent surface.
    const { res, state } = mockRes()
    let nexted = false
    requireScope('geo-agent:read')(reqWithScopes(['read:public', 'webhooks:self']), res, () => {
      nexted = true
    })
    assert.equal(nexted, false)
    assert.equal(state.status, 403)
  })

  it('rejects a mixed key (mutual exclusion): every scope must be geo-agent', () => {
    // Defense in depth against a key that somehow carries both families —
    // holding geo-agent:read is not enough if a streamer scope rides along.
    const { res, state } = mockRes()
    let nexted = false
    requireScope('geo-agent:read')(
      reqWithScopes(['geo-agent:read', 'read:public']),
      res,
      () => {
        nexted = true
      },
    )
    assert.equal(nexted, false)
    assert.equal(state.status, 403)
  })

  it('rejects when no key is attached', () => {
    const { res, state } = mockRes()
    let nexted = false
    requireScope('geo-agent:read')(reqWithScopes(undefined), res, () => {
      nexted = true
    })
    assert.equal(nexted, false)
    assert.equal(state.status, 403)
  })
})

describe('requireAgentApiEnabled', () => {
  const original = env.GEO_AGENT_API_ENABLED
  beforeEach(() => {
    env.GEO_AGENT_API_ENABLED = original
  })
  afterEach(() => {
    env.GEO_AGENT_API_ENABLED = original
  })

  it('passes through when enabled', () => {
    env.GEO_AGENT_API_ENABLED = 'true'
    const { res, state } = mockRes()
    let nexted = false
    requireAgentApiEnabled({} as Request, res, () => {
      nexted = true
    })
    assert.equal(nexted, true)
    assert.equal(state.status, 200)
  })

  it('returns 503 AGENT_API_DISABLED when off (default)', () => {
    env.GEO_AGENT_API_ENABLED = 'false'
    const { res, state } = mockRes()
    let nexted = false
    requireAgentApiEnabled({} as Request, res, () => {
      nexted = true
    })
    assert.equal(nexted, false)
    assert.equal(state.status, 503)
    assert.equal(errorCode(state.body), 'AGENT_API_DISABLED')
  })
})
