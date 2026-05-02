import { geoMapRepository } from '../../repositories/geo-map.repository.js'
import { importRawgScreenshots } from './geo-rawg-import-logic.js'
import {
  loadSourceIdentity,
  runSourceFetch,
  type FetchOutcomeReport,
} from './maps-fetch-runtime.js'

/**
 * Pipeline-aware RAWG candidate fetcher. Mirrors the Steam shim — wraps the
 * existing importer with rate-limit + circuit-breaker + attempt-log.
 */
export async function runMapsFetchRawg(input: {
  gameId: number
  correlationId?: string
}): Promise<FetchOutcomeReport> {
  return runSourceFetch({
    gameId: input.gameId,
    source: 'rawg',
    attemptKind: 'candidates',
    correlationId: input.correlationId,
    fetch: async () => {
      const identity = await loadSourceIdentity(input.gameId)
      if (!identity?.rawgId) {
        return { outcome: 'not_found', errorCode: 'NO_RAWG_ID' }
      }

      const targetMap = await pickAnchorMap(input.gameId)
      if (!targetMap) {
        return { outcome: 'not_found', errorCode: 'NO_ANCHOR_MAP' }
      }

      try {
        const result = await importRawgScreenshots({
          gameId: input.gameId,
          geoMapId: targetMap.id,
          rawgId: identity.rawgId,
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
        throw err
      }
    },
  })
}

async function pickAnchorMap(gameId: number) {
  const world = await geoMapRepository.findSelectedByZone(gameId, null)
  if (world) return world
  const list = await geoMapRepository.listEnabledByGameId(gameId)
  return list[0] ?? null
}

function parseStatus(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null
  const m = (err as { message?: string }).message ?? ''
  const match = /(\d{3})/.exec(m)
  return match ? Number(match[1]) : null
}
