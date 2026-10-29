import { Router } from 'express'
import { gameRepository, geoIngestFailureRepository } from '../../../infrastructure/repositories/index.js'
import { z } from 'zod'
import { recordAdminGeoAudit } from '../../middleware/admin-audit.js'
import {
  geoMapRepository,
} from '../../../infrastructure/repositories/index.js'
import {
  importWandMap,
  isWandUrl,
} from '../../../infrastructure/queue/workers/geo-wand-import-logic.js'

const router = Router()


const manualGeoMapBodySchema = z.object({
  gameId: z.number().int().positive(),
  imageUrl: z.string().url().max(1000),
  widthPx: z.number().int().positive().max(32_768),
  heightPx: z.number().int().positive().max(32_768),
  license: z.string().min(1).max(100),
  attribution: z.string().max(500).optional(),
  sourceUrl: z.string().url().max(1000).optional(),
  consensusRadius: z.number().min(0.001).max(1).optional(),
  region: z.string().trim().min(1).max(100).optional(),
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

    const gameExists = await gameRepository.exists(data.gameId)
    if (!gameExists) {
      res.status(404).json({ success: false, error: { code: 'GAME_NOT_FOUND' } })
      return
    }

    const enableImmediately = !!data.replaceActive

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

    await geoIngestFailureRepository.clearSources(data.gameId, [
      'registry',
      'fandom',
      'strategywiki',
      'fextralife',
      'wand',
      'wikidata',
    ])

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

    const gameExists = await gameRepository.exists(data.gameId)
    if (!gameExists) {
      res.status(404).json({ success: false, error: { code: 'GAME_NOT_FOUND' } })
      return
    }

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
      const enabled = await geoMapRepository.listEnabledByGameId(data.gameId)
      for (const sibling of enabled) {
        if (sibling.id !== result.geoMapId) {
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
