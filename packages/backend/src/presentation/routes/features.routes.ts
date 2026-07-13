import { Router } from 'express'
import { env } from '../../config/env.js'

const router = Router()

/**
 * GET /api/features
 *
 * Public, unauthenticated runtime feature flags for the frontend. The SPA is
 * built once into the Docker image, so build-time VITE_ vars can't reflect
 * per-deployment env flips — this endpoint is how the client learns which
 * optional surfaces (nav entries, home-page cards) to render. Only booleans
 * derived from env flags cross this surface; nothing user- or session-scoped.
 */
router.get('/', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=60')
    res.json({
        success: true,
        data: {
            geoCommunity: env.GEO_COMMUNITY_ENABLED === 'true',
            geogamers: env.GEOGAMERS_ENABLED === 'true',
        },
    })
})

export default router
