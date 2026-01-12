import { db } from '../database/connection.js'
import type { User } from '@the-box/types'
import { repoLogger } from '../logger/logger.js'

const log = repoLogger.child({ repository: 'user' })

/**
 * User repository for better-auth's 'user' table.
 * Note: Password operations are handled by better-auth via the 'account' table.
 */

// Better-auth user table row structure
export interface UserRow {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image: string | null
  role: string | null
  createdAt: Date
  updatedAt: Date
  // Custom fields from additionalFields config
  username: string | null
  displayUsername: string | null
  displayName: string | null
  avatarUrl: string | null
  totalScore: number
  currentStreak: number
  longestStreak: number
  lastPlayedAt: Date | null
}

const GUEST_EMAIL_DOMAIN = 'guest.thebox.local'

function mapRowToUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username ?? row.name,
    email: row.email,
    displayName: row.displayName ?? row.name,
    avatarUrl: row.avatarUrl ?? row.image ?? undefined,
    isGuest: row.email.endsWith(`@${GUEST_EMAIL_DOMAIN}`),
    isAdmin: row.role === 'admin',
    totalScore: row.totalScore ?? 0,
    currentStreak: row.currentStreak ?? 0,
    longestStreak: row.longestStreak ?? 0,
    createdAt: row.createdAt.toISOString(),
  }
}

export const userRepository = {
  async findById(id: string): Promise<User | null> {
    log.debug({ userId: id }, 'findById')
    const row = await db('user').where('id', id).first<UserRow>()
    log.debug({ userId: id, found: !!row }, 'findById result')
    return row ? mapRowToUser(row) : null
  },

  async findByEmail(email: string): Promise<User | null> {
    log.debug({ email }, 'findByEmail')
    const row = await db('user').where('email', email).first<UserRow>()
    log.debug({ email, found: !!row }, 'findByEmail result')
    return row ? mapRowToUser(row) : null
  },

  async findByUsername(username: string): Promise<User | null> {
    log.debug({ username }, 'findByUsername')
    const row = await db('user').where('username', username).first<UserRow>()
    log.debug({ username, found: !!row }, 'findByUsername result')
    return row ? mapRowToUser(row) : null
  },

  async findByUsernameOrEmail(username: string, email: string): Promise<User | null> {
    log.debug({ username, email }, 'findByUsernameOrEmail')
    const row = await db('user')
      .where('username', username)
      .orWhere('email', email)
      .first<UserRow>()
    log.debug({ username, email, found: !!row }, 'findByUsernameOrEmail result')
    return row ? mapRowToUser(row) : null
  },

  async updateScore(userId: string, additionalScore: number): Promise<void> {
    log.info({ userId, additionalScore }, 'updateScore')
    await db('user')
      .where('id', userId)
      .increment('totalScore', additionalScore)
  },

  async updateStreak(userId: string, currentStreak: number, longestStreak: number): Promise<void> {
    log.info({ userId, currentStreak, longestStreak }, 'updateStreak')
    await db('user')
      .where('id', userId)
      .update({
        currentStreak,
        longestStreak,
        lastPlayedAt: new Date(),
      })
  },
}
