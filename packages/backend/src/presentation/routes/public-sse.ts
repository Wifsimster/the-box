import type { Request, Response } from 'express'
import type { Logger } from 'pino'
import { db } from '../../infrastructure/database/connection.js'
import { challengeRepository } from '../../infrastructure/repositories/challenge.repository.js'
import { hashPayload } from '../../domain/services/webhook-dispatch.service.js'
import { isSandboxSlug, sandboxState } from '../../domain/services/sandbox.service.js'
import type { SseEventName } from '@the-box/types'

// Live-channel implementation for /api/public/v1/streamers/:slug/live.
//
// Design choices and trade-offs (per the M2 meeting record):
//   - SSE (not a Socket.io namespace). One-way, sticky-session free, works
//     in any OBS browser source via stock `EventSource`. Cloudflare buffering
//     is countered with a 15s heartbeat.
//   - Database polling at 1.5s. We considered piggy-backing on the internal
//     Socket.io leaderboard channel, but that couples this surface to internal
//     event names. Polling is dumb but observable — score / screenshot
//     transitions in The Box are far slower than the cadence, so the worst
//     visible latency is ~1.5s.
//   - State diffing via hashPayload(). Avoids sending the same JSON shape
//     every tick when the streamer hasn't done anything.
//   - Hard limits: 30 min idle, 2h max, 1 channel per slug per connection.
//     The keyed rate-limit caps concurrent SSE per API key at 3 upstream
//     (in public-api.middleware.ts).

const POLL_INTERVAL_MS = 1_500
const HEARTBEAT_INTERVAL_MS = 15_000
const HARD_MAX_DURATION_MS = 2 * 60 * 60 * 1_000 // 2 hours
const IDLE_TIMEOUT_MS = 30 * 60 * 1_000 // 30 minutes since last real frame

const TOTAL_SCREENSHOTS = 10

interface SseContext {
  slug: string
  log: Logger
}

interface PollSnapshot {
  status: 'not_started' | 'in_progress' | 'completed'
  score: number
  screenshotsDone: number
  rank: number | null
  startedAt: string | null
  completedAt: string | null
}

