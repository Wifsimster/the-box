import { db } from '../database/connection.js'
import type { User } from '@the-box/types'

export interface CreateUserData {
  username: string
  email: string
  passwordHash: string
  displayName: string
  isGuest: boolean
}

export interface UserRow {
  id: string
  username: string
  email: string
  password_hash: string
  display_name: string
  avatar_url: string | null
  is_guest: boolean
  is_admin: boolean
  total_score: number
  current_streak: number
  longest_streak: number
  created_at: Date
}

function mapRowToUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url ?? undefined,
    isGuest: row.is_guest,
    isAdmin: row.is_admin,
    totalScore: row.total_score,
    currentStreak: row.current_streak,
    longestStreak: row.longest_streak,
    createdAt: row.created_at.toISOString(),
  }
}

export const userRepository = {
  async findById(id: string): Promise<User | null> {
    const row = await db('users').where('id', id).first<UserRow>()
    return row ? mapRowToUser(row) : null
  },

  async findByEmail(email: string): Promise<(User & { passwordHash: string }) | null> {
    const row = await db('users').where('email', email).first<UserRow>()
    if (!row) return null
    return { ...mapRowToUser(row), passwordHash: row.password_hash }
  },

  async findByUsernameOrEmail(username: string, email: string): Promise<User | null> {
    const row = await db('users')
      .where('username', username)
      .orWhere('email', email)
      .first<UserRow>()
    return row ? mapRowToUser(row) : null
  },

  async create(data: CreateUserData): Promise<User> {
    const [row] = await db('users')
      .insert({
        username: data.username,
        email: data.email,
        password_hash: data.passwordHash,
        display_name: data.displayName,
        is_guest: data.isGuest,
      })
      .returning<UserRow[]>('*')
    return mapRowToUser(row!)
  },

  async updateScore(userId: string, additionalScore: number): Promise<void> {
    await db('users')
      .where('id', userId)
      .increment('total_score', additionalScore)
  },
}
