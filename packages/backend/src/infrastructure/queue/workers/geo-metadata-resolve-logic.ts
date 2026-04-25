import { db } from '../../database/connection.js'
import { queueLogger } from '../../logger/logger.js'
import { geoIngestFailureRepository } from '../../repositories/index.js'
import {
  defaultWikiPageTitles,
  normalizeGameTitle,
  tombstoneRetryAfter,
  wikiSubdomainCandidates,
} from '../../../domain/services/geo-metadata.service.js'

const log = queueLogger.child({ worker: 'geo-metadata-resolve' })

const DEFAULT_USER_AGENT =
  'the-box-geo-importer/1.0 (+https://github.com/Wifsimster/the-box)'
const STEAM_STORESEARCH = 'https://store.steampowered.com/api/storesearch/'
const FANDOM_BASE = (sub: string) => `https://${sub}.fandom.com`

interface CuratedGameRow {
  id: number
  name: string
  slug: string
  steam_app_id: number | null
  wiki_subdomain: string | null
  wiki_page_title: string | null
}

export interface ResolveMetadataResult {
  scanned: number
  resolved: number
  unresolved: number
  skipped: number
}

/**
 * Resolve missing Steam app id, wiki subdomain, and wiki page title for
 * curated games (`geo_curated = true`, `geo_metadata_status = 'pending'`).
 *
 * Strategy:
 *   1. Steam app id: hit Steam's `storesearch` API by game name; pick the
 *      first hit whose normalized title matches.
 *   2. Wiki subdomain + page title: try each `<slug-variant>.fandom.com`
 *      with each likely page title (Interactive_Map, World_Map, Map, …);
 *      first HEAD that returns 200 wins.
 *
 * On full success → status='resolved'. On partial (e.g. wiki found but no
 * Steam) we still mark resolved and let the per-source importers handle
 * missing inputs. On total failure → status='unresolved' + tombstone with
 * exponential backoff so we don't loop.
 */
export async function resolveGeoMetadataBatch(
  batchSize = 25,
): Promise<ResolveMetadataResult> {
  const rows = await db<CuratedGameRow>('games')
    .where('geo_curated', true)
    .where('geo_metadata_status', 'pending')
    .orderBy('id')
    .limit(batchSize)
    .select<CuratedGameRow[]>(
      'id',
      'name',
      'slug',
      'steam_app_id',
      'wiki_subdomain',
      'wiki_page_title',
    )

  let resolved = 0
  let unresolved = 0
  let skipped = 0

  for (const row of rows) {
    try {
      const steamAppId = row.steam_app_id ?? (await resolveSteamAppId(row.name))
      const wiki = row.wiki_subdomain
        ? { subdomain: row.wiki_subdomain, pageTitle: row.wiki_page_title ?? 'Interactive_Map' }
        : await resolveFandomPage(row.slug)

      const haveAnything = Boolean(steamAppId) || Boolean(wiki)
      if (!haveAnything) {
        const attempt =
          (await geoIngestFailureRepository.getAttemptCount(row.id, 'metadata')) + 1
        await geoIngestFailureRepository.record({
          gameId: row.id,
          source: 'metadata',
          reason: 'no Steam appid and no Fandom wiki found',
          retryAfter: tombstoneRetryAfter(attempt),
        })
        await db('games')
          .where({ id: row.id })
          .update({ geo_metadata_status: 'unresolved' })
        unresolved++
        continue
      }

      await db('games')
        .where({ id: row.id })
        .update({
          steam_app_id: steamAppId,
          wiki_subdomain: wiki?.subdomain ?? row.wiki_subdomain,
          wiki_page_title: wiki?.pageTitle ?? row.wiki_page_title,
          geo_metadata_status: 'resolved',
          geo_metadata_resolved_at: new Date(),
        })
      await geoIngestFailureRepository.clear(row.id, 'metadata')
      resolved++
      log.info(
        { gameId: row.id, steamAppId, wiki },
        'resolved geo metadata',
      )
    } catch (err) {
      log.warn({ gameId: row.id, err: String(err) }, 'metadata resolution error')
      skipped++
    }
  }

  return { scanned: rows.length, resolved, unresolved, skipped }
}

async function resolveSteamAppId(name: string): Promise<number | null> {
  try {
    const url = `${STEAM_STORESEARCH}?term=${encodeURIComponent(name)}&l=en&cc=us`
    const res = await fetch(url, {
      headers: { 'User-Agent': DEFAULT_USER_AGENT, Accept: 'application/json' },
    })
    if (!res.ok) return null
    const body = (await res.json()) as { items?: Array<{ id: number; name: string }> }
    if (!body.items?.length) return null
    const target = normalizeGameTitle(name)
    const hit = body.items.find((it) => normalizeGameTitle(it.name) === target) ?? body.items[0]
    return hit?.id ?? null
  } catch (err) {
    log.warn({ name, err: String(err) }, 'steam storesearch failed')
    return null
  }
}

async function resolveFandomPage(
  slug: string,
): Promise<{ subdomain: string; pageTitle: string } | null> {
  const subs = wikiSubdomainCandidates(slug)
  const titles = defaultWikiPageTitles()

  for (const sub of subs) {
    for (const title of titles) {
      const url = `${FANDOM_BASE(sub)}/wiki/${encodeURIComponent(title)}`
      try {
        const res = await fetch(url, {
          method: 'HEAD',
          headers: { 'User-Agent': DEFAULT_USER_AGENT },
          redirect: 'follow',
        })
        if (res.ok) {
          return { subdomain: sub, pageTitle: title }
        }
      } catch {
        // network glitch on a probe is fine — keep trying.
      }
    }
  }
  return null
}
