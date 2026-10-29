import { requireApiKey } from '../middleware/public-api.middleware.js'
import { agentApiRateLimit, requireKeyOwnerAdmin, requireScope } from '../middleware/agent-api.middleware.js'
import { recordAdminGeoAudit } from '../middleware/admin-audit.js'
import { appSettingsService } from '../../composition/app-settings.js'
import { createSettingsRouter } from './settings.router.js'
import { Router } from 'express'

const router = Router()
router.use(requireApiKey(), agentApiRateLimit, requireScope('admin:settings'), requireKeyOwnerAdmin)
router.use(createSettingsRouter({ settings: appSettingsService, audit: recordAdminGeoAudit, channel: 'agent-key' }))

export default router
