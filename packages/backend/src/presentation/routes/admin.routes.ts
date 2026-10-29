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
import describeGuessRoutes from './admin/describe-guess.routes.js'
import { createSettingsRouter } from './settings.router.js'
import { recordAdminGeoAudit } from '../middleware/admin-audit.js'
import { appSettingsService } from '../../composition/app-settings.js'

const router = Router()

router.use(adminMiddleware)

router.use(gamesRoutes)
router.use(screenshotsRoutes)
router.use(challengesRoutes)

router.use(jobsRoutes)
router.use(batchJobsRoutes)

router.use(emailRoutes)
router.use(analyticsRoutes)
router.use(moderationRoutes)
router.use(billingRoutes)
router.use(scrapingRoutes)
router.use(describeGuessRoutes)

router.use('/settings', createSettingsRouter({ settings: appSettingsService, audit: recordAdminGeoAudit, channel: 'admin-ui' }))

router.use(geoReviewRoutes)
router.use(geoDiagnosticsRoutes)
router.use(geoMapsRoutes)
router.use(geoIngestRoutes)
router.use(geoMapImportRoutes)
router.use(geogamersRoutes)

export default router
