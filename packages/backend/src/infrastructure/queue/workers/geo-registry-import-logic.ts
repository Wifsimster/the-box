import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve as resolvePath } from 'node:path'
import type { GeoMapTilesConfig } from '@the-box/types'
import { queueLogger } from '../../logger/logger.js'
import {
  geoIngestFailureRepository,
  geoMapRepository,
} from '../../repositories/index.js'
import { tombstoneRetryAfter } from '../../../domain/services/geo-metadata.service.js'
import { formatTileUrl } from '../../../domain/services/geo-tile-url.service.js'

const log = queueLogger.child({ worker: 'geo-registry-import' })

const DEFAULT_USER_AGENT =
  'the-box-geo-importer/1.0 (+https://github.com/Wifsimster/the-box)'

// Tier 1 ingestion: pull a curated, permissively-licensed map image from the
// JSON registry shipped with the backend. Preferred over Fandom because the
// licensing is explicit per entry and the asset URL is stable (typically a
// raw.githubusercontent.com path).

export interface RegistryEntry {
  match: { slug?: string; aliases?: string[] }
  // Always-set thumbnail / fallback PNG. For tile entries, the registry
  // points this at one canonical tile (e.g. the upper-left tile at the
  // most-zoomed-out layer) so admin grids keep showing a preview.
  imageUrl: string
  widthPx: number
  heightPx: number
  license: string
  attribution: string
  sourceUrl?: string
  commercialUseOk?: boolean
  // Optional region label (e.g. "Velen", "Act II"). Omit for the canonical
  // world / mosaic map. Stored on geo_map.region for admin visibility; the
  // runtime still selects a single is_active row per game today.
  region?: string
  // Set to enable Leaflet tile rendering. The worker probes one canonical
  // tile (deepest zoom, 0/0) before persisting; failure tombstones go
  // through the same path as broken image URLs.
  tiles?: GeoMapTilesConfig
}

interface RegistryFile {
  version: number
  entries: RegistryEntry[]
}

export interface ImportRegistryMapInput {
  gameId: number
  // Pre-resolved registry entry (the tick-orchestrator looks this up by
  // game.slug); passed in so this worker stays stateless and easy to test.
  entry: RegistryEntry
}

export interface ImportRegistryMapResult {
  imported: boolean
  geoMapId?: number
  reason?: string
}

let cachedRegistry: RegistryFile | null = null

export async function loadRegistry(path?: string): Promise<RegistryFile> {
  if (cachedRegistry && !path) return cachedRegistry
  const here = dirname(fileURLToPath(import.meta.url))
  // queue/workers → queue → infrastructure → src → packages/backend → data
  const target =
    path ?? resolvePath(here, '..', '..', '..', '..', 'data', 'geo-map-registry.json')
  const raw = await readFile(target, 'utf8')
  const parsed = JSON.parse(raw) as RegistryFile
  if (!path) cachedRegistry = parsed
  return parsed
}

export async function findRegistryEntryBySlug(
  slug: string,
): Promise<RegistryEntry | null> {
  const registry = await loadRegistry()
  for (const e of registry.entries) {
    if (e.match.slug === slug) return e
    if (e.match.aliases?.includes(slug)) return e
  }
  return null
}

export async function importRegistryMap(
  input: ImportRegistryMapInput,
): Promise<ImportRegistryMapResult> {
  const { gameId, entry } = input

  const existing = await geoMapRepository.findBySourceAndGameId(gameId, 'registry')
  if (existing) {
    return {
      imported: false,
      geoMapId: existing.id,
      reason: 'registry map already imported',
    }
  }

  // For tile entries, the canonical probe target is the deepest-zoom (0,0)
  // tile — it always exists when the source is functional. The thumbnail
  // imageUrl is HEAD-checked too: if the registry author got the URL wrong,
  // we want to tombstone before admins see a broken thumbnail.
  const probeUrl = entry.tiles
    ? formatTileUrl(entry.tiles, entry.tiles.maxZoom, 0, 0)
    : entry.imageUrl
  log.info({ gameId, probeUrl, kind: entry.tiles ? 'tiles' : 'image' }, 'fetching registry map')

  try {
    const res = await fetch(probeUrl, {
      method: 'HEAD',
      headers: { 'User-Agent': DEFAULT_USER_AGENT },
    })
    if (!res.ok) {
      await recordRegistryTombstone(gameId, `HEAD ${probeUrl} → ${res.status}`)
      return { imported: false, reason: `HEAD failed: ${res.status}` }
    }
  } catch (err) {
    await recordRegistryTombstone(gameId, `HEAD fetch threw: ${String(err)}`)
    return { imported: false, reason: 'HEAD fetch threw' }
  }

  const map = await geoMapRepository.create({
    gameId,
    source: 'registry',
    sourceUrl: entry.sourceUrl,
    imageUrl: entry.imageUrl,
    widthPx: entry.widthPx,
    heightPx: entry.heightPx,
    tiles: entry.tiles,
    license: entry.license,
    attribution: entry.attribution,
    region: entry.region ?? null,
  })

  await geoIngestFailureRepository.clear(gameId, 'registry')
  log.info({ gameId, mapId: map.id }, 'imported registry map')
  return { imported: true, geoMapId: map.id }
}

async function recordRegistryTombstone(gameId: number, reason: string): Promise<void> {
  const attempt =
    (await geoIngestFailureRepository.getAttemptCount(gameId, 'registry')) + 1
  await geoIngestFailureRepository.record({
    gameId,
    source: 'registry',
    reason,
    retryAfter: tombstoneRetryAfter(attempt),
  })
}

// Test hook — clears the in-process cache so unit tests can swap the file.
export function _resetRegistryCache(): void {
  cachedRegistry = null
}
