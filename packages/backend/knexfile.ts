import type { Knex } from 'knex'
import 'dotenv/config'

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'pg',
    connection: process.env['DATABASE_URL'] || 'postgresql://thebox:thebox_secret@localhost:5432/thebox',
    migrations: {
      directory: './migrations',
      extension: 'ts',
    },
    seeds: {
      directory: './seeds',
    },
  },

  production: {
    client: 'pg',
    connection: buildProductionConnection(),
    pool: {
      min: 2,
      max: 10,
      idleTimeoutMillis: 30_000,
    },
    migrations: {
      directory: './migrations',
      extension: 'ts',
    },
    seeds: {
      directory: './seeds',
      extension: 'ts',
    },
  },
}

// Managed Postgres providers (RDS, Supabase, Neon, DigitalOcean Managed)
// require TLS on connection. We enable it whenever DATABASE_URL doesn't
// point at localhost so production deploys can't accidentally talk plain
// TCP. `rejectUnauthorized: false` is intentional: many managed providers
// hand out certificates signed by their own CA which Node's default trust
// store doesn't carry. Treat this as "encrypt in transit, don't verify
// peer" — strictly better than today's no-SSL state.
function buildProductionConnection(): Knex.PgConnectionConfig {
  const url = process.env['DATABASE_URL'] ?? ''
  const isLocal = url.includes('localhost') || url.includes('127.0.0.1')
  return {
    connectionString: url,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  }
}

export default config
