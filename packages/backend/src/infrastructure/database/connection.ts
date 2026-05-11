import knex, { Knex } from 'knex'
import path from 'path'
import { fileURLToPath } from 'url'
import { env } from '../../config/env.js'
import { dbLogger } from '../logger/logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Mirror knexfile.ts: TLS is opt-in via DATABASE_SSL=true. Managed
// Postgres providers (RDS, Supabase, Neon) require it; self-hosted
// Postgres on a private Docker network does not, and forcing SSL there
// fails the boot with "server does not support SSL connections".
const useSsl = env.DATABASE_SSL === 'true'

export const db: Knex = knex({
  client: 'pg',
  connection: {
    connectionString: env.DATABASE_URL,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  },
  pool: {
    min: 2,
    max: 10,
    idleTimeoutMillis: 30_000,
    afterCreate: (_conn: unknown, done: (err?: Error) => void) => {
      dbLogger.debug('new connection created in pool')
      done()
    },
  },
  migrations: {
    directory: path.resolve(__dirname, '..', '..', '..', 'migrations'),
    extension: 'ts',
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

export async function runMigrations(): Promise<boolean> {
  try {
    const start = Date.now()
    dbLogger.info('running database migrations')

    const [batchNo, migrations] = await db.migrate.latest()

    if (migrations.length === 0) {
      dbLogger.info({ durationMs: Date.now() - start }, 'database already up to date')
    } else {
      dbLogger.info(
        {
          batchNo,
          migrations,
          durationMs: Date.now() - start,
        },
        'database migrations completed'
      )
    }

    return true
  } catch (error) {
    dbLogger.error({ error: String(error) }, 'database migration failed')
    return false
  }
}
