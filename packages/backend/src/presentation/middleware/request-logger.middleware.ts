import type { Request, Response, NextFunction } from 'express'
import { routeLogger } from '../../infrastructure/logger/logger.js'

// Query-string parameters that carry short-lived credentials. Logging them
// gives anyone with log access the ability to use the token before its TTL.
const SENSITIVE_QUERY_KEYS = new Set([
  'token',
  'code',
  'session',
  'verify',
  'reset',
  'access_token',
  'refresh_token',
])

// Strip query string entirely for auth-adjacent paths; redact specific keys
// elsewhere. We log path-only by default to avoid surprises from new routes
// that might add tokens to the URL.
function sanitizeUrl(rawUrl: string): string {
  const queryStart = rawUrl.indexOf('?')
  if (queryStart === -1) return rawUrl
  const pathOnly = rawUrl.slice(0, queryStart)
  const queryString = rawUrl.slice(queryStart + 1)
  if (pathOnly.startsWith('/api/auth/')) return pathOnly
  const params = new URLSearchParams(queryString)
  let mutated = false
  for (const key of Array.from(params.keys())) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
      params.set(key, '[redacted]')
      mutated = true
    }
  }
  return mutated ? `${pathOnly}?${params.toString()}` : rawUrl
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now()
  const url = sanitizeUrl(req.url)

  routeLogger.info(
    {
      method: req.method,
      url,
      userId: (req as Request & { userId?: string }).userId,
    },
    'incoming request'
  )

  res.on('finish', () => {
    const duration = Date.now() - start
    const logData = {
      method: req.method,
      url,
      statusCode: res.statusCode,
      durationMs: duration,
      userId: (req as Request & { userId?: string }).userId,
    }

    if (res.statusCode >= 500) {
      routeLogger.error(logData, 'request completed with server error')
    } else if (res.statusCode >= 400) {
      routeLogger.warn(logData, 'request completed with client error')
    } else {
      routeLogger.info(logData, 'request completed')
    }
  })

  next()
}
