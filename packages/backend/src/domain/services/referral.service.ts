import { db } from '../../infrastructure/database/connection.js'
import { inventoryRepository } from '../../infrastructure/repositories/index.js'
import { serviceLogger } from '../../infrastructure/logger/logger.js'

const log = serviceLogger.child({ service: 'referral' })

export class ReferralError extends Error {
  constructor(public code: string, message: string) {
    super(message)
    this.name = 'ReferralError'
  }
}

const GUEST_EMAIL_DOMAIN = 'guest.thebox.local'

// Reward table — kept flat so the viral loop stays predictable. Both sides
// receive hints; the referrer gets a smaller bundle to avoid farming.
const REFEREE_REWARDS = [
  { itemType: 'powerup', itemKey: 'hint_year', quantity: 3 },
  { itemType: 'powerup', itemKey: 'hint_publisher', quantity: 2 },
]

const REFERRER_REWARDS = [
  { itemType: 'powerup', itemKey: 'hint_year', quantity: 2 },
  { itemType: 'powerup', itemKey: 'hint_publisher', quantity: 1 },
]

interface ReferralUserRow {
  id: string
  email: string
  referred_by: string | null
  referral_claimed_at: Date | null
}

export interface ReferralClaimResult {
  rewards: typeof REFEREE_REWARDS
  referrerId: string
}

export interface ReferralStats {
  hasClaimed: boolean
  referredBy: string | null
  referralsMade: number
}

export const referralService = {
  /**
   * Claim a referral code. Grants power-ups to both the referee (caller)
   * and the referrer. Each user may only claim once and guests cannot
   * claim — they must register first.
   */
  async claim(refereeId: string, referrerCode: string): Promise<ReferralClaimResult> {
    const code = referrerCode.trim()
    if (!code) {
      throw new ReferralError('INVALID_CODE', 'Referral code is empty')
    }
    if (code === refereeId) {
      throw new ReferralError('SELF_REFERRAL', 'Cannot refer yourself')
    }

    const referee = await db('user')
      .where('id', refereeId)
      .first<ReferralUserRow>('id', 'email', 'referred_by', 'referral_claimed_at')
    if (!referee) {
      throw new ReferralError('USER_NOT_FOUND', 'User not found')
    }
    if (referee.email.endsWith(`@${GUEST_EMAIL_DOMAIN}`)) {
      throw new ReferralError('GUEST_NOT_ALLOWED', 'Guests cannot claim referrals')
    }
    if (referee.referred_by || referee.referral_claimed_at) {
      throw new ReferralError('ALREADY_CLAIMED', 'Referral already claimed')
    }

    const referrer = await db('user')
      .where('id', code)
      .first<{ id: string; email: string }>('id', 'email')
    if (!referrer) {
      throw new ReferralError('REFERRER_NOT_FOUND', 'Referrer does not exist')
    }
    if (referrer.email.endsWith(`@${GUEST_EMAIL_DOMAIN}`)) {
      throw new ReferralError('REFERRER_INVALID', 'Referrer account is not eligible')
    }

    // Persist the link first — the reward grant is idempotent per side but
    // the `referred_by` write is the source of truth for the one-shot rule.
    const updated = await db('user')
      .where('id', refereeId)
      .whereNull('referred_by')
      .update({
        referred_by: referrer.id,
        referral_claimed_at: new Date(),
      })

    if (updated === 0) {
      throw new ReferralError('ALREADY_CLAIMED', 'Referral already claimed')
    }

    await inventoryRepository.addMultipleItems(refereeId, REFEREE_REWARDS)
    await inventoryRepository.addMultipleItems(referrer.id, REFERRER_REWARDS)

    log.info({ refereeId, referrerId: referrer.id }, 'referral claimed')

    return { rewards: REFEREE_REWARDS, referrerId: referrer.id }
  },

  async getStats(userId: string): Promise<ReferralStats> {
    const me = await db('user')
      .where('id', userId)
      .first<{ referred_by: string | null; referral_claimed_at: Date | null }>(
        'referred_by',
        'referral_claimed_at'
      )

    const countRow = await db('user')
      .where('referred_by', userId)
      .count<{ count: string }>({ count: '*' })
      .first()

    return {
      hasClaimed: !!(me?.referred_by || me?.referral_claimed_at),
      referredBy: me?.referred_by ?? null,
      referralsMade: Number(countRow?.count ?? 0),
    }
  },
}
