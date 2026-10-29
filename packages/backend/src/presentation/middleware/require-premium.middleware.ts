import type { NextFunction, Request, Response } from 'express'
import {
  billingService,
} from '../../composition/services.js'

export async function requirePremium(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.userId) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED' },
    })
    return
  }
  const entitlement = await billingService.getEntitlement(req.userId)
  if (!entitlement.isPremium) {
    res.status(402).json({
      success: false,
      error: {
        code: 'PREMIUM_REQUIRED',
        message: 'This feature requires The Box Premium',
      },
    })
    return
  }
  next()
}
