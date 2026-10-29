import { Router } from 'express'
import { z } from 'zod'
import {
  geoMapRepository,
} from '../../../infrastructure/repositories/index.js'

const router = Router()


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
