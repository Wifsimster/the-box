import crypto from 'node:crypto'
import { db } from '../database/connection.js'
import { GEO_AGENT_SCOPES, type ApiKeyMode, type ApiKeyScope, type ApiKeySummary } from '@the-box/types'

// Postgres text[] literal of the geo-agent scopes, e.g. `{geo-agent:read,…}`.
// Used with the array-overlap operator (`&&`) to find/act on agent keys
// regardless of which admin minted them.
const GEO_AGENT_SCOPES_PG_ARRAY = `{${GEO_AGENT_SCOPES.join(',')}}`

// Single source of truth for the plaintext format. Keys look like
//   tb_pk_live_<43-char-base64url>
// The prefix `tb_pk_` is a hard-coded secret-detection pattern partners can
// grep their repos with; never reuse it elsewhere.
const PLAINTEXT_BYTES = 32 // 32 bytes → 43 base64url chars after stripping `=`.
const KEY_PREFIX_LIVE = 'tb_pk_live_'
const KEY_PREFIX_TEST = 'tb_pk_test_'

export interface ApiKeyRow {
  id: number
  user_id: string
  key_hash: string
  key_prefix: string
  label: string
  mode: ApiKeyMode
  scopes: ApiKeyScope[]
  is_active: boolean
  created_at: Date
  last_used_at: Date | null
  last_used_ip: string | null
  revoked_at: Date | null
}

function mapRow(row: ApiKeyRow): ApiKeySummary {
  return {
    id: row.id,
    label: row.label,
    keyPrefix: row.key_prefix,
    mode: row.mode,
    scopes: row.scopes,
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
    lastUsedIp: row.last_used_ip ?? null,
  }
}

export function hashApiKey(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext, 'utf8').digest('hex')
}

function generatePlaintext(mode: ApiKeyMode): string {
  const body = crypto.randomBytes(PLAINTEXT_BYTES).toString('base64url')
  return (mode === 'test' ? KEY_PREFIX_TEST : KEY_PREFIX_LIVE) + body
}

const DEFAULT_SCOPES: ApiKeyScope[] = [
  'read:public',
  'read:self',
  'stream:self',
  'webhooks:self',
]

export const apiKeyRepository = {
  /**
   * Mints a new key. Returns both the database row and the one-shot
   * plaintext value — the caller MUST surface the plaintext exactly
   * once (key creation response). After that only the hash is stored.
   */
  async create(params: {
    userId: string
    label: string
    mode: ApiKeyMode
    scopes?: ApiKeyScope[]
  }): Promise<{ row: ApiKeyRow; plaintext: string }> {
    const plaintext = generatePlaintext(params.mode)
    const keyHash = hashApiKey(plaintext)
    // 16-char preview is enough to disambiguate in the UI without leaking
    // entropy — that's prefix + 5 randomized characters.
    const keyPrefix = plaintext.slice(0, 16)

    const [row] = await db('api_keys')
      .insert({
        user_id: params.userId,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        label: params.label,
        mode: params.mode,
        scopes: params.scopes ?? DEFAULT_SCOPES,
      })
      .returning<ApiKeyRow[]>('*')
    return { row: row!, plaintext }
  },

  async findByHash(keyHash: string): Promise<ApiKeyRow | null> {
    const row = await db('api_keys')
      .where('key_hash', keyHash)
      .andWhere('is_active', true)
      .first<ApiKeyRow>()
    return row ?? null
  },

  async findByUser(userId: string): Promise<ApiKeyRow[]> {
    return await db('api_keys')
      .where('user_id', userId)
      .orderBy('created_at', 'desc')
      .select<ApiKeyRow[]>('*')
  },

  async findOwnedById(userId: string, id: number): Promise<ApiKeyRow | null> {
    const row = await db('api_keys')
      .where('id', id)
      .andWhere('user_id', userId)
      .first<ApiKeyRow>()
    return row ?? null
  },

  /**
   * All keys carrying any geo-agent:* scope, regardless of the minting admin —
   * the governance view for the admin agent-key panel. One query via the
   * Postgres array-overlap operator covers all three scopes.
   */
  async listGeoAgentKeys(): Promise<ApiKeyRow[]> {
    return await db('api_keys')
      .whereRaw('scopes && ?::text[]', [GEO_AGENT_SCOPES_PG_ARRAY])
      .orderBy('created_at', 'desc')
      .select<ApiKeyRow[]>('*')
  },

  /**
   * Revoke an agent key by id alone (no owner scoping), so any admin can
   * revoke any agent key. Guarded to keys that actually carry a geo-agent
   * scope so this admin path can never soft-delete a streamer's personal key.
   */
  async revokeGeoAgentKey(id: number): Promise<boolean> {
    const updated = await db('api_keys')
      .where('id', id)
      .andWhere('is_active', true)
      .andWhereRaw('scopes && ?::text[]', [GEO_AGENT_SCOPES_PG_ARRAY])
      .update({ is_active: false, revoked_at: db.fn.now() })
    return updated > 0
  },

  /**
   * Soft revoke. We never delete keys — kept rows give the owner a
   * "this key was used from IP X on date Y" audit trail even after revoke.
   */
  async revoke(id: number, userId: string): Promise<boolean> {
    const updated = await db('api_keys')
      .where('id', id)
      .andWhere('user_id', userId)
      .andWhere('is_active', true)
      .update({ is_active: false, revoked_at: db.fn.now() })
    return updated > 0
  },

  /**
   * Fire-and-forget update — failure to write a usage timestamp must not
   * block the request. Caller awaits but a thrown error is logged and swallowed
   * one layer up.
   */
  async recordUsage(id: number, ip: string | null): Promise<void> {
    await db('api_keys')
      .where('id', id)
      .update({ last_used_at: db.fn.now(), last_used_ip: ip ?? null })
  },

  mapRow,
}
