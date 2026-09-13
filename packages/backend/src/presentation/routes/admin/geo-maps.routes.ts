import { Router } from 'express'
import { z } from 'zod'
import {
  geoMapRepository,
} from '../../../infrastructure/repositories/index.js'

const router = Router()


// Multi-map: enable a specific geo_map row for a game. Multiple maps can
// be enabled simultaneously (BG3 → Nautiloid + Wilderness + …). When the
// game had zero enabled maps before this call the same map is also
// promoted to capture-default so ingest has a target.
const enableMapBodySchema = z.object({
  geoMapId: z.number().int().positive(),
})

router.post('/geo/games/:id/maps/enable', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID' } })
      return
    }
    const parse = enableMapBodySchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parse.error.issues[0]?.message },
      })
      return
    }
    const map = await geoMapRepository.enableForGame(id, parse.data.geoMapId)
    if (!map) {
      res.status(404).json({
        success: false,
        error: {
          code: 'MAP_NOT_FOUND',
          message: 'no geo_map row with that id for this game',
        },
      })
      return
    }
    res.json({ success: true, data: map })
  } catch (err) {
    next(err)
  }
})

// Multi-map: disable a single map. Refuses with 409 LAST_ENABLED if it
// would leave the game with zero enabled maps. The capture-default role
// is auto-handed to a sibling if the disabled row held it.
router.post('/geo/games/:id/maps/disable', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID' } })
      return
    }
    const parse = enableMapBodySchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parse.error.issues[0]?.message },
      })
      return
    }
    const result = await geoMapRepository.disableForGame(id, parse.data.geoMapId)
    if (!result.ok) {
      const status = result.reason === 'NOT_FOUND' ? 404 : 409
      res.status(status).json({
        success: false,
        error: {
          code: result.reason,
          message:
            result.reason === 'LAST_ENABLED'
              ? 'cannot disable the last enabled map for a game'
              : 'no geo_map row with that id for this game',
        },
      })
      return
    }
    res.json({ success: true, data: result.map })
  } catch (err) {
    next(err)
  }
})

// Multi-map: pick which enabled map Steam/RAWG capture providers attach
// new candidates to. At most one row per game holds the role; the partial
// unique index `geo_map_one_capture_default_per_game` enforces it.
router.post('/geo/games/:id/maps/capture-default', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID' } })
      return
    }
    const parse = enableMapBodySchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parse.error.issues[0]?.message },
      })
      return
    }
    const map = await geoMapRepository.setCaptureDefault(id, parse.data.geoMapId)
    if (!map) {
      res.status(404).json({
        success: false,
        error: {
          code: 'MAP_NOT_FOUND',
          message: 'map must be enabled for this game before becoming capture default',
        },
      })
      return
    }
    res.json({ success: true, data: map })
  } catch (err) {
    next(err)
  }
})

// Inline region edit. Sending an empty string or null clears the region
// (game collapses back to a single "world map" presentation).
const updateMapBodySchema = z.object({
  region: z.string().max(100).nullable().optional(),
})

router.patch('/geo/maps/:mapId', async (req, res, next) => {
  try {
    const mapId = Number(req.params.mapId)
    if (!Number.isFinite(mapId) || mapId <= 0) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID' } })
      return
    }
    const parse = updateMapBodySchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parse.error.issues[0]?.message },
      })
      return
    }
    const updated =
      parse.data.region !== undefined
        ? await geoMapRepository.updateRegion(mapId, parse.data.region ?? null)
        : await geoMapRepository.findById(mapId)
    if (!updated) {
      res.status(404).json({ success: false, error: { code: 'MAP_NOT_FOUND' } })
      return
    }
    res.json({ success: true, data: updated })
  } catch (err) {
    next(err)
  }
})

// Deprecated: routes through to `/maps/enable` for one release so a stale
// frontend keeps working. Remove next release.
router.post('/geo/games/:id/active-map', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID' } })
      return
    }
    const parse = enableMapBodySchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parse.error.issues[0]?.message },
      })
      return
    }
    const map = await geoMapRepository.enableForGame(id, parse.data.geoMapId)
    if (!map) {
      res.status(404).json({
        success: false,
        error: { code: 'MAP_NOT_FOUND' },
      })
      return
    }
    res.json({ success: true, data: map })
  } catch (err) {
    next(err)
  }
})


export default router
