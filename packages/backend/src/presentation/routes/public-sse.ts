import type { Request, Response } from 'express'
import type { Logger } from 'pino'
import { publicProfileRepository } from '../../infrastructure/repositories/public-profile.repository.js'
import { leaderboardRepository } from '../../infrastructure/repositories/leaderboard.repository.js'
import { challengeRepository } from '../../infrastructure/repositories/challenge.repository.js'
import { hashPayload } from '../../domain/services/webhook-dispatch.service.js'
import { isSandboxSlug, sandboxState } from '../../domain/services/sandbox.service.js'
import type { SseEventName } from '@the-box/types'

const POLL_INTERVAL_MS = 1_500
const HEARTBEAT_INTERVAL_MS = 15_000
const HARD_MAX_DURATION_MS = 2 * 60 * 60 * 1_000
const IDLE_TIMEOUT_MS = 30 * 60 * 1_000

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
  return publicProfileRepository.findBySlug(slug)
}

async function pollSnapshot(userId: string): Promise<PollSnapshot | null> {
  const date = new Date().toISOString().split('T')[0]!
  const challenge = await challengeRepository.findByDate(date)
  if (!challenge) {
    return { status: 'not_started', score: 0, screenshotsDone: 0, rank: null, startedAt: null, completedAt: null }
  }

  const session = await publicProfileRepository.findDailySession(userId, challenge.id)

  if (!session) {
    return { status: 'not_started', score: 0, screenshotsDone: 0, rank: null, startedAt: null, completedAt: null }
  }

  const correctAnswers = await publicProfileRepository.countCorrectAnswers(session.id)
  const screenshotsDone = Math.min(TOTAL_SCREENSHOTS, Number(correctAnswers))

  const rank: number | null = session.is_completed
    ? await leaderboardRepository.rankForScore(challenge.id, session.total_score)
    : null

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

        const eventName =
          snap.status === 'completed'
            ? 'session.completed'
            : snap.status === 'in_progress'
              ? 'screenshot.scored'
              : 'heartbeat'
        writeFrame(res, eventName as SseEventName, snap)

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
