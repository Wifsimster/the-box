import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import type { ApiKeyScope, AppSettingView } from '@the-box/types'
import { createSettingsRouter, type SettingsAuditEntry } from './settings.router.js'
import { createRequireKeyOwnerAdmin, requireScope } from '../middleware/agent-api.middleware.js'
import { createAppSettingsService } from '../../domain/services/app-settings.service.js'
import type { AppSettingRow } from '../../domain/ports/app-settings.js'
import { silentLogger } from '../../domain/ports/logger.test-double.js'
import { createSecretBox } from '../../infrastructure/crypto/secret-box.js'

const SECRET = 'sk-ant-api03-zzzzzzzzzzzzzzzzzzzzzzzzzzzzzz-9876'

const KEYS: Record<string, { id: number; user_id: string; scopes: ApiKeyScope[] }> = {
  settings: { id: 11, user_id: 'admin-1', scopes: ['admin:settings'] },
  'settings-demoted': { id: 12, user_id: 'former-admin', scopes: ['admin:settings'] },
  'geo-read': { id: 13, user_id: 'admin-1', scopes: ['geo-agent:read'] },
  streamer: { id: 14, user_id: 'player', scopes: ['read:public', 'admin:settings' as ApiKeyScope] },
}
const ADMINS = new Set(['admin-1'])

describe('settings over the agent API (MCP surface)', () => {
  let server: Server
  let base: string
  const audits: SettingsAuditEntry[] = []
  const rows = new Map<string, AppSettingRow>()

  before(async () => {
    const settings = createAppSettingsService({
      repository: {
        findAll: async () => [...rows.values()],
        upsert: async ({ key, value, secretCiphertext, updatedBy }) => {
          rows.set(key, { key, value, secretCiphertext, updatedBy, updatedAt: new Date() })
        },
        delete: async (key) => void rows.delete(key),
      },
      cipher: createSecretBox('the-box/app-setting/v1', 'test-secret-test-secret-test-secret-00'),
      logger: silentLogger,
    })

    const app = express()
    app.use(express.json())
    const agent = express.Router()
    agent.use((req, res, next) => {
      const key = KEYS[req.header('x-test-key') ?? '']
      if (!key) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } })
        return
      }
      req.apiKey = key as unknown as NonNullable<typeof req.apiKey>
      req.userId = key.user_id
      next()
    })
    agent.use(
      requireScope('admin:settings'),
      createRequireKeyOwnerAdmin(async (id) => ({ isAdmin: ADMINS.has(id) }))
    )
    agent.use(
      createSettingsRouter({
        settings,
        audit: async (_req, entry) => void audits.push(entry),
        channel: 'agent-key',
      })
    )
    app.use('/api/agent/v1/settings', agent)
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve())
    })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/agent/v1/settings`
  })

  after(() => {
    server.close()
  })

  const call = async (method: string, path: string, key: string | null, body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(key ? { 'x-test-key': key } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    return { status: res.status, text, json: JSON.parse(text) as { success: boolean; data?: unknown; error?: { code: string } } }
  }

  it('401 without a key', async () => {
    assert.equal((await call('GET', '/', null)).status, 401)
  })

  it('403 for a key without admin:settings', async () => {
    const r = await call('GET', '/', 'geo-read')
    assert.equal(r.status, 403)
    assert.equal(r.json.error?.code, 'INSUFFICIENT_SCOPE')
  })

  it('403 for a streamer key, even one carrying admin:settings', async () => {
    const r = await call('POST', '/describeGuess.enabled', 'streamer', { value: true })
    assert.equal(r.status, 403)
    assert.equal(rows.size, 0)
  })

  it('403 when the key owner is no longer an admin', async () => {
    const r = await call('POST', '/describeGuess.enabled', 'settings-demoted', { value: true })
    assert.equal(r.status, 403)
    assert.equal(r.json.error?.code, 'FORBIDDEN')
    assert.equal(rows.size, 0)
  })

  it('lists settings with defaults', async () => {
    const r = await call('GET', '/', 'settings')
    assert.equal(r.status, 200)
    const keys = (r.json.data as AppSettingView[]).map((s) => s.key)
    assert.deepEqual(keys, ['describeGuess.enabled', 'describeGuess.anthropicApiKey', 'describeGuess.model', 'describeGuess.threshold'])
  })

  it('sets a secret write-only: masked on read, absent from every response and audit', async () => {
    const set = await call('POST', '/describeGuess.anthropicApiKey', 'settings', { value: SECRET })
    assert.equal(set.status, 200)
    const get = await call('GET', '/describeGuess.anthropicApiKey', 'settings')
    const list = await call('GET', '/', 'settings')
    for (const r of [set, get, list]) assert.ok(!r.text.includes(SECRET), 'secret leaked in a response')
    assert.deepEqual((get.json.data as AppSettingView).secret, { set: true, mask: 'sk-ant-…9876' })
    assert.ok(!rows.get('describeGuess.anthropicApiKey')!.secretCiphertext!.includes(SECRET))
    const audit = audits.at(-1)!
    assert.ok(!JSON.stringify(audit).includes(SECRET), 'secret leaked in the audit entry')
    assert.deepEqual(audit, {
      action: 'app_setting.update',
      target: { kind: 'app_setting', id: 'describeGuess.anthropicApiKey' },
      before: { set: false },
      after: { set: true, via: 'agent-key', keyId: 11 },
    })
  })

  it('sets a plain value (PUT or POST) and audits before/after', async () => {
    const r = await call('PUT', '/describeGuess.enabled', 'settings', { value: true })
    assert.equal(r.status, 200)
    assert.equal((r.json.data as AppSettingView).value, true)
    assert.deepEqual(audits.at(-1)!.after, { value: true, via: 'agent-key', keyId: 11 })
  })

  it('400 on an invalid value or body, 404 on an unknown key', async () => {
    assert.equal((await call('POST', '/describeGuess.threshold', 'settings', { value: 3 })).status, 400)
    assert.equal((await call('POST', '/describeGuess.threshold', 'settings', {})).status, 400)
    assert.equal((await call('POST', '/nope', 'settings', { value: 1 })).status, 404)
    assert.equal((await call('GET', '/nope', 'settings')).status, 404)
  })
})
