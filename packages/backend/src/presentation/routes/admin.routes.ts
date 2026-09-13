/**
 * Admin API composition root.
 *
 * This module owns exactly one responsibility: applying the admin guard and
 * mounting the focused sub-routers that each own a single admin concern.
 * Every handler lives in `./admin/<concern>.routes.ts`; nothing is defined
 * here. Adding an admin surface means adding a module and one `use()` line —
 * this file never grows a handler.
 *
 * Mount order is irrelevant to URLs (each sub-router declares full paths),
 * but it is kept alphabetical-by-concern-group for readability.
 */
import { Router } from 'express'
import { adminMiddleware } from '../middleware/auth.middleware.js'

import analyticsRoutes from './admin/analytics.routes.js'
import batchJobsRoutes from './admin/batch-jobs.routes.js'
import billingRoutes from './admin/billing.routes.js'
import challengesRoutes from './admin/challenges.routes.js'
import emailRoutes from './admin/email.routes.js'
import gamesRoutes from './admin/games.routes.js'
import geoDiagnosticsRoutes from './admin/geo-diagnostics.routes.js'
import geoIngestRoutes from './admin/geo-ingest.routes.js'
import geoMapImportRoutes from './admin/geo-map-import.routes.js'
import geoMapsRoutes from './admin/geo-maps.routes.js'
import geoReviewRoutes from './admin/geo-review.routes.js'
import geogamersRoutes from './admin/geogamers.routes.js'
import jobsRoutes from './admin/jobs.routes.js'
import moderationRoutes from './admin/moderation.routes.js'
import scrapingRoutes from './admin/scraping.routes.js'
import screenshotsRoutes from './admin/screenshots.routes.js'

const router = Router()

// All admin routes require authentication + the admin role.
router.use(adminMiddleware)

// Catalog
router.use(gamesRoutes)
router.use(screenshotsRoutes)
router.use(challengesRoutes)

// Job queue
router.use(jobsRoutes)
router.use(batchJobsRoutes)

// Operations
router.use(emailRoutes)
router.use(analyticsRoutes)
router.use(moderationRoutes)
router.use(billingRoutes)
router.use(scrapingRoutes)

// Geo mode
router.use(geoReviewRoutes)
router.use(geoDiagnosticsRoutes)
router.use(geoMapsRoutes)
router.use(geoIngestRoutes)
router.use(geoMapImportRoutes)
router.use(geogamersRoutes)

export default router
