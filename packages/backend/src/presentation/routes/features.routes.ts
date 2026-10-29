import { Router } from 'express'
import { env } from '../../config/env.js'
import { isDescribeGuessLive } from '../../composition/describe-guess.js'
import { logger } from '../../infrastructure/logger/logger.js'

const router = Router()

router.get('/', async (_req, res, next) => {
  try {
    const describeGuess = await isDescribeGuessLive().catch((err: unknown) => {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'features: describe-guess settings unreadable')
      return false
    })
    res.set('Cache-Control', 'public, max-age=60')
    res.json({
        success: true,
        data: {
            geoCommunity: env.GEO_COMMUNITY_ENABLED === 'true',
            geogamers: env.GEOGAMERS_ENABLED === 'true',
            describeGuess,
        },
    })
  } catch (error) {
    next(error)
  }
})

export default router
