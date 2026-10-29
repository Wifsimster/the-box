import { Router, type Request } from 'express'
import { z } from 'zod'
import type { AppSettingView } from '@the-box/types'
import {
  AppSettingError,
  type AppSettingsService,
  type SettingAuditSnapshot,
} from '../../domain/services/app-settings.service.js'

export interface SettingsAuditEntry {
  action: 'app_setting.update'
  target: { kind: 'app_setting'; id: string }
  before: SettingAuditSnapshot['before']
  after: SettingAuditSnapshot['after'] & { via: SettingsChannel; keyId?: number }
}

export type SettingsChannel = 'admin-ui' | 'agent-key'

export interface SettingsRouterDeps {
  settings: Pick<AppSettingsService, 'list' | 'get' | 'set'>
  audit: (req: Request, entry: SettingsAuditEntry) => Promise<void>
  channel: SettingsChannel
}

const writeBody = z.object({
  value: z.union([z.boolean(), z.number(), z.string().max(1000), z.null()]),
})

export function createSettingsRouter(deps: SettingsRouterDeps): Router {
  const router = Router()

  const fail = (error: unknown, res: import('express').Response, next: import('express').NextFunction) => {
    if (error instanceof AppSettingError) {
      res.status(error.statusCode).json({ success: false, error: { code: error.code, message: error.message } })
      return
    }
    next(error)
  }

  router.get('/', async (_req, res, next) => {
    try {
      const data: AppSettingView[] = await deps.settings.list()
      res.json({ success: true, data })
    } catch (error) {
      fail(error, res, next)
    }
  })

  router.get('/:key', async (req, res, next) => {
    try {
      const data: AppSettingView = await deps.settings.get(String(req.params['key']))
      res.json({ success: true, data })
    } catch (error) {
      fail(error, res, next)
    }
  })

  const write: import('express').RequestHandler = async (req, res, next) => {
    try {
      const parsed = writeBody.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Body must be { "value": boolean | number | string | null }' },
        })
        return
      }
      const key = String(req.params['key'])
      const { view, audit } = await deps.settings.set(key, parsed.data.value, req.userId ?? null)
      await deps.audit(req, {
        action: 'app_setting.update',
        target: { kind: 'app_setting', id: key },
        before: audit.before,
        after: {
          ...audit.after,
          via: deps.channel,
          ...(req.apiKey ? { keyId: req.apiKey.id } : {}),
        },
      })
      res.json({ success: true, data: view })
    } catch (error) {
      fail(error, res, next)
    }
  }
  router.put('/:key', write)
  router.post('/:key', write)

  return router
}
