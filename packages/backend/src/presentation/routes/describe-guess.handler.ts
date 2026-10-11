import type { RequestHandler } from 'express'
import { z } from 'zod'
import type { DescribeGuessResponse } from '@the-box/types'
import {
  DESCRIBE_LOCALES,
  DESCRIBE_MAX_LENGTH,
  DescribeGuessError,
  type DescribeGuessService,
} from '../../domain/services/describe-guess.service.js'

/**
 * Feature gate for POST /api/game/describe. Mounted before auth so that,
 * with the feature off, the route is indistinguishable from a missing one.
 */
export function describeGuessGate(isEnabled: () => boolean): RequestHandler {
  return (_req, res, next) => {
    if (!isEnabled()) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } })
      return
    }
    next()
  }
}

// Length rules (15–200 after trimming) live in the domain service; the body
// cap here only stops oversized payloads before any work.
export const describeBody = z.object({
  tierSessionId: z.string().min(1).max(100),
  screenshotId: z.number().int(),
  position: z.number().int().nonnegative(),
  description: z.string().max(DESCRIBE_MAX_LENGTH * 2),
  locale: z.enum(DESCRIBE_LOCALES).catch('fr'),
})

/**
 * POST /api/game/describe — "describe the game" in shadow mode.
 *
 * Synchronous: the judge runs inside the request, bounded at 5 s. The
 * response is the same whatever the verdict (or its absence), so it never
 * reveals the model's guess, the candidates or the answer.
 */
export function createDescribeGuessHandler(
  getService: () => DescribeGuessService | null
): RequestHandler {
  return async (req, res, next) => {
    try {
      const service = getService()
      if (!service) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } })
        return
      }

      const parsed = describeBody.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid describe request' },
        })
        return
      }

      await service.submit({
        userId: req.userId!,
        isGuest: req.isGuest ?? false,
        ...parsed.data,
      })

      const data: DescribeGuessResponse = { recorded: true }
      res.json({ success: true, data })
    } catch (error) {
      if (error instanceof DescribeGuessError) {
        res.status(error.statusCode).json({
          success: false,
          error: { code: error.code, message: error.message },
        })
        return
      }
      next(error)
    }
  }
}
