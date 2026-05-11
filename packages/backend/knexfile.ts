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

// TLS is opt-in via DATABASE_SSL=true. Managed Postgres providers (RDS,
// Supabase, Neon, DigitalOcean Managed) require it and should set the flag;
// self-hosted Postgres reached over a private Docker network or VPN does
// not, and forcing SSL there causes "server does not support SSL
// connections" at boot. `rejectUnauthorized: false` is intentional: many
// managed providers hand out certificates signed by their own CA which
// Node's default trust store doesn't carry.
function buildProductionConnection(): Knex.PgConnectionConfig {
  return {
    connectionString: process.env['DATABASE_URL'] ?? '',
    ssl: process.env['DATABASE_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
  }
}

export default config
