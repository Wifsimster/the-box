import { Router } from 'express'
import type { DescribeGuessAdminPage } from '@the-box/types'
import { describeGuessRepository } from '../../../infrastructure/repositories/index.js'

const router = Router()

const MAX_LIMIT = 100

/**
 * GET /api/admin/describe-guesses?page=1&limit=50
 *
 * Read-only list of recent "describe the game" rows (shadow mode) for
 * labelling: description, target, model choice, probability, verdict.
 * Admin-only through the parent router's adminMiddleware. Stays available
 * when the feature is off so rows collected earlier remain reviewable.
 */
router.get('/describe-guesses', async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(String(req.query['page'] ?? '1'), 10) || 1)
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number.parseInt(String(req.query['limit'] ?? '50'), 10) || 50)
    )
    const { entries, total } = await describeGuessRepository.listRecent({
      limit,
      offset: (page - 1) * limit,
    })
    const data: DescribeGuessAdminPage = { entries, total, page, limit }
    res.json({ success: true, data })
  } catch (error) {
    next(error)
  }
})

export default router
