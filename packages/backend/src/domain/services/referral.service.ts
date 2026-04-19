import type {
  DomainLogger,
  InventoryRepository,
  UserRepository,
} from '../ports/index.js'

export class ReferralError extends Error {
  constructor(public code: string, message: string) {
    super(message)
    this.name = 'ReferralError'
  }
}

const GUEST_EMAIL_DOMAIN = 'guest.thebox.local'

// Reward table -- kept flat so the viral loop stays predictable. Both sides
// receive hints; the referrer gets a smaller bundle to avoid farming.
const REFEREE_REWARDS = [
  { itemType: 'powerup', itemKey: 'hint_year', quantity: 3 },
  { itemType: 'powerup', itemKey: 'hint_publisher', quantity: 2 },
]

const REFERRER_REWARDS = [
  { itemType: 'powerup', itemKey: 'hint_year', quantity: 2 },
  { itemType: 'powerup', itemKey: 'hint_publisher', quantity: 1 },
]

export interface ReferralClaimResult {
  rewards: typeof REFEREE_REWARDS
  referrerId: string
}

export interface ReferralStats {
  hasClaimed: boolean
  referredBy: string | null
  referralsMade: number
}

export interface ReferralService {
  /**
   * Claim a referral code. Grants power-ups to both the referee (caller)
   * and the referrer. Each user may only claim once and guests cannot
   * claim -- they must register first.
   */
  claim(refereeId: string, referrerCode: string): Promise<ReferralClaimResult>
  getStats(userId: string): Promise<ReferralStats>
}

export interface ReferralServiceDeps {
  logger: DomainLogger
  userRepository: UserRepository
  inventoryRepository: InventoryRepository
}

export function createReferralService(deps: ReferralServiceDeps): ReferralService {
  const { userRepository, inventoryRepository } = deps
  const log = deps.logger.child({ service: 'referral' })

  return {
    async claim(refereeId: string, referrerCode: string): Promise<ReferralClaimResult> {
      const code = referrerCode.trim()
      if (!code) {
        throw new ReferralError('INVALID_CODE', 'Referral code is empty')
      }
      if (code === refereeId) {
        throw new ReferralError('SELF_REFERRAL', 'Cannot refer yourself')
      }

      const referee = await userRepository.getReferralInfo(refereeId)
      if (!referee) {
        throw new ReferralError('USER_NOT_FOUND', 'User not found')
      }
      if (referee.email.endsWith(`@${GUEST_EMAIL_DOMAIN}`)) {
        throw new ReferralError('GUEST_NOT_ALLOWED', 'Guests cannot claim referrals')
      }
      if (referee.referredBy || referee.referralClaimedAt) {
        throw new ReferralError('ALREADY_CLAIMED', 'Referral already claimed')
      }

      const referrer = await userRepository.getReferralIdentity(code)
      if (!referrer) {
        throw new ReferralError('REFERRER_NOT_FOUND', 'Referrer does not exist')
      }
      if (referrer.email.endsWith(`@${GUEST_EMAIL_DOMAIN}`)) {
        throw new ReferralError('REFERRER_INVALID', 'Referrer account is not eligible')
      }

      // Persist the link first -- the reward grant is idempotent per side
      // but the `referred_by` write is the source of truth for the one-shot
      // rule.
      const linked = await userRepository.linkReferral(refereeId, referrer.id, new Date())

      if (!linked) {
        throw new ReferralError('ALREADY_CLAIMED', 'Referral already claimed')
      }

      await inventoryRepository.addMultipleItems(refereeId, REFEREE_REWARDS)
      await inventoryRepository.addMultipleItems(referrer.id, REFERRER_REWARDS)

      log.info({ refereeId, referrerId: referrer.id }, 'referral claimed')

      return { rewards: REFEREE_REWARDS, referrerId: referrer.id }
    },

    async getStats(userId: string): Promise<ReferralStats> {
      const me = await userRepository.getReferralInfo(userId)
      const referralsMade = await userRepository.countReferralsMade(userId)

      return {
        hasClaimed: !!(me?.referredBy || me?.referralClaimedAt),
        referredBy: me?.referredBy ?? null,
        referralsMade,
      }
    },
  }
}
