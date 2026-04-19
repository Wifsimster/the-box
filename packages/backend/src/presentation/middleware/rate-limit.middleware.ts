import type { Request, Response, NextFunction } from 'express'
import { logger } from '../../infrastructure/logger/logger.js'

interface Bucket {
  count: number
  resetAt: number
}

interface RateLimitOptions {
  windowMs: number
  max: number
  key?: (req: Request) => string
}

/**
 * Minimal in-memory fixed-window rate limiter keyed by client IP (or a
 * caller-supplied key). Good enough for protecting public endpoints on a
 * single backend instance — a multi-instance deployment would need a
 * Redis-backed replacement, but we don't run that topology today.
 */
export function createRateLimiter({ windowMs, max, key }: RateLimitOptions) {
  const buckets = new Map<string, Bucket>()

  // Periodic sweep so expired buckets can't leak memory. Works even
  // when no new requests arrive for a while on the same key.
  const sweep = setInterval(() => {
    const now = Date.now()
    for (const [k, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(k)
    }
  }, Math.max(windowMs, 30_000))
  sweep.unref?.()

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const clientKey = key?.(req) ?? (req.ip || req.socket.remoteAddress || 'unknown')
    const now = Date.now()
    const bucket = buckets.get(clientKey)

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(clientKey, { count: 1, resetAt: now + windowMs })
      next()
      return
    }

    if (bucket.count >= max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
      res.setHeader('Retry-After', String(retryAfter))
      logger.warn({ clientKey, path: req.path, retryAfter }, 'rate limit hit')
      res.status(429).json({
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many requests' },
      })
      return
    }

    bucket.count++
    next()
  }
}
