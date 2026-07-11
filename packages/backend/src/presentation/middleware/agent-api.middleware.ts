import type { Request, Response, NextFunction } from 'express'
import type { ApiKeyScope } from '@the-box/types'
import { isGeoAgentScope } from '@the-box/types'
import { env } from '../../config/env.js'
import { createRateLimiter } from './rate-limit.middleware.js'

// Middleware for the agent content-sourcing surface (/api/agent/v1/geo,
// issue #331). Composes on top of the shared `requireApiKey` from
// public-api.middleware: that attaches `req.apiKey`; the guards here add the
// kill switch, scope enforcement, and a per-key rate limit.

/**
 * Kill switch. Every agent route sits behind this so the entire surface can be
 * disabled instantly by flipping GEO_AGENT_API_ENABLED and redeploying —
 * complementing per-key revocation. Returns a clean, machine-readable 503
 * rather than a bare 404 so an integrator polling the surface can tell "turned
 * off" from "wrong URL".
 */
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

/**
 * Second kill switch for the write-heavy content-creation & curation routes
 * (issue #331, phase 5: enroll/import-captures/map-select/map-reject).
 * Independent of GEO_AGENT_API_ENABLED so an operator can run read/ingest/
 * propose in production while curation stays dark, and can flip it off alone
 * without touching the rest of the surface. Checked after the main kill
 * switch and key auth, before the scope check, so a disabled-curate 503
 * never leaks which keys hold the curate scope.
 */
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

/**
 * Require a specific scope on the authenticated key. Also rejects any key that
 * carries a non-geo-agent scope reaching this surface — a streamer key can
 * never call the agent API even if it somehow held a geo-agent scope, and the
 * mint-time mutual-exclusion guarantee is re-checked here as defense in depth.
 * Must run after `requireApiKey` (needs `req.apiKey`).
 */
export function requireScope(scope: ApiKeyScope) {
  return function (req: Request, res: Response, next: NextFunction): void {
    const scopes = req.apiKey?.scopes
    const authorized =
      Array.isArray(scopes) && scopes.includes(scope) && scopes.every(isGeoAgentScope)
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

// Per-key fixed-window rate limit. 60/min is generous for an exploratory agent
// loop (health poll + candidate reads); the write budgets that actually bound
// ingestion and pin proposals land with phases 3–4 as Redis counters. Keyed by
// key id so two agents don't share a bucket; falls back to IP pre-auth.
export const agentApiRateLimit = createRateLimiter({
  windowMs: 60_000,
  max: 60,
  key: (req) => (req.apiKey ? `agent-key:${req.apiKey.id}` : `agent-ip:${req.ip ?? 'unknown'}`),
})
