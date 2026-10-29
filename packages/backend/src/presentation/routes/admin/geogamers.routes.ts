import { Router } from 'express'
import { createGeoGamersChallenge } from '../../../infrastructure/queue/workers/geogamers-challenge-logic.js'
import { getGeoGamersHealthSnapshot } from '../../../infrastructure/geogamers-health.js'
import { recordAdminGeoAudit } from '../../middleware/admin-audit.js'

const router = Router()

router.get('/geogamers/health', async (_req, res, next) => {
  try {
    const data = await getGeoGamersHealthSnapshot()
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

router.post('/geogamers/create-challenge', async (req, res, next) => {
  try {
    const result = await createGeoGamersChallenge()
    await recordAdminGeoAudit(req, {
      action: 'geogamers.create_challenge',
      target: { kind: 'geogamers_challenge', id: String(result.challengeId ?? result.challengeDate) },
      after: { created: result.created, skipped: result.skipped ?? null },
    })
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

export default router
