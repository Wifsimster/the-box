import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

declare global {
  namespace Express {
    interface Request {
      userId?: string
      isGuest?: boolean
    }
  }
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    })
  }

  const token = authHeader.slice(7)

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as {
      userId: string
      isGuest: boolean
    }

    req.userId = decoded.userId
    req.isGuest = decoded.isGuest
    next()
  } catch {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' },
    })
  }
}

export function optionalAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return next()
  }

  const token = authHeader.slice(7)

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as {
      userId: string
      isGuest: boolean
    }

    req.userId = decoded.userId
    req.isGuest = decoded.isGuest
  } catch {
    // Ignore invalid tokens for optional auth
  }

  next()
}

export function adminMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // First check auth
  authMiddleware(req, res, () => {
    // Then check admin status (would need to fetch from DB)
    // For now, just pass through - implement full check later
    next()
  })
}
