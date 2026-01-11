import type { Request, Response, NextFunction } from 'express'
import { routeLogger } from '../../infrastructure/logger/logger.js'

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now()

  // Log request
  routeLogger.info(
    {
      method: req.method,
      url: req.url,
      userId: (req as Request & { userId?: string }).userId,
    },
    'incoming request'
  )

  // Log response on finish
  res.on('finish', () => {
    const duration = Date.now() - start
    const logData = {
      method: req.method,
      url: req.url,
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
