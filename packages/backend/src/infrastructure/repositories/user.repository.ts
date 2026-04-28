import { db } from '../database/connection.js'
import type { User } from '@the-box/types'
import { repoLogger } from '../logger/logger.js'
import type {
  ReferralIdentity,
  ReferralUserInfo,
} from '../../domain/ports/repositories.js'

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
  // Custom fields from additionalFields config (snake_case as defined in migration)
  username: string | null
  display_username: string | null
  display_name: string | null
  avatar_url: string | null
  total_score: number
  current_streak: number
  longest_streak: number
  last_played_at: Date | null
  lastLoginAt: Date | null
  email_marketing_consent: boolean
  email_consent_updated_at: Date | null
}

const GUEST_EMAIL_DOMAIN = 'guest.thebox.local'

function mapRowToUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username ?? row.name,
    email: row.email,
    displayName: row.display_name ?? row.name,
    avatarUrl: row.avatar_url ?? row.image ?? undefined,
    isGuest: row.email.endsWith(`@${GUEST_EMAIL_DOMAIN}`),
    isAdmin: row.role === 'admin',
    totalScore: row.total_score ?? 0,
    currentStreak: row.current_streak ?? 0,
    longestStreak: row.longest_streak ?? 0,
    lastPlayedAt: row.last_played_at?.toISOString(),
    lastLoginAt: row.lastLoginAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    emailMarketingConsent: row.email_marketing_consent ?? false,
    emailConsentUpdatedAt: row.email_consent_updated_at?.toISOString(),
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
      .increment('total_score', additionalScore)
  },

  async updateStreak(userId: string, currentStreak: number, longestStreak: number): Promise<void> {
    log.info({ userId, currentStreak, longestStreak }, 'updateStreak')
    await db('user')
      .where('id', userId)
      .update({
        current_streak: currentStreak,
        longest_streak: longestStreak,
        last_played_at: new Date(),
      })
  },

  async getStreakGraceUsedAt(userId: string): Promise<Date | null> {
    const row = await db('user')
      .where('id', userId)
      .select<{ streak_grace_used_at: Date | null }>('streak_grace_used_at')
      .first()
    return row?.streak_grace_used_at ?? null
  },

  async markStreakGraceUsed(userId: string): Promise<void> {
    log.info({ userId }, 'markStreakGraceUsed')
    await db('user')
      .where('id', userId)
      .update({ streak_grace_used_at: new Date() })
  },

  async updateAvatarUrl(userId: string, avatarUrl: string | null): Promise<User | null> {
    log.info({ userId, avatarUrl }, 'updateAvatarUrl')
    await db('user')
      .where('id', userId)
      .update({
        avatar_url: avatarUrl,
        updatedAt: new Date(),
      })
    return this.findById(userId)
  },

  async getStripeCustomerId(userId: string): Promise<string | null> {
    const row = await db('user')
      .where('id', userId)
      .first<{ stripe_customer_id: string | null }>('stripe_customer_id')
    return row?.stripe_customer_id ?? null
  },

  async setStripeCustomerId(userId: string, customerId: string): Promise<void> {
    log.info({ userId, customerId }, 'setStripeCustomerId')
    await db('user')
      .where('id', userId)
      .update({
        stripe_customer_id: customerId,
        updatedAt: new Date(),
      })
  },

  async findByStripeCustomerId(customerId: string): Promise<{ id: string; email: string } | null> {
    const row = await db('user')
      .where('stripe_customer_id', customerId)
      .first<{ id: string; email: string }>('id', 'email')
    return row ?? null
  },

  async getSupporterLifetimeAt(userId: string): Promise<Date | null> {
    const row = await db('user')
      .where('id', userId)
      .first<{ supporter_lifetime_at: Date | null }>('supporter_lifetime_at')
    return row?.supporter_lifetime_at ?? null
  },

  async grantSupporterLifetime(userId: string, grantedAt: Date = new Date()): Promise<void> {
    log.info({ userId, grantedAt }, 'grantSupporterLifetime')
    // Idempotent: keep the earliest grant timestamp so a duplicate webhook
    // doesn't overwrite the original supporter date.
    await db('user')
      .where('id', userId)
      .whereNull('supporter_lifetime_at')
      .update({
        supporter_lifetime_at: grantedAt,
        updatedAt: new Date(),
      })
  },

  async updateEmailMarketingConsent(userId: string, consent: boolean): Promise<User | null> {
    log.info({ userId, consent }, 'updateEmailMarketingConsent')
    await db('user')
      .where('id', userId)
      .update({
        email_marketing_consent: consent,
        email_consent_updated_at: new Date(),
        updatedAt: new Date(),
      })
    return this.findById(userId)
  },

  async getReferralInfo(userId: string): Promise<ReferralUserInfo | null> {
    log.debug({ userId }, 'getReferralInfo')
    const row = await db('user')
      .where('id', userId)
      .first<{
        id: string
        email: string
        referred_by: string | null
        referral_claimed_at: Date | null
      }>('id', 'email', 'referred_by', 'referral_claimed_at')
    if (!row) return null
    return {
      id: row.id,
      email: row.email,
      referredBy: row.referred_by,
      referralClaimedAt: row.referral_claimed_at,
    }
  },

  async getReferralIdentity(userId: string): Promise<ReferralIdentity | null> {
    log.debug({ userId }, 'getReferralIdentity')
    const row = await db('user')
      .where('id', userId)
      .first<{ id: string; email: string }>('id', 'email')
    if (!row) return null
    return { id: row.id, email: row.email }
  },

  async linkReferral(
    refereeId: string,
    referrerId: string,
    claimedAt: Date
  ): Promise<boolean> {
    log.info({ refereeId, referrerId }, 'linkReferral')
    const updated = await db('user')
      .where('id', refereeId)
      .whereNull('referred_by')
      .update({
        referred_by: referrerId,
        referral_claimed_at: claimedAt,
      })
    return updated > 0
  },

  async countReferralsMade(referrerId: string): Promise<number> {
    log.debug({ referrerId }, 'countReferralsMade')
    const row = await db('user')
      .where('referred_by', referrerId)
      .count<{ count: string }>({ count: '*' })
      .first()
    return Number(row?.count ?? 0)
  },

  async getCurrentStreak(userId: string): Promise<number> {
    log.debug({ userId }, 'getCurrentStreak')
    const row = await db('user')
      .where('id', userId)
      .first<{ current_streak: number | null }>('current_streak')
    return Number(row?.current_streak ?? 0)
  },
}

// Type-level check: the repository must satisfy the domain port.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { UserRepository as UserRepositoryPort } from '../../domain/ports/repositories.js'
export const _userRepositoryTypeCheck: UserRepositoryPort = userRepository
