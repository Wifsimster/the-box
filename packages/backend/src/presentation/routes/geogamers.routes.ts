import { Router } from 'express'
import { z } from 'zod'
import { geoGamersService, geoGamersSeasonService, GeoGamersError } from '../../domain/services/index.js'
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware.js'
import { validateBody, validateParams } from '../middleware/validation.middleware.js'
import { createRateLimiter } from '../middleware/rate-limit.middleware.js'
import { routeLogger } from '../../infrastructure/logger/logger.js'
import { achievementRepository } from '../../infrastructure/repositories/index.js'
import { geoGamersPartyStore, resolvePartyRoundImage } from '../../infrastructure/repositories/geogamers-party.store.js'
import { emitAchievementUnlocked } from '../../infrastructure/socket/socket.js'
import type { NewlyEarnedAchievement } from '@the-box/types'

const log = routeLogger.child({ route: 'geogamers' })

const router = Router()

// ---------- Schemas ----------

const pointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
})

const runTokenBody = z.object({ runToken: z.string().uuid() })

const guessGameBody = z.object({
  runToken: z.string().uuid(),
  guess: z.string().min(1).max(200),
  timeSpentMsDelta: z.number().int().nonnegative().max(600_000).optional(),
})

const guessLocationBody = z.object({
  runToken: z.string().uuid(),
  geoMapId: z.number().int().positive(),
  guess: pointSchema,
  timeSpentMsDelta: z.number().int().nonnegative().max(600_000).optional(),
})

const runTokenParam = z.object({ runToken: z.string().uuid() })

// ---------- Identity helper ----------
// Ranked play requires a non-anonymous account. Better-auth anonymous sessions
// (isGuest) and fully logged-out callers are treated as guests: unranked, keyed
// by the run token the client persists.
function identity(req: { userId?: string; isGuest?: boolean }): {
  userId: string | null
  anonymousSessionId: string | null
} {
  const isGuest = req.isGuest === true || !req.userId
  return {
    userId: isGuest ? null : req.userId!,
    anonymousSessionId: isGuest ? (req.userId ?? null) : null,
  }
}

// Map a GeoGamersError code to an HTTP status.
function statusForCode(code: GeoGamersError['code']): number {
  switch (code) {
    case 'RUN_NOT_FOUND':
    case 'NO_CHALLENGE':
      return 404
    case 'INVALID_POINT':
    case 'INVALID_MAP':
      return 400
    case 'WRONG_PHASE':
    case 'ATTEMPTS_EXHAUSTED':
    case 'JOKER_NOT_ALLOWED':
    case 'NO_ALTERNATE':
      return 409
    case 'ALREADY_PLAYED':
    case 'JOKER_ALREADY_USED':
      return 409
    case 'CLAIM_INVALID':
      return 422
    case 'NOT_AUTHENTICATED':
      return 401
    default:
      return 400
  }
}

function handleError(err: unknown, res: import('express').Response, next: import('express').NextFunction) {
  if (err instanceof GeoGamersError) {
    res.status(statusForCode(err.code)).json({
      success: false,
      error: { code: err.code, message: err.message },
    })
    return
  }
  next(err)
}

const writeLimiter = createRateLimiter({ windowMs: 60_000, max: 30 })

// Award recognition-only GeoGamers achievements on a completed RANKED run.
// Idempotent: guarded by hasAchievement + the user_achievements unique, so a
// re-award is a no-op. Best-effort — never blocks the guess response.
async function awardCompletionAchievements(
  userId: string,
  totalPoints: number,
): Promise<NewlyEarnedAchievement[]> {
  const candidates: string[] = ['geogamers_first_run']
  if (totalPoints >= 200) candidates.push('geogamers_perfect_day')

  const earned: NewlyEarnedAchievement[] = []
  for (const key of candidates) {
    try {
      if (await achievementRepository.hasAchievement(userId, key)) continue
      const ach = await achievementRepository.findByKey(key)
      if (!ach) continue
      await achievementRepository.awardAchievement(userId, key)
      earned.push({
        key: ach.key,
        name: ach.name,
        description: ach.description ?? '',
        category: ach.category,
        iconUrl: ach.icon_url ?? null,
        points: ach.points,
        tier: ach.tier,
      })
    } catch (err) {
      // Unique race (already earned) or missing row — non-fatal.
      log.debug({ err, userId, key }, 'geogamers achievement award skipped')
    }
  }
  return earned
}

// ---------- Routes ----------

// Start or resume today's run.
router.post('/run', optionalAuthMiddleware, async (req, res, next) => {
  try {
    const view = await geoGamersService.startOrResumeRun(identity(req))
    res.json({ success: true, data: view })
  } catch (err) {
    handleError(err, res, next)
  }
})

// Fetch a run by its token (page reload).
router.get(
  '/run/:runToken',
  optionalAuthMiddleware,
  validateParams(runTokenParam),
  async (req, res, next) => {
    try {
      const { runToken } = req.params as z.infer<typeof runTokenParam>
      const view = await geoGamersService.getRunByToken(runToken)
      res.json({ success: true, data: view })
    } catch (err) {
      handleError(err, res, next)
    }
  },
)

// Phase 1: name the game.
router.post(
  '/run/guess-game',
  optionalAuthMiddleware,
  writeLimiter,
  validateBody(guessGameBody),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof guessGameBody>
      const result = await geoGamersService.guessGame(body)
      res.json({ success: true, data: result })
    } catch (err) {
      handleError(err, res, next)
    }
  },
)

