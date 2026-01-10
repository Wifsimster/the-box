import knex, { Knex } from 'knex'
import { env } from '../../config/env.js'

export const db: Knex = knex({
  client: 'pg',
  connection: env.DATABASE_URL,
  pool: {
    min: 2,
    max: 10,
  },
})

export async function testConnection(): Promise<boolean> {
  try {
    await db.raw('SELECT 1')
    console.log('Database connected successfully')
    return true
  } catch (error) {
    console.error('Database connection failed:', error)
    return false
  }
}

export async function closeConnection(): Promise<void> {
  await db.destroy()
}
