import { Router } from 'express'
import { db } from '../../../infrastructure/database/connection.js'
import {
  geoMapRepository,
} from '../../../infrastructure/repositories/index.js'
import { findRegistryEntryBySlug } from '../../../infrastructure/queue/workers/geo-registry-import-logic.js'

const router = Router()

// ---------- Per-game tier diagnosis ----------

// Returns the four-tier ingestion state for a single game so the admin can see
// at a glance which tiers were tried, which tombstoned, and which would run
// next. Drives the Maps tab's side panel.
router.get('/geo/games/:id/sources', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID' } })
      return
    }

    const game = await db('games')
      .where({ id })
      .first<{
        id: number
        name: string
        slug: string
        wiki_subdomain: string | null
        wiki_page_title: string | null
        wikidata_qid: string | null
      }>('id', 'name', 'slug', 'wiki_subdomain', 'wiki_page_title', 'wikidata_qid')
    if (!game) {
      res.status(404).json({ success: false, error: { code: 'GAME_NOT_FOUND' } })
      return
    }

    const [allMaps, registryEntry, failures] = await Promise.all([
      geoMapRepository.listByGameId(id),
      findRegistryEntryBySlug(game.slug),
      db('geo_ingest_failure')
        .where({ game_id: id })
        .select<
          Array<{
            source: string
            reason: string
            attempt_count: number
            last_attempt_at: Date
            retry_after: Date
          }>
        >('source', 'reason', 'attempt_count', 'last_attempt_at', 'retry_after'),
    ])

    const candidatesBySource = new Map<
      string,
      Array<{
        id: number
        imageUrl: string
        widthPx: number
        heightPx: number
        license: string
        attribution: string | null
        sourceUrl: string | null
        region: string | null
        isActive: boolean
      }>
    >()
    for (const m of allMaps) {
      const list = candidatesBySource.get(m.source) ?? []
      list.push({
        id: m.id,
        imageUrl: m.imageUrl,
        widthPx: m.widthPx,
        heightPx: m.heightPx,
        license: m.license,
        attribution: m.attribution ?? null,
        sourceUrl: m.sourceUrl ?? null,
        region: m.region ?? null,
        isActive: m.isActive,
      })
      candidatesBySource.set(m.source, list)
    }

    const failureBySource = new Map(failures.map((f) => [f.source, f]))
    const now = Date.now()

    type TierCandidate = NonNullable<
      ReturnType<typeof candidatesBySource.get>
    >[number]
    const tier = (
      key:
        | 'registry'
        | 'fandom'
        | 'strategywiki'
        | 'fextralife'
        | 'wand'
        | 'wikidata'
        | 'manual',
      state:
        | {
            status: 'matched'
            via: string
            license?: string
            sourceUrl?: string
            candidates: TierCandidate[]
          }
        | { status: 'tombstoned'; reason: string; attempts: number; retryAfter: Date }
        | { status: 'untried'; reason?: string }
        | { status: 'eligible' },
    ) => ({ tier: key, ...state })

    const sources: Array<ReturnType<typeof tier>> = []

    const matchedTier = (
      key:
        | 'registry'
        | 'fandom'
        | 'strategywiki'
        | 'fextralife'
        | 'wand'
        | 'wikidata'
        | 'manual',
      via: string,
    ): ReturnType<typeof tier> | null => {
      const list = candidatesBySource.get(key)
      if (!list || list.length === 0) return null
      // Surface the active candidate first when present, so the existing
      // "matched" caption (license / sourceUrl) reflects what is currently
      // serving in-game; siblings remain available for the admin to pick.
      const primary = list.find((c) => c.isActive) ?? list[0]!
      return tier(key, {
        status: 'matched',
        via,
        license: primary.license,
        sourceUrl: primary.sourceUrl ?? undefined,
        candidates: list,
      })
    }

    // Tier 1 — Registry
    const registryMatched = matchedTier('registry', 'curated registry')
    if (registryMatched) {
      sources.push(registryMatched)
    } else if (registryEntry) {
      const tomb = failureBySource.get('registry')
      if (tomb && tomb.retry_after.getTime() > now) {
        sources.push(
          tier('registry', {
            status: 'tombstoned',
            reason: tomb.reason,
            attempts: tomb.attempt_count,
            retryAfter: tomb.retry_after,
          }),
        )
      } else {
        sources.push(tier('registry', { status: 'eligible' }))
      }
    } else {
      sources.push(
        tier('registry', { status: 'untried', reason: 'no registry entry for slug' }),
      )
    }

    // Tier 2 — Fandom
    const fandomMatched = matchedTier(
      'fandom',
      `${game.wiki_subdomain ?? '?'}.fandom.com`,
    )
    if (fandomMatched) {
      sources.push(fandomMatched)
    } else if (game.wiki_subdomain && game.wiki_page_title) {
      const tomb = failureBySource.get('fandom')
      if (tomb && tomb.retry_after.getTime() > now) {
        sources.push(
          tier('fandom', {
            status: 'tombstoned',
            reason: tomb.reason,
            attempts: tomb.attempt_count,
            retryAfter: tomb.retry_after,
          }),
        )
      } else {
        sources.push(tier('fandom', { status: 'eligible' }))
      }
    } else {
      sources.push(
        tier('fandom', { status: 'untried', reason: 'no wiki_subdomain / Map: page resolved' }),
      )
    }

    // Tier 3 — StrategyWiki (probes inline, always eligible until tombstoned)
    const strategyMatched = matchedTier('strategywiki', 'strategywiki.org')
    if (strategyMatched) {
      sources.push(strategyMatched)
    } else {
      const tomb = failureBySource.get('strategywiki')
      if (tomb && tomb.retry_after.getTime() > now) {
        sources.push(
          tier('strategywiki', {
            status: 'tombstoned',
            reason: tomb.reason,
            attempts: tomb.attempt_count,
            retryAfter: tomb.retry_after,
          }),
        )
      } else {
        sources.push(tier('strategywiki', { status: 'eligible' }))
      }
    }

    // Tier 4 — Fextralife (probes inline, always eligible until tombstoned)
    const fextralifeMatched = matchedTier('fextralife', 'wiki.fextralife.com')
    if (fextralifeMatched) {
      sources.push(fextralifeMatched)
    } else {
      const tomb = failureBySource.get('fextralife')
      if (tomb && tomb.retry_after.getTime() > now) {
        sources.push(
          tier('fextralife', {
            status: 'tombstoned',
            reason: tomb.reason,
            attempts: tomb.attempt_count,
            retryAfter: tomb.retry_after,
          }),
        )
      } else {
        sources.push(tier('fextralife', { status: 'eligible' }))
      }
    }

    // Tier 5 — Wand (probes inline by slug, always eligible until tombstoned)
    const wandMatched = matchedTier('wand', `wand.com/maps/${game.slug}`)
    if (wandMatched) {
      sources.push(wandMatched)
    } else {
      const tomb = failureBySource.get('wand')
      if (tomb && tomb.retry_after.getTime() > now) {
        sources.push(
          tier('wand', {
            status: 'tombstoned',
            reason: tomb.reason,
            attempts: tomb.attempt_count,
            retryAfter: tomb.retry_after,
          }),
        )
      } else {
        sources.push(tier('wand', { status: 'eligible' }))
      }
    }

    // Tier 6 — Wikidata
    const wikidataMatched = matchedTier('wikidata', game.wikidata_qid ?? 'P242')
    if (wikidataMatched) {
      sources.push(wikidataMatched)
    } else if (game.wikidata_qid) {
      const tomb = failureBySource.get('wikidata')
      if (tomb && tomb.retry_after.getTime() > now) {
        sources.push(
          tier('wikidata', {
            status: 'tombstoned',
            reason: tomb.reason,
            attempts: tomb.attempt_count,
            retryAfter: tomb.retry_after,
          }),
        )
      } else {
        sources.push(tier('wikidata', { status: 'eligible' }))
      }
    } else {
      sources.push(
        tier('wikidata', { status: 'untried', reason: 'wikidata_qid unresolved' }),
      )
    }

    // Tier 7 — Manual
    const manualMatched = matchedTier('manual', 'admin upload')
    if (manualMatched) {
      sources.push(manualMatched)
    } else {
      sources.push(tier('manual', { status: 'untried' }))
    }

    // Multi-map: enabledMaps is the new authoritative list the admin UI
    // renders. `activeMap` is kept on the wire for one release so a
    // stale frontend keeps working — it now carries the capture-default
    // row (the one Steam/RAWG attaches to), which is the closest analog
    // to the legacy single-active row.
    const enabledMaps = allMaps.filter((m) => m.isActive)
    const captureDefault =
      enabledMaps.find((m) => m.isCaptureDefault) ?? enabledMaps[0] ?? null
    const mapSummary = (m: (typeof allMaps)[number]) => ({
      id: m.id,
      source: m.source,
      imageUrl: m.imageUrl,
      license: m.license,
      attribution: m.attribution,
      widthPx: m.widthPx,
      heightPx: m.heightPx,
      region: m.region,
      isCaptureDefault: !!m.isCaptureDefault,
    })

    res.json({
      success: true,
      data: {
        gameId: game.id,
        gameName: game.name,
        slug: game.slug,
        // Deprecated: kept for back-compat; consumers should switch to
        // `enabledMaps` and `captureDefaultMap`.
        activeMap: captureDefault ? mapSummary(captureDefault) : null,
        enabledMaps: enabledMaps.map(mapSummary),
        captureDefaultMap: captureDefault ? mapSummary(captureDefault) : null,
        sources,
      },
    })
  } catch (err) {
    next(err)
  }
})

export default router
