import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  APP_SETTINGS,
  AppSettingError,
  createAppSettingsService,
  maskSecret,
} from './app-settings.service.js'
import type { AppSettingRow, AppSettingsRepository, SecretCipher } from '../ports/app-settings.js'
import type { RecordedLog } from '../ports/logger.test-double.js'
import type { DomainLogger } from '../ports/logger.js'

/** In-memory repository that counts reads, so cache behaviour is observable. */
function memoryRepo() {
  const rows = new Map<string, AppSettingRow>()
  const stats = { findAll: 0 }
  const repo: AppSettingsRepository = {
    async findAll() {
      stats.findAll++
      return [...rows.values()].map((r) => ({ ...r }))
    },
    async upsert({ key, value, secretCiphertext, updatedBy }) {
      rows.set(key, { key, value, secretCiphertext, updatedBy, updatedAt: new Date('2026-10-12T10:00:00Z') })
    },
    async delete(key) {
      rows.delete(key)
    },
  }
  return { repo, rows, stats }
}

/** Reversible fake cipher with a switchable key, to simulate rotation. */
function fakeCipher() {
  const state = { key: 'k1' }
  const cipher: SecretCipher = {
    encrypt: (p) => `${state.key}:${Buffer.from(p).toString('base64')}`,
    decrypt: (c) => {
      const [k, b64] = c.split(':')
      return k === state.key && b64 !== undefined ? Buffer.from(b64, 'base64').toString() : null
    },
  }
  return { cipher, state }
}

function recordingLogger(): { logger: DomainLogger; logs: RecordedLog[] } {
  const logs: RecordedLog[] = []
  const make = (): DomainLogger => ({
    child: () => make(),
    debug: (...args: unknown[]) => void logs.push({ level: 'debug', args }),
    info: (...args: unknown[]) => void logs.push({ level: 'info', args }),
    warn: (...args: unknown[]) => void logs.push({ level: 'warn', args }),
    error: (...args: unknown[]) => void logs.push({ level: 'error', args }),
  })
  return { logger: make(), logs }
}

const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz-1234'

function setup(opts: { ttl?: number } = {}) {
  const { repo, rows, stats } = memoryRepo()
  const { cipher, state } = fakeCipher()
  let clock = 0
  const { logger, logs } = recordingLogger()
  const service = createAppSettingsService({
    repository: repo,
    cipher,
    logger,
    now: () => clock,
    cacheTtlMs: opts.ttl ?? 30_000,
  })
  return { service, rows, stats, cipherState: state, logs, tick: (ms: number) => (clock += ms) }
}

describe('maskSecret', () => {
  it('shows the Anthropic prefix and the last 4 characters', () => {
    assert.equal(maskSecret(KEY), 'sk-ant-…1234')
  })
  it('shows 3 leading characters for other long secrets', () => {
    assert.equal(maskSecret('abcdefghijklmnop'), 'abc…mnop')
  })
  it('shows only the last 2 characters of a short secret', () => {
    assert.equal(maskSecret('short-1234'), '…34')
  })
  it('never contains the middle of the secret', () => {
    assert.ok(!maskSecret(KEY).includes('abcdefghij'))
  })
})

describe('app settings: registry and defaults', () => {
  it('declares the describe-guess settings', () => {
    assert.deepEqual(
      APP_SETTINGS.map((d) => [d.key, d.type, d.defaultValue]),
      [
        ['describeGuess.enabled', 'boolean', false],
        ['describeGuess.anthropicApiKey', 'secret', null],
        ['describeGuess.model', 'string', 'claude-haiku-5-5'],
        ['describeGuess.threshold', 'number', 0.8],
      ]
    )
  })

  it('returns defaults when nothing is stored', async () => {
    const { service } = setup()
    const list = await service.list()
    assert.equal(list.find((s) => s.key === 'describeGuess.enabled')!.value, false)
    assert.equal(list.find((s) => s.key === 'describeGuess.threshold')!.value, 0.8)
    const key = list.find((s) => s.key === 'describeGuess.anthropicApiKey')!
    assert.deepEqual(key.secret, { set: false, mask: null })
    assert.equal(key.value, null)
    assert.equal(await service.getValue('describeGuess.model'), 'claude-haiku-5-5')
    assert.equal(await service.getValue('describeGuess.anthropicApiKey'), null)
  })

  it('rejects an unknown key with 404', async () => {
    const { service } = setup()
    await assert.rejects(() => service.get('nope'), (e: unknown) => e instanceof AppSettingError && e.statusCode === 404)
    await assert.rejects(() => service.set('nope', true, 'admin'), (e: unknown) => e instanceof AppSettingError && e.code === 'UNKNOWN_SETTING')
  })

  for (const [key, bad] of [
    ['describeGuess.enabled', 'true'],
    ['describeGuess.threshold', 0.2],
    ['describeGuess.threshold', 1.5],
    ['describeGuess.threshold', '0.9'],
    ['describeGuess.model', 'gpt-4o'],
    ['describeGuess.model', 'claude haiku'],
    ['describeGuess.anthropicApiKey', 'short'],
    ['describeGuess.anthropicApiKey', 'sk-ant- with spaces inside'],
    ['describeGuess.anthropicApiKey', 42],
  ] as const) {
    it(`rejects ${key} = ${JSON.stringify(bad)} with 400`, async () => {
      const { service, rows } = setup()
      await assert.rejects(
        () => service.set(key, bad, 'admin'),
        (e: unknown) => e instanceof AppSettingError && e.code === 'INVALID_VALUE' && e.statusCode === 400
      )
      assert.equal(rows.size, 0)
    })
  }
})

