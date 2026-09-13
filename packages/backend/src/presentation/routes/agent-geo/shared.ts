/**
 * Shared building blocks for the agent geo routers.
 *
 * `agent-geo.routes.ts` was a single 1238-line module holding 15 routes
 * across five concerns (catalog, captures, maps, ingest, pins). These are the
 * pieces more than one of the split routers needs.
 */
import { z } from 'zod'
import { routeLogger } from '../../../infrastructure/logger/logger.js'

export const log = routeLogger.child({ router: 'agent-geo' })

export const limitQuery = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
})

export const gameIdParams = z.object({
  gameId: z.coerce.number().int().positive(),
})
