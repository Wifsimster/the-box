import { importFandomMap } from './geo-fandom-import-logic.js'
import {
  loadSourceIdentity,
  runSourceFetch,
  type FetchOutcomeReport,
} from './maps-fetch-runtime.js'

/**
 * Pipeline-aware Fandom map fetcher. Requires wiki_subdomain + wiki_page_title
 * to be resolved on the games row (the metadata-resolve worker fills these in
 * automatically; admins can also set them manually).
 */
export async function runMapsFetchFandom(input: {
  gameId: number
  correlationId?: string
}): Promise<FetchOutcomeReport> {
  return runSourceFetch({
    gameId: input.gameId,
    source: 'fandom',
    attemptKind: 'map',
    correlationId: input.correlationId,
    fetch: async () => {
      const identity = await loadSourceIdentity(input.gameId)
      if (!identity?.wikiSubdomain || !identity.wikiPageTitle) {
        return { outcome: 'not_found', errorCode: 'NO_FANDOM_METADATA' }
      }

      try {
        const result = await importFandomMap({
          gameId: input.gameId,
          wikiSubdomain: identity.wikiSubdomain,
          pageTitle: identity.wikiPageTitle,
        })
        if (result.imported) {
          return { outcome: 'success', itemsIngested: 1 }
        }
        // Reasons range from "already imported" (idempotent re-run) to
        // "no backgroundImage in API response". Treat as empty either way;
        // cooldown engages and the orchestrator advances.
        return {
          outcome: 'empty',
          errorCode: 'FANDOM_NOT_IMPORTED',
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
