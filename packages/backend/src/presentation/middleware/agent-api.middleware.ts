import type { Request, Response, NextFunction } from 'express'
import type { ApiKeyScope } from '@the-box/types'
import { isAgentScope } from '@the-box/types'
import { env } from '../../config/env.js'
import { createRateLimiter } from './rate-limit.middleware.js'
import { userRepository } from '../../infrastructure/repositories/index.js'

export function requireAgentApiEnabled(_req: Request, res: Response, next: NextFunction): void {
  if (env.GEO_AGENT_API_ENABLED !== 'true') {
    res.status(503).json({
      success: false,
      error: { code: 'AGENT_API_DISABLED', message: 'The agent API is disabled' },
    })
    return
  }
  next()
}

export function requireAgentCurateEnabled(_req: Request, res: Response, next: NextFunction): void {
  if (env.GEO_AGENT_CURATE_ENABLED !== 'true') {
    res.status(503).json({
      success: false,
      error: { code: 'AGENT_CURATE_DISABLED', message: 'The agent curate surface is disabled' },
    })
    return
  }
  next()
}

export function requireAgentPromoteEnabled(_req: Request, res: Response, next: NextFunction): void {
  if (env.GEO_AGENT_PROMOTE_ENABLED !== 'true') {
    res.status(503).json({
      success: false,
      error: { code: 'AGENT_PROMOTE_DISABLED', message: 'The agent promote surface is disabled' },
    })
    return
  }
  next()
}

export function requireAgentPromoteOverrideEnabled(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (env.GEO_AGENT_PROMOTE_OVERRIDE_ENABLED !== 'true') {
    res.status(503).json({
      success: false,
      error: {
        code: 'AGENT_PROMOTE_OVERRIDE_DISABLED',
        message: 'The agent override-promote surface is disabled',
      },
    })
    return
  }
  next()
}

export function requireScope(scope: ApiKeyScope) {
  return function (req: Request, res: Response, next: NextFunction): void {
    const scopes = req.apiKey?.scopes
    const authorized =
      Array.isArray(scopes) && scopes.includes(scope) && scopes.every(isAgentScope)
    if (!authorized) {
      res.status(403).json({
        success: false,
        error: { code: 'INSUFFICIENT_SCOPE', message: `Requires scope ${scope}` },
      })
      return
    }
    next()
  }
}

export const agentApiRateLimit = createRateLimiter({
  windowMs: 60_000,
  max: 60,
  key: (req) => (req.apiKey ? `agent-key:${req.apiKey.id}` : `agent-ip:${req.ip ?? 'unknown'}`),
})

export function createRequireKeyOwnerAdmin(
  findUser: (id: string) => Promise<{ isAdmin: boolean } | null>
) {
  return async function requireKeyOwnerAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const owner = req.apiKey ? await findUser(req.apiKey.user_id) : null
      if (!owner?.isAdmin) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'The key owner is not an admin' },
        })
        return
      }
      next()
    } catch (error) {
      next(error)
    }
  }
}

export const requireKeyOwnerAdmin = createRequireKeyOwnerAdmin((id) => userRepository.findById(id))
