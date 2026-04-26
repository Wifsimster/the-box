import { env } from '../../../config/env.js'
import { queueLogger } from '../../logger/logger.js'
import {
  geoIngestFailureRepository,
  geoScreenshotRepository,
} from '../../repositories/index.js'
import { tombstoneRetryAfter } from '../../../domain/services/geo-metadata.service.js'

const log = queueLogger.child({ worker: 'geo-rawg-import' })

// RAWG's `/games/{id}/screenshots` returns a paginated list of screenshots
// scraped from official sources + community uploads. Coverage is broader
// than Steam's `appdetails` because RAWG indexes Switch / PlayStation /
// Xbox / mobile titles too — this is the source that fixes the
// "Zelda BotW returns 0 candidates" case where the game isn't on Steam.
//
// Auth: query-string `?key=<RAWG_API_KEY>`. Free tier is 20k req/month
// with a soft 20 req/min limit; we let the worker concurrency throttle
// us and back off on 429s.
const RAWG_API = 'https://api.rawg.io/api'
const DEFAULT_USER_AGENT =
  'the-box-geo-importer/1.0 (+https://github.com/Wifsimster/the-box)'

export interface ImportRawgScreenshotsInput {
  gameId: number
  geoMapId: number
  rawgId: number
  maxItems?: number
  userAgent?: string
}

export interface ImportRawgScreenshotsResult {
  fetched: number
  inserted: number
  skipped: number
}

interface RawgScreenshot {
  id: number
  image: string
  width?: number
  height?: number
  is_deleted?: boolean
}

interface RawgScreenshotsResponse {
  count: number
  next: string | null
  previous: string | null
  results: RawgScreenshot[]
}

export async function importRawgScreenshots(
  input: ImportRawgScreenshotsInput,
): Promise<ImportRawgScreenshotsResult> {
  const { gameId, geoMapId, rawgId } = input
  const max = input.maxItems ?? 50
  const ua = input.userAgent ?? DEFAULT_USER_AGENT

  const apiKey = env.RAWG_API_KEY
  if (!apiKey) {
    // Caller is expected to gate on env, but fail loudly rather than silently
    // tombstoning if a job slipped through.
    throw new Error('RAWG_API_KEY is not configured')
  }

  const url = `${RAWG_API}/games/${rawgId}/screenshots?key=${encodeURIComponent(apiKey)}`
  log.info({ gameId, rawgId }, 'fetching rawg screenshots')

  const res = await fetch(url, {
    headers: { 'User-Agent': ua, Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`rawg screenshots failed: ${res.status} ${res.statusText}`)
  }
  const body = (await res.json()) as RawgScreenshotsResponse
  const shots = (body.results ?? []).filter(
    (s) => !s.is_deleted && typeof s.image === 'string' && s.image.length > 0,
  )

  let inserted = 0
  let skipped = 0
  for (const shot of shots.slice(0, max)) {
    const externalId = `rawg:${rawgId}:${shot.id}`
    try {
      // createCandidate uses ON CONFLICT (source, external_id) DO NOTHING, so
      // re-running this importer is idempotent per RAWG screenshot id.
      await geoScreenshotRepository.createCandidate({
        gameId,
        geoMapId,
        imageUrl: shot.image,
        source: 'rawg',
        externalId,
      })
      inserted++
    } catch (e) {
      log.warn({ err: String(e), externalId }, 'failed to insert candidate')
      skipped++
    }
  }

  if (shots.length === 0) {
    const attempt =
      (await geoIngestFailureRepository.getAttemptCount(gameId, 'rawg')) + 1
    await geoIngestFailureRepository.record({
      gameId,
      source: 'rawg',
      reason: 'rawg screenshots endpoint returned no results',
      retryAfter: tombstoneRetryAfter(attempt),
    })
  } else if (inserted > 0) {
    await geoIngestFailureRepository.clear(gameId, 'rawg')
  }

  log.info(
    { gameId, rawgId, fetched: shots.length, inserted, skipped },
    'imported rawg screenshots',
  )
  return { fetched: shots.length, inserted, skipped }
}
