import { queueLogger } from '../../logger/logger.js'
import {
  geoIngestFailureRepository,
  geoScreenshotRepository,
} from '../../repositories/index.js'
import { tombstoneRetryAfter } from '../../../domain/services/geo-metadata.service.js'

const log = queueLogger.child({ worker: 'geo-steam-import' })

// Steam's community screenshot endpoint is public and requires no API key:
//   https://store.steampowered.com/appreviews/<appid>?json=1&filter=all
// (reviews). For screenshots we use the community endpoint that powers the
// "Community Hub":
//   https://steamcommunity.com/ogv.php?appid=<appid>&cc=en&l=english
// That returns a JSON-like page rendering screenshots; the cleaner option
// is the appdetails endpoint which returns `screenshots: [{ path_full }]`:
//   https://store.steampowered.com/api/appdetails?appids=<id>&cc=us&l=en

const STEAM_APPDETAILS = 'https://store.steampowered.com/api/appdetails'
const DEFAULT_USER_AGENT = 'the-box-geo-importer/1.0 (+https://github.com/Wifsimster/the-box)'

export interface ImportSteamScreenshotsInput {
  gameId: number
  geoMapId: number
  steamAppId: number
  maxItems?: number
  userAgent?: string
}

export interface ImportSteamScreenshotsResult {
  fetched: number
  inserted: number
  skipped: number
}

interface SteamAppDetailsResponse {
  [appid: string]: {
    success: boolean
    data?: {
      screenshots?: Array<{
        id: number
        path_thumbnail?: string
        path_full?: string
      }>
    }
  }
}

export async function importSteamScreenshots(
  input: ImportSteamScreenshotsInput,
): Promise<ImportSteamScreenshotsResult> {
  const { gameId, geoMapId, steamAppId } = input
  const max = input.maxItems ?? 50
  const ua = input.userAgent ?? DEFAULT_USER_AGENT

  const url = `${STEAM_APPDETAILS}?appids=${steamAppId}&cc=us&l=en`
  log.info({ gameId, steamAppId }, 'fetching steam appdetails')

  const res = await fetch(url, { headers: { 'User-Agent': ua, Accept: 'application/json' } })
  if (!res.ok) {
    throw new Error(`steam appdetails failed: ${res.status} ${res.statusText}`)
  }
  const body = (await res.json()) as SteamAppDetailsResponse
  const shots = body[String(steamAppId)]?.data?.screenshots ?? []

  let inserted = 0
  let skipped = 0
  for (const shot of shots.slice(0, max)) {
    const externalId = `steam:${steamAppId}:${shot.id}`
    const imageUrl = shot.path_full
    if (!imageUrl) {
      skipped++
      continue
    }

    // createCandidate uses ON CONFLICT (source, external_id) DO NOTHING, so
    // re-running this importer is idempotent per Steam screenshot id.
    try {
      await geoScreenshotRepository.createCandidate({
        gameId,
        geoMapId,
        imageUrl,
        thumbnailUrl: shot.path_thumbnail,
        source: 'steam',
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
      (await geoIngestFailureRepository.getAttemptCount(gameId, 'steam')) + 1
    await geoIngestFailureRepository.record({
      gameId,
      source: 'steam',
      reason: 'steam appdetails returned no screenshots',
      retryAfter: tombstoneRetryAfter(attempt),
    })
  } else if (inserted > 0) {
    await geoIngestFailureRepository.clear(gameId, 'steam')
  }

  log.info({ gameId, steamAppId, fetched: shots.length, inserted, skipped }, 'imported steam screenshots')
  return { fetched: shots.length, inserted, skipped }
}
