import type { Request, RequestHandler } from 'express'
import type { CountryCode, CountryLeaderboardResponse } from '@the-box/types'

export interface CountryLeaderboardHandlerDeps {
  getMonthlyCountryLeaderboard(
    year: number,
    month: number,
    viewer?: { countryCode: CountryCode | null },
  ): Promise<CountryLeaderboardResponse>
  /** Declared country of a signed-in player (`null` when not set). */
  findViewerCountry(userId: string): Promise<CountryCode | null>
}

/**
 * GET /api/leaderboard/monthly/:year/:month/countries. Public; when the
 * request carries a session (optional auth runs first), the response adds
 * the viewer's country and its player count for the month. Anonymous and
 * guest sessions get no `viewer` block.
 */
export function createCountryLeaderboardHandler(deps: CountryLeaderboardHandlerDeps): RequestHandler {
  return async (req, res, next) => {
    try {
      const { year, month } = req.params as { year?: string; month?: string }

      const yearNum = Number(year)
      if (!/^\d{4}$/.test(year ?? '') || yearNum < 2020 || yearNum > 2100) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_YEAR', message: 'Invalid year. Must be a 4-digit year between 2020 and 2100' },
        })
        return
      }

      const monthNum = Number(month)
      if (!/^\d{1,2}$/.test(month ?? '') || monthNum < 1 || monthNum > 12) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_MONTH', message: 'Invalid month. Must be between 1 and 12' },
        })
        return
      }

      const viewerId = signedInPlayerId(req)
      const viewer = viewerId ? { countryCode: await deps.findViewerCountry(viewerId) } : undefined
      const data = await deps.getMonthlyCountryLeaderboard(yearNum, monthNum, viewer)

      res.json({ success: true, data })
    } catch (error) {
      if (error instanceof Error && error.message.includes('future months')) {
        res.status(400).json({
          success: false,
          error: { code: 'FUTURE_MONTH', message: error.message },
        })
        return
      }
      next(error)
    }
  }
}

function signedInPlayerId(req: Request): string | undefined {
  if (!req.userId || req.isGuest) return undefined
  return req.userId
}
