import { Router } from 'express'
import { env } from '../../config/env.js'
import { isDescribeGuessLive } from '../../composition/describe-guess.js'
import { logger } from '../../infrastructure/logger/logger.js'

const router = Router()

/**
 * GET /api/features
 *
 * Public, unauthenticated runtime feature flags for the frontend. The SPA is
 * built once into the Docker image, so build-time VITE_ vars can't reflect
 * per-deployment env flips — this endpoint is how the client learns which
 * optional surfaces (nav entries, home-page cards) to render. Only booleans
 * derived from env flags and app settings cross this surface (never a setting
 * value); nothing user- or session-scoped.
 */
router.get('/', async (_req, res, next) => {
  try {
    // From the app-settings store. Fail closed: a store error hides the
    // feature rather than failing the whole flags response.
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
            // Settings describeGuess.enabled AND a stored Anthropic key.
            describeGuess,
        },
    })
  } catch (error) {
    next(error)
  }
})

export default router
