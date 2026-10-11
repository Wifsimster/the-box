/**
 * Settings over the agent API, for the settings MCP tools
 * (packages/geo-agent-mcp: list_settings / get_setting / set_setting).
 *
 * Mounted at /api/agent/v1/settings. Chain: agent key auth → per-key rate
 * limit → scope `admin:settings` (admin-minted keys only, never a streamer
 * key) → the key's owner must still be an admin. No env kill switch: the
 * owner wants configuration out of env vars, so the kill switch is revoking
 * the key (Admin → agent keys). Every write lands in admin_audit_log with the
 * key owner as actor and the key id, never a secret value.
 */
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
