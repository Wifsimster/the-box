import { importStrategyWikiMap } from './geo-strategywiki-import-logic.js'
import {
  loadSourceIdentity,
  runSourceFetch,
  type FetchOutcomeReport,
} from './maps-fetch-runtime.js'

/**
 * Pipeline-aware StrategyWiki map fetcher. Uses the game's name + slug to
 * search StrategyWiki's MediaWiki API for a matching page and ingest the
 * largest image as the map.
 */
export async function runMapsFetchStrategyWiki(input: {
  gameId: number
  correlationId?: string
}): Promise<FetchOutcomeReport> {
  return runSourceFetch({
    gameId: input.gameId,
    source: 'strategywiki',
    attemptKind: 'map',
    correlationId: input.correlationId,
    fetch: async () => {
      const identity = await loadSourceIdentity(input.gameId)
      if (!identity) {
        return { outcome: 'not_found', errorCode: 'NO_GAME' }
      }

      try {
        const result = await importStrategyWikiMap({
          gameId: input.gameId,
          gameName: identity.name,
          slug: identity.slug,
        })
        if (result.imported) {
          return { outcome: 'success', itemsIngested: 1 }
        }
        return {
          outcome: 'empty',
          errorCode: 'STRATEGYWIKI_NOT_IMPORTED',
          errorDetail: result.reason ? { reason: result.reason } : undefined,
        }
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

function parseStatus(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null
  const m = (err as { message?: string }).message ?? ''
  const match = /(\d{3})/.exec(m)
  return match ? Number(match[1]) : null
}
