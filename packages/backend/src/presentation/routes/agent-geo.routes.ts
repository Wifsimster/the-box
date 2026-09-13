/**
 * Agent geo API composition root.
 *
 * Owns one responsibility: the middleware chain every agent geo route sits
 * behind, and mounting the five focused routers. Handlers live in
 * `./agent-geo/<concern>.routes.ts`; nothing is defined here.
 *
  Agent content-sourcing surface (issue #331). Started read-only (phase 2),
  then grew a write surface in stages: ingest triggers (phase 3), downweighted
  pin proposals (phase 4), and content creation & curation (phase 5 — enroll
  games, top up captures, select/reject candidate maps).
 
  Mounted at /api/agent/v1/geo. Key-authenticated with admin-minted geo-agent
  keys, NOT session-authed and NOT the streamer public API. Every route sits
  behind: kill switch → key auth → per-key rate limit → scope check. Curate
  routes (phase 5) sit behind a SECOND independent kill switch
  (requireAgentCurateEnabled) so an operator can run read/ingest/propose in
  production while curation stays dark.
 
  A key never elevates access beyond what the admin UI already lets an
  operator do: curate writes only reach geo_curated flip, screenshot-candidate
  insert, and map select/disable — the same primitives the admin Games and
  geo-fetch panels use. No user identities or PII cross this surface
  (candidate payloads carry pin counts, not pin owners).
 */
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

// Order matters: enable-gate first (cheapest reject), then authenticate, then
// rate-limit per key. Scope is checked per route since the endpoints on this
// surface carry different scopes.
router.use(requireAgentApiEnabled)
router.use(requireApiKey())
router.use(agentApiRateLimit)

// Read surface
router.use(catalogRoutes)
router.use(capturesRoutes)
router.use(mapsRoutes)

// Write surface (each route additionally checks its own scope + budget)
router.use(ingestRoutes)
router.use(pinsRoutes)

export default router
