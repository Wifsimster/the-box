import pino from 'pino'
import { env } from '../../config/env.js'

const isDev = env.NODE_ENV === 'development'

export const logger = pino({
  level: env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: {
    env: env.NODE_ENV,
  },
})

// Child loggers for different modules
export const dbLogger = logger.child({ module: 'database' })
export const repoLogger = logger.child({ module: 'repository' })
export const serviceLogger = logger.child({ module: 'service' })
export const routeLogger = logger.child({ module: 'route' })
export const authLogger = logger.child({ module: 'auth' })
export const socketLogger = logger.child({ module: 'socket' })
export const queueLogger = logger.child({ module: 'queue' })

// Helper for timing operations
export function withTiming<T>(
  operation: string,
  log: pino.Logger,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now()
  return fn()
    .then((result) => {
      log.debug({ operation, durationMs: Date.now() - start }, 'operation completed')
      return result
    })
    .catch((error) => {
      log.error({ operation, durationMs: Date.now() - start, error: String(error) }, 'operation failed')
      throw error
    })
}

// Helper for database queries with parameters
export function logQuery(
  log: pino.Logger,
  table: string,
  operation: string,
  params?: Record<string, unknown>
) {
  log.debug({ table, operation, params }, 'db query')
}

export function logQueryResult(
  log: pino.Logger,
  table: string,
  operation: string,
  found: boolean,
  count?: number
) {
  log.debug({ table, operation, found, count }, 'db query result')
}
