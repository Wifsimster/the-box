import {
  importWandMap,
  wandUrlForSlug,
} from './geo-wand-import-logic.js'
import {
  loadSourceIdentity,
  runSourceFetch,
  type FetchOutcomeReport,
} from './maps-fetch-runtime.js'

/**
 * Pipeline-aware Wand.com map fetcher. Synthesises the wand.com URL from the
 * game's slug — wand.com/fr/maps/<slug> — and lets the existing scraper
 * extract the og:image. If the page 404s the orchestrator advances to the
 * next provider.
 */
export async function runMapsFetchWand(input: {
  gameId: number
  correlationId?: string
}): Promise<FetchOutcomeReport> {
  return runSourceFetch({
    gameId: input.gameId,
    source: 'wand',
    attemptKind: 'map',
    correlationId: input.correlationId,
    fetch: async () => {
      const identity = await loadSourceIdentity(input.gameId)
      if (!identity?.slug) {
        return { outcome: 'not_found', errorCode: 'NO_GAME_SLUG' }
      }
      const wandUrl = wandUrlForSlug(identity.slug)

      try {
        const result = await importWandMap({
          gameId: input.gameId,
          wandUrl,
        })
        if (result.imported) {
          return { outcome: 'success', itemsIngested: 1 }
        }
        return {
          outcome: 'empty',
          errorCode: 'WAND_NOT_IMPORTED',
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
