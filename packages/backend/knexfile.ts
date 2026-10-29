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

function buildProductionConnection(): Knex.PgConnectionConfig {
  return {
    connectionString: process.env['DATABASE_URL'] ?? '',
    ssl: process.env['DATABASE_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
  }
}

export default config
