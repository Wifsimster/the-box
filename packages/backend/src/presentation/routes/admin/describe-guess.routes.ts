import { Router } from 'express'
import type { DescribeGuessAdminPage } from '@the-box/types'
import { describeGuessRepository } from '../../../infrastructure/repositories/index.js'

const router = Router()

const MAX_LIMIT = 100

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
