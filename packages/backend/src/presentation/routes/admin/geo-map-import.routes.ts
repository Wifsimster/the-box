import { Router } from 'express'
import { z } from 'zod'
import { recordAdminGeoAudit } from '../../middleware/admin-audit.js'
import { db } from '../../../infrastructure/database/connection.js'
import {
  geoMapRepository,
} from '../../../infrastructure/repositories/index.js'
import {
  importWandMap,
  isWandUrl,
} from '../../../infrastructure/queue/workers/geo-wand-import-logic.js'

const router = Router()


// ---------- Tier 3 manual map upload ----------

// Last-resort fallback when Tiers 1–2 (registry / Fandom / Wikidata) didn't
// produce a usable map. Admin supplies a URL they've verified themselves
// (publisher press kit, commissioned art, hand-drawn fan map with explicit
// permission), declares license + attribution, and we record it as a
// `source = 'manual'` row. No image processing happens server-side — the
// admin is responsible for hosting the asset somewhere stable.
const manualGeoMapBodySchema = z.object({
  gameId: z.number().int().positive(),
  imageUrl: z.string().url().max(1000),
  widthPx: z.number().int().positive().max(32_768),
  heightPx: z.number().int().positive().max(32_768),
  license: z.string().min(1).max(100),
  attribution: z.string().max(500).optional(),
  sourceUrl: z.string().url().max(1000).optional(),
  consensusRadius: z.number().min(0.001).max(1).optional(),
  // Optional region label (e.g. "Velen", "Act II") for multi-map games.
  // Omit / empty for the canonical world map. Stored on geo_map.region.
  region: z.string().trim().min(1).max(100).optional(),
  // If true, the existing active map for this game is deactivated first so
  // the new one becomes canonical without violating the unique
  // (game_id, image_url) constraint when the URLs differ.
  replaceActive: z.boolean().optional(),
})

router.post('/geo/maps/manual', async (req, res, next) => {
  try {
    const parse = manualGeoMapBodySchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parse.error.issues[0]?.message },
      })
      return
    }
    const data = parse.data

    const game = await db('games').where({ id: data.gameId }).first<{ id: number }>()
    if (!game) {
      res.status(404).json({ success: false, error: { code: 'GAME_NOT_FOUND' } })
      return
    }

    // Multi-map mode: a game can have many enabled maps. `replaceActive`
    // means "enable this new map after creating it" — without it the row
    // lands disabled and the admin enables from the Cartes panel.
    const enableImmediately = !!data.replaceActive

    // create() opens its own transaction internally; running the
    // tombstone clears in a SECOND transaction is fine because they're
    // independently idempotent (the create + enable is the only
    // multi-step write that needs atomicity, and create() handles that).
    // Single whereIn delete instead of 6 round-trips.
    const map = await geoMapRepository.create({
      gameId: data.gameId,
      source: 'manual',
      sourceUrl: data.sourceUrl,
      imageUrl: data.imageUrl,
      widthPx: data.widthPx,
      heightPx: data.heightPx,
      license: data.license,
      attribution: data.attribution,
      consensusRadius: data.consensusRadius,
      region: data.region,
      isActive: enableImmediately,
    })

    if (enableImmediately) {
      await geoMapRepository.enableForGame(data.gameId, map.id)
    }

    await db('geo_ingest_failure')
      .where({ game_id: data.gameId })
      .whereIn('source', [
        'registry',
        'fandom',
        'strategywiki',
        'fextralife',
        'wand',
        'wikidata',
      ])
      .del()

    await recordAdminGeoAudit(req, {
      action: 'geo.maps.manual',
      target: { kind: 'geo-map', id: map.id },
      after: {
        gameId: data.gameId,
        source: 'manual',
        sourceUrl: data.sourceUrl,
        license: data.license,
        enableImmediately,
      },
    })
    res.json({ success: true, data: map })
  } catch (err) {
    next(err)
  }
})

// ---------- Wand map import ----------

// Admin pastes a wand.com map page URL (e.g. https://wand.com/maps/elden-ring)
// and the server scrapes the page's `og:image` to record a `source = 'wand'`
// row. Synchronous on purpose so the operator sees the resolved image URL +
// dimensions immediately and can fall back to the manual route if Wand
// returned a Cloudflare challenge or moved the slug.
const wandGeoMapBodySchema = z.object({
  gameId: z.number().int().positive(),
  wandUrl: z.string().url().max(1000),
  region: z.string().trim().min(1).max(100).optional(),
  replaceActive: z.boolean().optional(),
})

router.post('/geo/maps/wand', async (req, res, next) => {
  try {
    const parse = wandGeoMapBodySchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parse.error.issues[0]?.message },
      })
      return
    }
    const data = parse.data

    if (!isWandUrl(data.wandUrl)) {
      res.status(400).json({
        success: false,
        error: { code: 'NOT_WAND_URL', message: 'wandUrl must be on wand.com' },
      })
      return
    }

    const game = await db('games').where({ id: data.gameId }).first<{ id: number }>()
    if (!game) {
      res.status(404).json({ success: false, error: { code: 'GAME_NOT_FOUND' } })
      return
    }

    // Multi-map: a game can have many enabled maps simultaneously. The
    // legacy `replaceActive` flag now means "enable the imported map and
    // deactivate the previously-enabled siblings" (back-compat for
    // operators who explicitly want a swap). Without it, the wand
    // import lands as inactive — admin enables it from the Cartes panel.
    const result = await importWandMap({
      gameId: data.gameId,
      wandUrl: data.wandUrl,
      region: data.region,
    })

    if (!result.imported) {
      res.status(422).json({
        success: false,
        error: { code: 'WAND_IMPORT_FAILED', message: result.reason },
      })
      return
    }

    if (data.replaceActive && result.geoMapId) {
      // Disable currently-enabled siblings so the freshly imported row
      // is the only one playable. Multi-map sibling-aware: skips itself.
      const enabled = await geoMapRepository.listEnabledByGameId(data.gameId)
      for (const sibling of enabled) {
        if (sibling.id !== result.geoMapId) {
          // Best-effort disable; swallow LAST_ENABLED since we're about
          // to enable the new map below.
          await geoMapRepository.deactivate(sibling.id)
        }
      }
      await geoMapRepository.enableForGame(data.gameId, result.geoMapId)
    }

    const map = result.geoMapId
      ? await geoMapRepository.findById(result.geoMapId)
      : null

    res.json({ success: true, data: map })
  } catch (err) {
    next(err)
  }
})


export default router
