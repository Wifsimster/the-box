import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'
import type {
  GeoSourceConfig,
  GeoSourceKind,
  GeoSourceName,
} from '@the-box/types'

const log = repoLogger.child({ repository: 'geo-source-config' })

interface Row {
  source: GeoSourceName
  kind: GeoSourceKind
  priority: number
  is_enabled: boolean
  rate_limit_per_min: number | null
  cooldown_seconds_on_empty: number
  updated_at: Date
}

function rowTo(row: Row): GeoSourceConfig {
  return {
    source: row.source,
    kind: row.kind,
    priority: row.priority,
    isEnabled: row.is_enabled,
    rateLimitPerMin: row.rate_limit_per_min ?? undefined,
    cooldownSecondsOnEmpty: row.cooldown_seconds_on_empty,
  }
}

// Cache the config in-process for 60s. The set of providers changes very
// rarely (only via admin SQL), and the orchestrator reads it on every
// pipeline transition — bypassing the round trip pays off.
let cache: { at: number; rows: GeoSourceConfig[] } | null = null
const CACHE_TTL_MS = 60_000

export const geoSourceConfigRepository = {
  async list(): Promise<GeoSourceConfig[]> {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows
    const rows = await db('geo_source_config')
      .orderBy('priority', 'asc')
      .select<Row[]>('*')
    const mapped = rows.map(rowTo)
    cache = { at: Date.now(), rows: mapped }
    return mapped
  },

  async listByKind(kind: GeoSourceKind): Promise<GeoSourceConfig[]> {
    const all = await this.list()
    return all.filter((c) => c.kind === kind && c.isEnabled)
  },

  async findByName(source: GeoSourceName): Promise<GeoSourceConfig | null> {
    const all = await this.list()
    return all.find((c) => c.source === source) ?? null
  },

  async setEnabled(source: GeoSourceName, isEnabled: boolean): Promise<void> {
    log.info({ source, isEnabled }, 'setEnabled')
    await db('geo_source_config')
      .where({ source })
      .update({ is_enabled: isEnabled, updated_at: new Date() })
    cache = null
  },

  async setPriority(source: GeoSourceName, priority: number): Promise<void> {
    log.info({ source, priority }, 'setPriority')
    await db('geo_source_config')
      .where({ source })
      .update({ priority, updated_at: new Date() })
    cache = null
  },

  // Test seam — flush in-memory cache so changes are visible on next read.
  invalidateCache(): void {
    cache = null
  },
}
