import { z } from 'zod'
import { routeLogger } from '../../../infrastructure/logger/logger.js'

export const log = routeLogger.child({ router: 'agent-geo' })

export const limitQuery = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
})

export const gameIdParams = z.object({
  gameId: z.coerce.number().int().positive(),
})
