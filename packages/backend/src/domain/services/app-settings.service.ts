/**
 * Generic runtime settings (Admin → Paramètres, settings MCP tools).
 *
 * The registry below is the single list of known settings: key, type, group,
 * default and validation. Adding a setting is one entry here plus its i18n
 * label; storage, caching, masking, the admin UI and the MCP tools pick it up.
 *
 * Rules:
 * - A missing row means the default. Writing `null` deletes the row (back to
 *   the default, or "not set" for a secret).
 * - Secrets are write-only: encrypted before storage, never returned by
 *   `list`/`get`, only `{ set, mask }`. `getValue` (server-internal) is the
 *   only way to read one in plaintext.
 * - Reads go through an in-process cache of the whole table, invalidated on
 *   every write and refreshed after `cacheTtlMs` (covers out-of-band edits).
 *   One backend instance today; a multi-instance deploy would see up to
 *   `cacheTtlMs` of staleness on the other instances.
 */
import type { AppSettingType, AppSettingView } from '@the-box/types'
import type { AppSettingRow, AppSettingsRepository, SecretCipher } from '../ports/app-settings.js'
import type { DomainLogger } from '../ports/logger.js'

type Scalar = boolean | string | number

interface SettingDefinition {
  key: string
  type: AppSettingType
  group: string
  defaultValue: Scalar | null
  constraints?: AppSettingView['constraints']
  /** Returns the normalised value, or an error message. */
  validate(value: unknown): { ok: true; value: Scalar } | { ok: false; error: string }
}

const MODEL_PATTERN = /^claude-[a-z0-9][a-z0-9.-]{0,60}$/

export const APP_SETTINGS: readonly SettingDefinition[] = [
  {
    key: 'describeGuess.enabled',
    type: 'boolean',
    group: 'describeGuess',
    defaultValue: false,
    validate: (v) => (typeof v === 'boolean' ? { ok: true, value: v } : { ok: false, error: 'expected a boolean' }),
  },
  {
    key: 'describeGuess.anthropicApiKey',
    type: 'secret',
    group: 'describeGuess',
    defaultValue: null,
    constraints: { maxLength: 500 },
    validate: (v) => {
      if (typeof v !== 'string') return { ok: false, error: 'expected a string' }
      const s = v.trim()
      if (s.length < 10 || s.length > 500) return { ok: false, error: 'expected 10 to 500 characters' }
      if (/\s/.test(s)) return { ok: false, error: 'must not contain whitespace' }
      return { ok: true, value: s }
    },
  },
  {
    key: 'describeGuess.model',
    type: 'string',
    group: 'describeGuess',
    defaultValue: 'claude-haiku-5-5',
    constraints: { pattern: MODEL_PATTERN.source, maxLength: 64 },
    validate: (v) => {
      if (typeof v !== 'string') return { ok: false, error: 'expected a string' }
      const s = v.trim()
      return MODEL_PATTERN.test(s) ? { ok: true, value: s } : { ok: false, error: 'expected a Claude model id (claude-…)' }
    },
  },
  {
    key: 'describeGuess.threshold',
    type: 'number',
    group: 'describeGuess',
    defaultValue: 0.8,
    constraints: { min: 0.5, max: 1 },
    validate: (v) =>
      typeof v === 'number' && Number.isFinite(v) && v >= 0.5 && v <= 1
        ? { ok: true, value: v }
        : { ok: false, error: 'expected a number between 0.5 and 1' },
  },
]

export type AppSettingKey = (typeof APP_SETTINGS)[number]['key']

const BY_KEY = new Map(APP_SETTINGS.map((d) => [d.key, d]))

export class AppSettingError extends Error {
  constructor(
    public readonly code: 'UNKNOWN_SETTING' | 'INVALID_VALUE',
    message: string,
    public readonly statusCode: number
  ) {
    super(message)
    this.name = 'AppSettingError'
  }
}

/**
 * Show enough of a secret to recognise it, never enough to use it:
 * `sk-ant-…abcd`. Short values only show the last two characters.
 */
export function maskSecret(secret: string): string {
  if (secret.length < 12) return `…${secret.slice(-2)}`
  const prefix = secret.startsWith('sk-ant-') ? 'sk-ant-' : secret.slice(0, 3)
  return `${prefix}…${secret.slice(-4)}`
}

/** What an audit entry may record about a change. Secrets: only whether one is set. */
export interface SettingAuditSnapshot {
  before: { value?: Scalar | null; set?: boolean }
  after: { value?: Scalar | null; set?: boolean }
}