// Phase 2: pin the location.
router.post(
  '/run/guess-location',
  optionalAuthMiddleware,
  writeLimiter,
  validateBody(guessLocationBody),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof guessLocationBody>
      const result = await geoGamersService.guessLocation(body)
      // Ranked completion (result.rank set for account runs) → evaluate the
      // recognition-only achievements and push a toast. Guests (ghostRank)
      // earn nothing until they claim.
      if (req.userId && !req.isGuest && result.rank != null) {
        const earned = await awardCompletionAchievements(req.userId, result.totalPoints)
        if (earned.length > 0) emitAchievementUnlocked(req.userId, earned)
      }
      res.json({ success: true, data: result })
    } catch (err) {
      handleError(err, res, next)
    }
  },
)

// Joker re-roll — account only.
router.post(
  '/run/joker',
  authMiddleware,
  writeLimiter,
  validateBody(runTokenBody),
  async (req, res, next) => {
    try {
      const { runToken } = req.body as z.infer<typeof runTokenBody>
      const view = await geoGamersService.useJoker({ userId: req.userId!, runToken })
      res.json({ success: true, data: view })
    } catch (err) {
      handleError(err, res, next)
    }
  },
)

// Claim a completed guest run into the signed-in account.
router.post(
  '/run/claim',
  authMiddleware,
  writeLimiter,
  validateBody(runTokenBody),
  async (req, res, next) => {
    try {
      const { runToken } = req.body as z.infer<typeof runTokenBody>
      const view = await geoGamersService.claimRun({ userId: req.userId!, runToken })
      res.json({ success: true, data: view })
    } catch (err) {
      handleError(err, res, next)
    }
  },
)

// ---------- Season standings ----------

// Public season leaderboard (top N + player count).
router.get('/season', optionalAuthMiddleware, async (_req, res, next) => {
  try {
    const month = geoGamersSeasonService.currentMonth()
    const [standings, players] = await Promise.all([
      geoGamersSeasonService.standings(month, 100),
      geoGamersSeasonService.playerCount(month),
    ])
    res.json({ success: true, data: { month, players, standings } })
  } catch (err) {
    handleError(err, res, next)
  }
})

// The signed-in user's own standing + per-day breakdown (dropped-days flagged).
router.get('/season/me', authMiddleware, async (req, res, next) => {
  try {
    const me = await geoGamersSeasonService.myStanding(req.userId!)
    res.json({ success: true, data: me })
  } catch (err) {
    handleError(err, res, next)
  }
})

// Opaque screenshot proxy. The client only ever sees /api/geogamers/image/:token,
// never the underlying asset URL (which can carry a game slug). We fetch the
// source server-side and stream it back. Non-http(s) sources fall back to a
// redirect (documented minor leak) — ingested content is overwhelmingly http(s).
router.get(
  '/image/:runToken',
  optionalAuthMiddleware,
  validateParams(runTokenParam),
  async (req, res, next) => {
    try {
      const { runToken } = req.params as z.infer<typeof runTokenParam>
      const src = await geoGamersService.resolveScreenshotSource(runToken)
      if (!src) {
        res.status(404).json({ success: false, error: { code: 'RUN_NOT_FOUND', message: 'run not found' } })
        return
      }
      if (/^https?:\/\//i.test(src.imageUrl)) {
        const upstream = await fetch(src.imageUrl)
        if (!upstream.ok || !upstream.body) {
          res.status(502).json({ success: false, error: { code: 'UPSTREAM', message: 'image fetch failed' } })
          return
        }
        res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'image/jpeg')
        res.setHeader('Cache-Control', 'private, max-age=300')
        const buf = Buffer.from(await upstream.arrayBuffer())
        res.end(buf)
        return
      }
      // Same-origin relative uploads (e.g. /uploads/..): safe to redirect, the
      // path itself is not identity-revealing.
      res.redirect(src.imageUrl)
    } catch (err) {
      log.error({ err }, 'image proxy error')
      handleError(err, res, next)
    }
  },
)

// Party image proxy. Streams a party round's screenshot server-side so the
// client never sees the asset path (same anti-leak posture as the daily
// proxy). Guests allowed. Only the current or a revealed round is fetchable.
router.get('/party/:code/round/:index/image', optionalAuthMiddleware, async (req, res, next) => {
  try {
    const { code } = req.params as { code: string; index: string }
    const index = Number(req.params['index'])
    const party = await geoGamersPartyStore.get(code)
    if (!party || !Number.isInteger(index)) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'party round not found' } })
      return
    }
    const round = party.rounds[index]
    // Only expose the active round (or an already-revealed one) — never a
    // future round's screenshot.
    const exposable = round && (index === party.currentRound || round.revealed)
    if (!round || !exposable) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'round not available' } })
      return
    }
    const imageUrl = await resolvePartyRoundImage(round.geoScreenshotMetaId)
    if (!imageUrl) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'image missing' } })
      return
    }
    if (/^https?:\/\//i.test(imageUrl)) {
      const upstream = await fetch(imageUrl)
      if (!upstream.ok || !upstream.body) {
        res.status(502).json({ success: false, error: { code: 'UPSTREAM', message: 'image fetch failed' } })
        return
      }
      res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'image/jpeg')
      res.setHeader('Cache-Control', 'private, max-age=300')
      res.end(Buffer.from(await upstream.arrayBuffer()))
      return
    }
    res.redirect(imageUrl)
  } catch (err) {
    handleError(err, res, next)
  }
})

export default router
