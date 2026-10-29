import type { Request, Response, NextFunction } from 'express'
import { apiKeyRepository, hashApiKey, type ApiKeyRow } from '../../infrastructure/repositories/api-key.repository.js'
import { logger } from '../../infrastructure/logger/logger.js'

const log = logger.child({ middleware: 'public-api' })

declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKeyRow
    }
  }
}

function extractKey(req: Request, opts: { allowQueryParam: boolean }): string | null {
  const auth = req.headers.authorization
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length).trim() || null
  }
  if (opts.allowQueryParam) {
    const q = req.query.key
    if (typeof q === 'string' && q.length > 0) return q
  }
  return null
}

function isWellFormed(key: string): boolean {
  return /^tb_pk_(live|test)_[A-Za-z0-9_-]{43}$/.test(key)
}

export function requireApiKey(opts: { allowQueryParam?: boolean } = {}) {
  const allowQueryParam = opts.allowQueryParam ?? false

  return async function (req: Request, res: Response, next: NextFunction): Promise<void> {
    const plaintext = extractKey(req, { allowQueryParam })
    if (!plaintext || !isWellFormed(plaintext)) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing or malformed API key' },
      })
      return
    }
    try {
      const row = await apiKeyRepository.findByHash(hashApiKey(plaintext))
      if (!row) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
        })
        return
      }
      req.apiKey = row
      req.userId = row.user_id
      apiKeyRepository
        .recordUsage(row.id, req.ip ?? null)
        .catch((err) => log.warn({ err: String(err), keyId: row.id }, 'recordUsage failed'))
      next()
    } catch (err) {
      log.error({ err: String(err), url: req.url }, 'requireApiKey error')
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR' },
      })
    }
  }
}

export function optionalApiKey() {
  return async function (req: Request, _res: Response, next: NextFunction): Promise<void> {
    const plaintext = extractKey(req, { allowQueryParam: false })
    if (!plaintext || !isWellFormed(plaintext)) {
      next()
      return
    }
    try {
      const row = await apiKeyRepository.findByHash(hashApiKey(plaintext))
      if (row) {
        req.apiKey = row
        req.userId = row.user_id
        apiKeyRepository
          .recordUsage(row.id, req.ip ?? null)
          .catch((err) => log.warn({ err: String(err), keyId: row.id }, 'recordUsage failed'))
      }
    } catch (err) {
      log.warn({ err: String(err) }, 'optionalApiKey lookup failed')
    }
    next()
  }
}

interface Bucket {
  count: number
  resetAt: number
}

const ANON_WINDOW_MS = 60_000
const ANON_MAX = 60
const KEYED_WINDOW_MS = 60_000
const KEYED_MAX = 600

const anonBuckets = new Map<string, Bucket>()
const keyedBuckets = new Map<number, Bucket>()

const sweep = setInterval(() => {
  const now = Date.now()
  for (const [k, b] of anonBuckets) if (b.resetAt <= now) anonBuckets.delete(k)
  for (const [k, b] of keyedBuckets) if (b.resetAt <= now) keyedBuckets.delete(k)
}, 60_000)
sweep.unref?.()

function take(bucket: Bucket | undefined, now: number, max: number, windowMs: number): {
  ok: boolean
  reset: number
  remaining: number
} {
  if (!bucket || bucket.resetAt <= now) {
    return { ok: true, reset: now + windowMs, remaining: max - 1 }
  }
  if (bucket.count >= max) {
    return { ok: false, reset: bucket.resetAt, remaining: 0 }
  }
  return { ok: true, reset: bucket.resetAt, remaining: max - bucket.count - 1 }
}

export function publicApiRateLimit(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now()
  const keyed = req.apiKey
  let result: { ok: boolean; reset: number; remaining: number }
  let max: number

  if (keyed) {
    max = KEYED_MAX
    const bucket = keyedBuckets.get(keyed.id)
    result = take(bucket, now, max, KEYED_WINDOW_MS)
    if (result.ok) {
      keyedBuckets.set(keyed.id, {
        count: (bucket && bucket.resetAt > now ? bucket.count : 0) + 1,
        resetAt: result.reset,
      })
    }
  } else {
    const clientKey = req.ip || req.socket.remoteAddress || 'unknown'
    max = ANON_MAX
    const bucket = anonBuckets.get(clientKey)
    result = take(bucket, now, max, ANON_WINDOW_MS)
    if (result.ok) {
      anonBuckets.set(clientKey, {
        count: (bucket && bucket.resetAt > now ? bucket.count : 0) + 1,
        resetAt: result.reset,
      })
    }
  }

  res.setHeader('RateLimit-Limit', String(max))
  res.setHeader('RateLimit-Remaining', String(Math.max(0, result.remaining)))
  res.setHeader('RateLimit-Reset', String(Math.max(0, Math.ceil((result.reset - now) / 1000))))

  if (!result.ok) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((result.reset - now) / 1000))))
    res.status(429).json({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many requests' },
    })
    return
  }
  next()
}

export function publicApiCors(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, If-None-Match'
  )
  res.setHeader('Access-Control-Expose-Headers', 'RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, ETag')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  next()
}
