import { Request, Response, NextFunction } from 'express'
import { auth, type Session, type User } from '../../infrastructure/auth/auth.js'

declare global {
  namespace Express {
    interface Request {
      userId?: string
      user?: User
      session?: Session
      isGuest?: boolean
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: req.headers as Record<string, string>,
    })

    if (!session) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      })
      return
    }

    req.userId = session.user.id
    req.user = session.user
    req.session = session
    req.isGuest = session.user.isAnonymous ?? false
    next()
  } catch (error) {
    console.error('Auth middleware error:', error)
    res.status(401).json({
      success: false,
      error: { code: 'AUTH_ERROR', message: 'Authentication failed' },
    })
  }
}

export async function optionalAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: req.headers as Record<string, string>,
    })

    if (session) {
      req.userId = session.user.id
      req.user = session.user
      req.session = session
      req.isGuest = session.user.isAnonymous ?? false
    }
  } catch {
    // Silently ignore auth errors for optional middleware
  }

  next()
}

export async function adminMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: req.headers as Record<string, string>,
    })

    if (!session) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      })
      return
    }

    // Check if user has admin role
    if (session.user.role !== 'admin') {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Admin access required' },
      })
      return
    }

    req.userId = session.user.id
    req.user = session.user
    req.session = session
    next()
  } catch (error) {
    console.error('Admin middleware error:', error)
    res.status(401).json({
      success: false,
      error: { code: 'AUTH_ERROR', message: 'Authentication failed' },
    })
  }
}
