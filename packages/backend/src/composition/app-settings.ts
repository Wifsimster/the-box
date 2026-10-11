/**
 * Composition root for the generic app-settings store: the domain service
 * bound to the Knex repository and the AES-256-GCM secret box. Separate from
 * services.ts so routes can import it without the BullMQ queues.
 */
import { createAppSettingsService } from '../domain/services/app-settings.service.js'
import { appSettingSecretBox } from '../infrastructure/crypto/secret-box.js'
import { serviceLogger } from '../infrastructure/logger/logger.js'
import { appSettingsRepository } from '../infrastructure/repositories/app-settings.repository.js'

export const appSettingsService = createAppSettingsService({
  repository: appSettingsRepository,
  cipher: appSettingSecretBox,
  logger: serviceLogger,
})
