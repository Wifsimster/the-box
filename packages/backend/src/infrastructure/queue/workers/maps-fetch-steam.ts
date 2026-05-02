import { geoMapRepository } from '../../repositories/geo-map.repository.js'
import { importSteamScreenshots } from './geo-steam-import-logic.js'
import {
  loadSourceIdentity,
  runSourceFetch,
  type FetchOutcomeReport,
} from './maps-fetch-runtime.js'

/**
 * Pipeline-aware Steam candidate fetcher. Anchors candidates to the currently
 * selected map for the game (no zone slug); skips if there's no map yet — the
 * pipeline only reaches this stage after map sources have produced one.
 */
export async function runMapsFetchSteam(input: {
  gameId: number
  correlationId?: string
}): Promise<FetchOutcomeReport> {
  return runSourceFetch({
    gameId: input.gameId,
    source: 'steam',
    attemptKind: 'candidates',
    correlationId: input.correlationId,
    fetch: async () => {
      const identity = await loadSourceIdentity(input.gameId)
      if (!identity?.steamAppId) {
        return { outcome: 'not_found', errorCode: 'NO_STEAM_APP_ID' }
      }

      const targetMap = await pickAnchorMap(input.gameId)
      if (!targetMap) {
        return { outcome: 'not_found', errorCode: 'NO_ANCHOR_MAP' }
      }

      try {
        const result = await importSteamScreenshots({
          gameId: input.gameId,
          geoMapId: targetMap.id,
          steamAppId: identity.steamAppId,
        })
        if (result.inserted === 0 && result.fetched === 0) {
          return { outcome: 'empty', itemsIngested: 0 }
        }
        return { outcome: 'success', itemsIngested: result.inserted }
      } catch (err) {
        const status = parseStatus(err)
        if (status === 404) return { outcome: 'not_found', httpStatus: 404 }
        if (status === 429) return { outcome: 'rate_limited', httpStatus: 429 }
        if (status && status >= 500) return { outcome: 'http_5xx', httpStatus: status }
        // Bubble up: BullMQ will retry, runtime records `parse_error`.
        throw err
      }
    },
  })
}

async function pickAnchorMap(gameId: number) {
  // Prefer the admin-selected map for the world (NULL zone_slug). Fall back
  // to any selected zone, then the first enabled map.
  const world = await geoMapRepository.findSelectedByZone(gameId, null)
  if (world) return world
  const list = await geoMapRepository.listEnabledByGameId(gameId)
  return list[0] ?? null
}

function parseStatus(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null
  const m = (err as { message?: string }).message ?? ''
  const match = /failed:\s*(\d{3})/i.exec(m)
  return match ? Number(match[1]) : null
}