describe('app settings: writes', () => {
  it('stores a plain value and reports who changed it', async () => {
    const { service, rows } = setup()
    const { view, audit } = await service.set('describeGuess.threshold', 0.9, 'admin-1')
    assert.equal(view.value, 0.9)
    assert.equal(view.isSet, true)
    assert.equal(view.updatedBy, 'admin-1')
    assert.equal(rows.get('describeGuess.threshold')!.secretCiphertext, null)
    assert.deepEqual(audit, { before: { value: 0.8 }, after: { value: 0.9 } })
  })

  it('null resets to the default', async () => {
    const { service, rows } = setup()
    await service.set('describeGuess.enabled', true, 'a')
    const { view } = await service.set('describeGuess.enabled', null, 'a')
    assert.equal(view.value, false)
    assert.equal(rows.has('describeGuess.enabled'), false)
  })

  it('encrypts a secret, never returns it, and masks it', async () => {
    const { service, rows } = setup()
    const { view, audit } = await service.set('describeGuess.anthropicApiKey', `  ${KEY}  `, 'admin-1')
    const stored = rows.get('describeGuess.anthropicApiKey')!
    assert.equal(stored.value, null)
    assert.ok(stored.secretCiphertext && !stored.secretCiphertext.includes(KEY))
    assert.equal(view.value, null)
    assert.deepEqual(view.secret, { set: true, mask: 'sk-ant-…1234' })
    assert.ok(!JSON.stringify(view).includes(KEY), 'the view must not carry the secret')
    assert.ok(!JSON.stringify(await service.list()).includes(KEY), 'the list must not carry the secret')
    assert.deepEqual(audit, { before: { set: false }, after: { set: true } })
    assert.equal(await service.getValue('describeGuess.anthropicApiKey'), KEY, 'trimmed, decrypted internally')
  })

  it('clears a secret with null', async () => {
    const { service } = setup()
    await service.set('describeGuess.anthropicApiKey', KEY, 'a')
    const { view, audit } = await service.set('describeGuess.anthropicApiKey', null, 'a')
    assert.deepEqual(view.secret, { set: false, mask: null })
    assert.deepEqual(audit, { before: { set: true }, after: { set: false } })
  })

  it('never logs a secret value', async () => {
    const { service, logs } = setup()
    await service.set('describeGuess.anthropicApiKey', KEY, 'a')
    await service.list()
    assert.ok(!JSON.stringify(logs).includes(KEY))
  })

  it('reads a secret it can no longer decrypt (BETTER_AUTH_SECRET rotated) as unset', async () => {
    const { service, cipherState } = setup()
    await service.set('describeGuess.anthropicApiKey', KEY, 'a')
    cipherState.key = 'k2'
    service.invalidate()
    assert.equal(await service.getValue('describeGuess.anthropicApiKey'), null)
    assert.deepEqual((await service.get('describeGuess.anthropicApiKey')).secret, { set: false, mask: null })
  })

  it('falls back to the default when a stored value no longer validates', async () => {
    const { service, rows } = setup()
    rows.set('describeGuess.threshold', {
      key: 'describeGuess.threshold',
      value: 7,
      secretCiphertext: null,
      updatedBy: null,
      updatedAt: new Date(),
    })
    assert.equal(await service.getValue('describeGuess.threshold'), 0.8)
  })
})

describe('app settings: cache', () => {
  it('serves repeated reads from one DB load', async () => {
    const { service, stats } = setup()
    await service.list()
    await service.getValue('describeGuess.enabled')
    await service.get('describeGuess.model')
    assert.equal(stats.findAll, 1)
  })

  it('shares one in-flight load between concurrent readers', async () => {
    const { service, stats } = setup()
    await Promise.all([service.list(), service.getValue('describeGuess.enabled'), service.list()])
    assert.equal(stats.findAll, 1)
  })

  it('invalidates on write so the next read sees the new value', async () => {
    const { service, stats } = setup()
    assert.equal(await service.getValue('describeGuess.enabled'), false)
    await service.set('describeGuess.enabled', true, 'a')
    assert.equal(await service.getValue('describeGuess.enabled'), true)
    assert.ok(stats.findAll >= 2)
  })

  it('reloads after the TTL to pick up out-of-band changes', async () => {
    const { service, rows, stats, tick } = setup({ ttl: 1000 })
    await service.getValue('describeGuess.enabled')
    rows.set('describeGuess.enabled', {
      key: 'describeGuess.enabled',
      value: true,
      secretCiphertext: null,
      updatedBy: null,
      updatedAt: new Date(),
    })
    assert.equal(await service.getValue('describeGuess.enabled'), false, 'still cached')
    tick(1001)
    assert.equal(await service.getValue('describeGuess.enabled'), true)
    assert.equal(stats.findAll, 2)
  })

  it('invalidate() forces a reload', async () => {
    const { service, stats } = setup()
    await service.list()
    service.invalidate()
    await service.list()
    assert.equal(stats.findAll, 2)
  })
})