export interface AppSettingsService {
  list(): Promise<AppSettingView[]>
  get(key: string): Promise<AppSettingView>
  /** Server-internal typed read (secrets decrypted). Falls back to the default. */
  getValue(key: AppSettingKey): Promise<Scalar | null>
  /** `value === null` resets to the default (or clears a secret). */
  set(key: string, value: unknown, actorId: string | null): Promise<{ view: AppSettingView; audit: SettingAuditSnapshot }>
  invalidate(): void
}

export interface AppSettingsServiceDeps {
  repository: AppSettingsRepository
  cipher: SecretCipher
  logger: DomainLogger
  now?: () => number
  cacheTtlMs?: number
}

export function createAppSettingsService(deps: AppSettingsServiceDeps): AppSettingsService {
  const log = deps.logger.child({ service: 'app-settings' })
  const now = deps.now ?? Date.now
  const ttl = deps.cacheTtlMs ?? 30_000

  let cache: { rows: Map<string, AppSettingRow>; loadedAt: number } | null = null
  let loading: Promise<Map<string, AppSettingRow>> | null = null

  async function rows(): Promise<Map<string, AppSettingRow>> {
    if (cache && now() - cache.loadedAt < ttl) return cache.rows
    if (!loading) {
      loading = deps.repository
        .findAll()
        .then((all) => {
          const map = new Map(all.map((r) => [r.key, r]))
          cache = { rows: map, loadedAt: now() }
          return map
        })
        .finally(() => {
          loading = null
        })
    }
    return loading
  }

  function definition(key: string): SettingDefinition {
    const def = BY_KEY.get(key)
    if (!def) throw new AppSettingError('UNKNOWN_SETTING', `Unknown setting: ${key}`, 404)
    return def
  }

  /** Stored non-secret value if it is still valid for the definition, else null. */
  function storedValue(def: SettingDefinition, row: AppSettingRow | undefined): Scalar | null {
    if (!row || def.type === 'secret') return null
    const checked = def.validate(row.value)
    return checked.ok ? checked.value : null
  }

  function decrypted(row: AppSettingRow | undefined): string | null {
    if (!row?.secretCiphertext) return null
    const plain = deps.cipher.decrypt(row.secretCiphertext)
    if (plain === null) {
      // Wrong key (BETTER_AUTH_SECRET rotated) or tampering: read as unset.
      log.warn({ key: row.key }, 'secret setting could not be decrypted; treating it as unset')
    }
    return plain
  }

  function view(def: SettingDefinition, row: AppSettingRow | undefined): AppSettingView {
    const base = {
      key: def.key,
      type: def.type,
      group: def.group,
      defaultValue: def.defaultValue,
      ...(def.constraints ? { constraints: def.constraints } : {}),
      updatedAt: row ? row.updatedAt.toISOString() : null,
      updatedBy: row?.updatedBy ?? null,
    }
    if (def.type === 'secret') {
      const plain = decrypted(row)
      return {
        ...base,
        value: null,
        isSet: plain !== null,
        secret: { set: plain !== null, mask: plain === null ? null : maskSecret(plain) },
      }
    }
    const stored = storedValue(def, row)
    return {
      ...base,
      value: stored ?? def.defaultValue,
      isSet: stored !== null && stored !== def.defaultValue,
    }
  }

  function snapshot(def: SettingDefinition, row: AppSettingRow | undefined): SettingAuditSnapshot['before'] {
    if (def.type === 'secret') return { set: decrypted(row) !== null }
    return { value: storedValue(def, row) ?? def.defaultValue }
  }

  return {
    async list() {
      const all = await rows()
      return APP_SETTINGS.map((def) => view(def, all.get(def.key)))
    },

    async get(key) {
      const def = definition(key)
      return view(def, (await rows()).get(key))
    },

    async getValue(key) {
      const def = definition(key)
      const row = (await rows()).get(key)
      if (def.type === 'secret') return decrypted(row)
      return storedValue(def, row) ?? def.defaultValue
    },

    async set(key, value, actorId) {
      const def = definition(key)
      const before = snapshot(def, (await rows()).get(key))

      if (value === null || value === undefined) {
        await deps.repository.delete(key)
      } else {
        const checked = def.validate(value)
        if (!checked.ok) throw new AppSettingError('INVALID_VALUE', `${key}: ${checked.error}`, 400)
        await deps.repository.upsert(
          def.type === 'secret'
            ? { key, value: null, secretCiphertext: deps.cipher.encrypt(String(checked.value)), updatedBy: actorId }
            : { key, value: checked.value, secretCiphertext: null, updatedBy: actorId }
        )
      }

      cache = null
      const fresh = (await rows()).get(key)
      const after = snapshot(def, fresh)
      // Never the secret itself: the key and whether it is set.
      log.info({ key, actorId, ...(def.type === 'secret' ? { set: after.set } : {}) }, 'app setting updated')
      return { view: view(def, fresh), audit: { before, after } }
    },

    invalidate() {
      cache = null
    },
  }
}
