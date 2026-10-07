/**
 * Refresh Game Aliases Logic
 *
 * Fills `games.aliases` from RAWG `alternative_names` for every game already
 * in the catalogue — the French release titles players type ("Pokémon Épée",
 * "Les Sims"). Unlike sync-all, it imports nothing: no new games, no
 * screenshots, no other metadata. It walks our own games (not a RAWG listing),
 * so every game with a RAWG id or RAWG slug is covered.
 *
 * Aliases are only ever added (mergeGameAliases keeps curated ones first).
 */

import { env } from '../../../config/env.js'
import { queueLogger } from '../../logger/logger.js'
import { gameRepository } from '../../repositories/game.repository.js'
import { mergeGameAliases } from '../../../domain/services/game-aliases.service.js'

const log = queueLogger.child({ module: 'refresh-game-aliases' })

// Same budget as the other RAWG workers (20 req/min).
const RAWG_REQUEST_INTERVAL_MS = 3000
// Games per job (~5 min at 3s each). The import queue runs one job at a time
// and also carries the daily-challenge job, so a full pass is split into
// chained batches that let other jobs run in between.
export const ALIAS_REFRESH_BATCH_SIZE = 100

export type ProgressCallback = (current: number, total: number) => void

export interface AliasRefreshGame {
  id: number
  name: string
  slug: string
  aliases: string[]
  rawgId?: number
}

export interface RefreshGameAliasesDeps {
  games: AliasRefreshGame[]
  /** RAWG `alternative_names` for a game id or slug; null when RAWG doesn't know it. */
  fetchAlternativeNames: (rawgIdOrSlug: number | string) => Promise<string[] | null>
  saveAliases: (gameId: number, aliases: string[]) => Promise<void>
  onProgress?: ProgressCallback
}

export interface RefreshGameAliasesResult {
  gamesProcessed: number
  gamesUpdated: number
  aliasesAdded: number
  notFound: number
  failedCount: number
  message: string
}

/** Core loop, I/O injected so it is unit-testable. */
export async function refreshAliasesForGames(
  deps: RefreshGameAliasesDeps
): Promise<RefreshGameAliasesResult> {
  const { games, fetchAlternativeNames, saveAliases, onProgress } = deps
  let gamesUpdated = 0
  let aliasesAdded = 0
  let notFound = 0
  let failedCount = 0

  for (let i = 0; i < games.length; i++) {
    const game = games[i]!
    try {
      const names = await fetchAlternativeNames(game.rawgId ?? game.slug)
      if (names === null) {
        notFound++
      } else {
        const merged = mergeGameAliases(game.name, game.aliases, names)
        if (merged.length > game.aliases.length) {
          await saveAliases(game.id, merged)
          gamesUpdated++
          aliasesAdded += merged.length - game.aliases.length
          log.info({ gameId: game.id, name: game.name, added: merged.slice(game.aliases.length) }, 'aliases added')
        }
      }
    } catch (error) {
      failedCount++
      log.warn({ gameId: game.id, name: game.name, error: String(error) }, 'alias refresh failed for game')
    }
    onProgress?.(i + 1, games.length)
  }

  const message =
    `${aliasesAdded} aliases added to ${gamesUpdated} games ` +
    `(${games.length} checked, ${notFound} unknown to RAWG, ${failedCount} failed)`
  return { gamesProcessed: games.length, gamesUpdated, aliasesAdded, notFound, failedCount, message }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Job entry point: one batch of catalogue games (ordered by id, starting at
 * `offset`), RAWG details one by one. The worker enqueues `nextOffset`.
 * (No queue import here: it would open a Redis connection in unit tests.)
 */
export async function refreshGameAliases(
  offset: number,
  onProgress?: ProgressCallback
): Promise<RefreshGameAliasesResult & { nextOffset: number | null }> {
  const apiKey = env.RAWG_API_KEY
  if (!apiKey) {
    throw new Error('RAWG_API_KEY environment variable is required')
  }

  const allGames = [...(await gameRepository.findAll())].sort((a, b) => a.id - b.id)
  const games = allGames.slice(offset, offset + ALIAS_REFRESH_BATCH_SIZE)
  const nextOffset = offset + games.length < allGames.length ? offset + games.length : null
  log.info({ offset, batch: games.length, total: allGames.length }, 'starting alias refresh batch')

  let lastRequestAt = 0
  const fetchAlternativeNames = async (rawgIdOrSlug: number | string): Promise<string[] | null> => {
    const wait = lastRequestAt + RAWG_REQUEST_INTERVAL_MS - Date.now()
    if (wait > 0) await sleep(wait)
    lastRequestAt = Date.now()

    const url = new URL(`https://api.rawg.io/api/games/${encodeURIComponent(String(rawgIdOrSlug))}`)
    url.searchParams.set('key', apiKey)
    const response = await fetch(url.toString())
    if (response.status === 404) return null
    if (response.status === 429) {
      log.warn('RAWG rate limit (429), waiting 60s')
      await sleep(60000)
      return fetchAlternativeNames(rawgIdOrSlug)
    }
    if (!response.ok) throw new Error(`RAWG API error: ${response.status} ${response.statusText}`)
    const body = (await response.json()) as { alternative_names?: string[] }
    return body.alternative_names ?? []
  }

  const result = await refreshAliasesForGames({
    games: games.map(g => ({
      id: g.id,
      name: g.name,
      slug: g.slug,
      aliases: g.aliases ?? [],
      rawgId: g.rawgId,
    })),
    fetchAlternativeNames,
    saveAliases: async (gameId, aliases) => {
      await gameRepository.update(gameId, { aliases })
    },
    onProgress,
  })
  log.info({ ...result, offset, nextOffset }, 'alias refresh batch complete')

  const range = `games ${offset + 1}-${offset + games.length} of ${allGames.length}`
  return {
    ...result,
    nextOffset,
    message: `${range}: ${result.message}${nextOffset !== null ? ' — next batch queued' : ' — done'}`,
  }
}