function writeFrame(res: Response, event: SseEventName, data: unknown, id?: string): void {
  if (id) res.write(`id: ${id}\n`)
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

async function findUserBySlug(slug: string): Promise<{ id: string } | null> {
  const row = await db('user')
    .where('public_slug', slug)
    .andWhere('public_profile_enabled', true)
    .select<{ id: string }>('id')
    .first()
  return row ?? null
}

async function pollSnapshot(userId: string): Promise<PollSnapshot | null> {
  // Today's challenge id; SSE channel is always today-only. Catch-up sessions
  // never appear on this stream — they don't count for the leaderboard and
  // their existence on someone's overlay would be confusing.
  const date = new Date().toISOString().split('T')[0]!
  const challenge = await challengeRepository.findByDate(date)
  if (!challenge) {
    return { status: 'not_started', score: 0, screenshotsDone: 0, rank: null, startedAt: null, completedAt: null }
  }

  const session = await db('game_sessions')
    .where('user_id', userId)
    .andWhere('daily_challenge_id', challenge.id)
    .andWhere('is_catch_up', false)
    .select<{
      id: string
      total_score: number
      is_completed: boolean
      started_at: Date
      completed_at: Date | null
    }>('id', 'total_score', 'is_completed', 'started_at', 'completed_at')
    .first()

  if (!session) {
    return { status: 'not_started', score: 0, screenshotsDone: 0, rank: null, startedAt: null, completedAt: null }
  }

  const tierAgg = await db('tier_sessions')
    .where('game_session_id', session.id)
    .sum<{ sum: string | null }[]>('correct_answers as sum')
    .first()
  const screenshotsDone = Math.min(TOTAL_SCREENSHOTS, Number(tierAgg?.sum ?? 0))

  let rank: number | null = null
  if (session.is_completed) {
    const higher = await db('game_sessions')
      .join('user', 'game_sessions.user_id', 'user.id')
      .where('daily_challenge_id', challenge.id)
      .andWhere('is_completed', true)
      .andWhere('is_catch_up', false)
      .whereRaw('"user"."isAnonymous" = ?', [false])
      .andWhere('total_score', '>', session.total_score)
      .count<{ count: string }[]>('game_sessions.id as count')
      .first()
    rank = Number(higher?.count ?? 0) + 1
  }

  return {
    status: session.is_completed ? 'completed' : 'in_progress',
    score: session.total_score,
    screenshotsDone,
    rank,
    startedAt: session.started_at.toISOString(),
    completedAt: session.completed_at?.toISOString() ?? null,
  }
}

export async function setupSseChannel(
  req: Request,
  res: Response,
  ctx: SseContext,
): Promise<void> {
  // Sandbox streamer — clock-driven simulation, no DB user. The snapshot
  // provider is swapped for the pure `sandboxState` function; everything
  // downstream (diffing, heartbeat, caps) is identical.
  const isSandbox = isSandboxSlug(ctx.slug)

  let getSnapshot: () => Promise<PollSnapshot | null>
  if (isSandbox) {
    getSnapshot = async () => {
      const s = sandboxState()
      return {
        status: s.status,
        score: s.score,
        screenshotsDone: s.screenshotsDone,
        rank: s.rank,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
      }
    }
  } else {
    const target = await findUserBySlug(ctx.slug)
    if (!target) {
      res.status(404).json({ success: false, error: { code: 'STREAMER_NOT_FOUND' } })
      return
    }
    getSnapshot = () => pollSnapshot(target.id)
  }

  // SSE headers. Disabling proxy buffering with X-Accel-Buffering matters for
  // nginx / Cloudflare in the production path; the 15s heartbeat is the
  // belt-and-suspenders second line.
  res.status(200)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  const startedAt = Date.now()
  let lastActivity = Date.now()
  let lastHash: string | null = null
  let closed = false

  writeFrame(res, 'connected', { slug: ctx.slug, pollIntervalMs: POLL_INTERVAL_MS })

  function close(reason: string): void {
    if (closed) return
    closed = true
    clearInterval(pollTimer)
    clearInterval(heartbeatTimer)
    try {
      writeFrame(res, 'heartbeat', { reason, closedAt: new Date().toISOString() })
    } catch {
      // Socket already gone — nothing to do.
    }
    res.end()
  }

  const pollTimer = setInterval(() => {
    if (closed) return
    void (async () => {
      try {
        const snap = await getSnapshot()
        if (!snap) return
        const hash = hashPayload(snap)
        if (hash === lastHash) return
        lastHash = hash
        lastActivity = Date.now()

        // Map snapshot transitions to event names. We deliberately fire on
        // every score / screenshot tick so overlays can animate.
        const eventName =
          snap.status === 'completed'
            ? 'session.completed'
            : snap.status === 'in_progress'
              ? 'screenshot.scored'
              : 'heartbeat'
        writeFrame(res, eventName as SseEventName, snap)

        // For a real streamer the stream closes 30s after completion — the
        // session is over, holding the socket open just burns it. The
        // sandbox loops forever, so it stays open across cycles instead.
        if (snap.status === 'completed' && !isSandbox) {
          setTimeout(() => close('completed'), 30_000)
        }
      } catch (err) {
        ctx.log.warn({ err: String(err), slug: ctx.slug }, 'sse poll error')
      }
    })()
  }, POLL_INTERVAL_MS)

  const heartbeatTimer = setInterval(() => {
    if (closed) return
    // Idle / hard cap.
    const now = Date.now()
    if (now - lastActivity > IDLE_TIMEOUT_MS) {
      close('idle')
      return
    }
    if (now - startedAt > HARD_MAX_DURATION_MS) {
      close('max-duration')
      return
    }
    try {
      writeFrame(res, 'heartbeat', { ts: now })
    } catch {
      close('write-error')
    }
  }, HEARTBEAT_INTERVAL_MS)

  req.on('close', () => close('client-disconnect'))
  req.on('error', () => close('client-error'))
}
