import type {
  RewardGrant,
  RewardGrantItem,
  RewardSource,
} from '@the-box/types'
import type { DomainLogger } from '../ports/logger.js'
import type { RewardRepository } from '../ports/repositories.js'

const SOURCE_REF_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,118}[a-z0-9]$/

const ALLOWED_SOURCES: ReadonlySet<RewardSource> = new Set<RewardSource>([
  'reactivation',
  'milestone',
  'streak_freeze',
  'leaderboard_payout',
  'cosmetic_unlock',
  'powerup_drop',
  'daily_login',
])

/**
 * Sources whose rewards are immediately usable. Reactivation is the
 * exception: the chest is staged when the user is flagged inactive but
 * the inbox card is unlockable only after the user submits a guess on
 * return — that earned-through-play guarantee is what the reactivation
 * PRD requires (autonomy-supportive, no streak-shaming).
 */
const AUTO_UNLOCK_SOURCES: ReadonlySet<RewardSource> = new Set<RewardSource>([
  'milestone',
  'streak_freeze',
  'leaderboard_payout',
  'cosmetic_unlock',
  'powerup_drop',
  'daily_login',
])

export class RewardsError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'RewardsError'
  }
}

export interface GrantInput {
  userId: string
  source: RewardSource
  sourceRef: string
  items: RewardGrantItem[]
  /**
   * Override the default unlock policy. Useful for tests; production
   * callers should rely on the source-driven default.
   */
  autoUnlock?: boolean
}

export interface GrantResult {
  /**
   * `true` when the row was newly inserted, `false` on idempotent retry.
   * Callers should only emit the `reward:granted` socket event when
   * `wasNew === true`.
   */
  wasNew: boolean
  grant: RewardGrant
}

export interface RewardsService {
  grant(input: GrantInput): Promise<GrantResult>
  /**
   * Mark a previously staged grant as unlockable. Used by the reactivation
   * flow once the returning user submits a first guess. No-op if already
   * unlocked. Returns the updated grant or null if the grant does not exist.
   */
  unlock(rewardId: string, userId: string): Promise<RewardGrant | null>
  /**
   * Mark an unlocked grant as claimed by the user. No-op if already
   * claimed. Returns the updated grant; returns the unchanged grant when
   * the row is not yet unlocked (caller renders "pending" state).
   */
  claim(rewardId: string, userId: string): Promise<RewardGrant | null>
  /**
   * Unlock every pending (`unlockedAt === null`) grant for a given
   * source. Returns the rows that flipped — typically 0 or 1 — so
   * callers can emit a `reward:granted` socket event per unlock and
   * the inbox card flips from "À débloquer" to "Réclamer" live. Used
   * by `reactivation` (chest unlocks on the user's next guess).
   */
  unlockPendingByUserAndSource(
    userId: string,
    source: RewardSource
  ): Promise<RewardGrant[]>
  /**
   * List unclaimed grants for a user, newest first. Used by the
   * `RewardsInbox` drawer.
   */
  listUnclaimed(userId: string, limit?: number): Promise<RewardGrant[]>
}

export interface RewardsServiceDeps {
  logger: DomainLogger
  rewardRepository: RewardRepository
}

export function createRewardsService(deps: RewardsServiceDeps): RewardsService {
  const log = deps.logger.child({ service: 'rewards' })
  const { rewardRepository } = deps

  function validateSourceRef(sourceRef: string): void {
    if (!SOURCE_REF_PATTERN.test(sourceRef)) {
      throw new RewardsError(
        'INVALID_SOURCE_REF',
        `sourceRef must be lowercase ASCII, colon/hyphen/underscore separated, 2-120 chars: got "${sourceRef}"`
      )
    }
  }

  function validateItems(items: RewardGrantItem[]): void {
    if (items.length === 0) {
      throw new RewardsError(
        'EMPTY_PAYLOAD',
        'a reward grant must include at least one item'
      )
    }
    for (const item of items) {
      if (!item.itemType || !item.itemKey) {
        throw new RewardsError('INVALID_ITEM', 'item_type and item_key are required')
      }
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new RewardsError(
          'INVALID_QUANTITY',
          `item quantity must be a positive integer: got ${item.quantity}`
        )
      }
    }
  }

  return {
    async grant(input: GrantInput): Promise<GrantResult> {
      const { userId, source, sourceRef, items } = input

      if (!ALLOWED_SOURCES.has(source)) {
        throw new RewardsError(
          'UNKNOWN_SOURCE',
          `unknown reward source: ${source as string}`
        )
      }
      validateSourceRef(sourceRef)
      validateItems(items)

      const autoUnlock = input.autoUnlock ?? AUTO_UNLOCK_SOURCES.has(source)

      const result = await rewardRepository.grantAtomic({
        userId,
        source,
        sourceRef,
        payload: { items },
        autoUnlock,
      })

      log.info(
        {
          userId,
          source,
          sourceRef,
          wasNew: result.wasNew,
          grantId: result.grant.id,
          itemCount: items.length,
        },
        result.wasNew ? 'reward granted' : 'reward grant idempotent (existing row)'
      )

      return result
    },

    async unlock(rewardId, userId) {
      return rewardRepository.markUnlocked(rewardId, userId)
    },

    async unlockPendingByUserAndSource(userId, source) {
      if (!ALLOWED_SOURCES.has(source)) {
        throw new RewardsError(
          'UNKNOWN_SOURCE',
          `unknown reward source: ${source as string}`
        )
      }
      return rewardRepository.unlockPendingByUserAndSource(userId, source)
    },

    async claim(rewardId, userId) {
      return rewardRepository.markClaimed(rewardId, userId)
    },

    async listUnclaimed(userId, limit) {
      return rewardRepository.listForUser(userId, { onlyUnclaimed: true, limit })
    },
  }
}
