import knex, { Knex } from 'knex'
import { env } from '../../config/env.js'
import { dbLogger } from '../logger/logger.js'

export const db: Knex = knex({
  client: 'pg',
  connection: env.DATABASE_URL,
  pool: {
    min: 2,
    max: 10,
    afterCreate: (_conn: unknown, done: (err?: Error) => void) => {
      dbLogger.debug('new connection created in pool')
      done()
    },
  },
})

// Log slow queries in development
if (env.NODE_ENV === 'development') {
  db.on('query', (query) => {
    dbLogger.trace({ sql: query.sql, bindings: query.bindings }, 'query start')
  })

  db.on('query-response', (_response, query) => {
    dbLogger.trace({ sql: query.sql }, 'query complete')
  })

  db.on('query-error', (error, query) => {
    dbLogger.error({ sql: query.sql, error: String(error) }, 'query error')
  })
}

export async function testConnection(): Promise<boolean> {
  try {
    const start = Date.now()
    await db.raw('SELECT 1')
    dbLogger.info({ durationMs: Date.now() - start }, 'database connected')
    return true
  } catch (error) {
    dbLogger.error({ error: String(error) }, 'database connection failed')
    return false
  }
}

export async function closeConnection(): Promise<void> {
  dbLogger.info('closing database connection')
  await db.destroy()
}
