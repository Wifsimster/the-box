import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'

const log = repoLogger.child({ repository: 'funnel-event' })

export type FunnelEventName =
  | 'session_started'
  | 'guess_submitted'
  | 'session_completed'
  | 'session_abandoned'

export interface FunnelEventInput {
  eventName: FunnelEventName
  userId?: string | null
  sessionId?: string | null
  payload?: Record<string, unknown>
}

export const funnelEventRepository = {
  /**
   * Fire-and-forget event write. Never throws — analytics must not
   * interfere with the core request.
   */
  async record(event: FunnelEventInput): Promise<void> {
    try {
      await db('funnel_events').insert({
        user_id: event.userId ?? null,
        session_id: event.sessionId ?? null,
        event_name: event.eventName,
        payload: event.payload ?? null,
      })
    } catch (error) {
      log.warn({ error: String(error), event: event.eventName }, 'funnel event write failed')
    }
  },
}

// Port conformance check — keep this in sync with FunnelEventRepository port.
import type { FunnelEventRepository as FunnelEventRepositoryPort } from '../../domain/ports/repositories.js'
export const _funnelEventRepositoryTypeCheck: FunnelEventRepositoryPort = funnelEventRepository
