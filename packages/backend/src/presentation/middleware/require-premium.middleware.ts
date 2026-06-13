import type { NextFunction, Request, Response } from 'express'
import { billingService } from '../../domain/services/index.js'

// Gate a route on the caller having an active premium entitlement. Always
// chain after authMiddleware — it relies on req.userId being populated.
//
// Failure mode: 402 Payment Required with a code the frontend can detect
// to surface the upsell modal. Don't use 403 (forbidden) since the user
// can resolve this by paying, not by getting permission.
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
