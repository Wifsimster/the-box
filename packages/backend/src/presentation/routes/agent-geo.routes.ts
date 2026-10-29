import { Router } from 'express'
import { requireApiKey } from '../middleware/public-api.middleware.js'
import {
  agentApiRateLimit,
  requireAgentApiEnabled,
} from '../middleware/agent-api.middleware.js'

import capturesRoutes from './agent-geo/captures.routes.js'
import catalogRoutes from './agent-geo/catalog.routes.js'
import ingestRoutes from './agent-geo/ingest.routes.js'
import mapsRoutes from './agent-geo/maps.routes.js'
import pinsRoutes from './agent-geo/pins.routes.js'

const router = Router()

router.use(requireAgentApiEnabled)
router.use(requireApiKey())
router.use(agentApiRateLimit)

router.use(catalogRoutes)
router.use(capturesRoutes)
router.use(mapsRoutes)

router.use(ingestRoutes)
router.use(pinsRoutes)

export default router
