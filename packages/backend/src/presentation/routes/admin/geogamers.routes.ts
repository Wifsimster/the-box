import { Router } from 'express'
import { createGeoGamersChallenge } from '../../../infrastructure/queue/workers/geogamers-challenge-logic.js'
import { getGeoGamersHealthSnapshot } from '../../../infrastructure/geogamers-health.js'
import { recordAdminGeoAudit } from '../../middleware/admin-audit.js'

const router = Router()

router.get('/geogamers/health', async (_req, res, next) => {
  try {
    // Shared with the agent read surface (/api/agent/v1/geo/health) so the
    // eligibility query lives in one place.
    const data = await getGeoGamersHealthSnapshot()
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/geogamers/create-challenge — create TODAY's GeoGamers
// challenge on demand (idempotent), instead of waiting for the 00:05 UTC cron.
// The enablement path: set GEOGAMERS_ENABLED=true, redeploy, then hit this so
// there's a playable challenge immediately. Returns the same gate feedback the
// worker logs (created / ALREADY_EXISTS / INSUFFICIENT_CONTENT).
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
