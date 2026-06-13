export { AuthError } from './auth.service.js'
export { createGameService, type GameService, GameError } from './game.service.js'
export { createLeaderboardService, type LeaderboardService } from './leaderboard.service.js'
export { createAdminService, type AdminService } from './admin.service.js'
export { createFuzzyMatchService, type FuzzyMatchService } from './fuzzy-match.service.js'
export { createUserService, type UserService } from './user.service.js'
export {
  createAchievementService,
  type AchievementService,
  type AchievementCheckContext,
  type GuessData,
  type GameCompletionData,
  type NewlyEarnedAchievement,
  type AchievementStats,
  type AchievementWithProgressRow,
} from './achievement.service.js'
export { createDailyLoginService, type DailyLoginService } from './daily-login.service.js'
export { DailyLoginError } from './daily-login.service.js'
export {
  createRewardsService,
  type RewardsService,
  type GrantInput,
  type GrantResult,
  RewardsError,
} from './rewards.service.js'
export { createJobService, type JobService } from './job.service.js'
export {
  createReferralService,
  type ReferralService,
  type ReferralClaimResult,
  type ReferralStats,
  ReferralError,
} from './referral.service.js'
export {
  createGeoScoringService,
  type GeoScoringService,
  type GeoScoringResult,
  GEO_SCORE_VERSION,
} from './geo-scoring.service.js'
export {
  createGeoConsensusService,
  type GeoConsensusService,
  type GeoConsensusResult,
  type GeoConsensusDecision,
  type GeoRewardGrant,
  GEO_CONSENSUS_VERSION,
  GEO_CONSENSUS_THRESHOLDS,
} from './geo-consensus.service.js'
export {
  createGeoRewardService,
  type GeoRewardService,
  type GeoRewardSummary,
} from './geo-reward.service.js'
export {
  createGeoContributorService,
  type GeoContributorService,
  type GeoTierEvaluation,
} from './geo-contributor.service.js'
export {
  createGeoGameService,
  type GeoGameService,
  GeoGameError,
  GEO_CONTRIBUTE_HOURLY_LIMIT,
  GEO_CONTRIBUTE_MIN_DAYS_PLAYED,
} from './geo-game.service.js'
export {
  createPushService,
  type PushService,
  type PushServiceDeps,
  type SendToUserResult,
  type PushPayload,
} from './push.service.js'
export {
  createWebhookDispatchService,
  type WebhookDispatchService,
  type WebhookDispatchDeps,
  hashPayload,
} from './webhook-dispatch.service.js'
export {
  wikiSubdomainCandidates,
  scoreMapTitle,
  parseSteamAppIdFromUrl,
  normalizeGameTitle,
  tombstoneRetryAfter,
  FANDOM_MAP_NAMESPACE,
} from './geo-metadata.service.js'

// ---------------------------------------------------------------------------
// Composition root for domain services.
//
// This module is the one place where pre-wired singletons are constructed
// from the infrastructure layer. Individual service files must remain pure
// (no infrastructure imports). Callers importing pre-wired singletons from
// here continue to work unchanged.
// ---------------------------------------------------------------------------
import { createFuzzyMatchService } from './fuzzy-match.service.js'
import { createDailyLoginService } from './daily-login.service.js'
import { createRewardsService } from './rewards.service.js'
import { createJobService } from './job.service.js'
import { createLeaderboardService } from './leaderboard.service.js'
import { createAdminService } from './admin.service.js'
import { createUserService } from './user.service.js'
import { createAchievementService } from './achievement.service.js'
import { createReferralService } from './referral.service.js'
import { createGameService } from './game.service.js'
import { createGeoScoringService } from './geo-scoring.service.js'
import { createGeoConsensusService } from './geo-consensus.service.js'
import { createGeoRewardService } from './geo-reward.service.js'
import { createGeoContributorService } from './geo-contributor.service.js'
import { createGeoGameService } from './geo-game.service.js'
import { createWebhookDispatchService } from './webhook-dispatch.service.js'
import { createPushService } from './push.service.js'
import { serviceLogger } from '../../infrastructure/logger/logger.js'
import { importQueue, geoQueue, webhookQueue, pushQueue } from '../../infrastructure/queue/queues.js'
import { isPushConfigured } from '../../infrastructure/push/push-sender.js'
import { emitRewardGranted } from '../../infrastructure/socket/socket.js'
import {
  achievementRepository,
  challengeRepository,
  dailyLoginRepository,
  funnelEventRepository,
  gameRepository,
  inventoryRepository,
  leaderboardRepository,
  positionSecondChanceRepository,
  positionLetterRevealRepository,
  rewardRepository,
  screenshotRepository,
  sessionRepository,
  userRepository,
  geoContributorRepository,
  geoMapRepository,
  geoPinRepository,
  geoScreenshotRepository,
  webhookRepository,
  webhookDeliveryRepository,
} from '../../infrastructure/repositories/index.js'

// Public-API outbound webhook dispatch. Wired here (composition root) from the
// concrete repositories + BullMQ webhook queue so the service file stays
// infrastructure-free. The game-service completion hooks below dispatch
// through this singleton.
export const webhookDispatch = createWebhookDispatchService({
  logger: serviceLogger,
  webhookRepository,
  webhookDeliveryRepository,
  enqueueDelivery: async (deliveryId) => {
    await webhookQueue.add('deliver', { kind: 'deliver', deliveryId })
  },
})

// Web Push fan-out. The factory stays pure; the BullMQ push queue + the
// VAPID-configured check are bound here. The per-device fan-out (timeout,
// allSettled, retry, 410-deactivation) runs in push.worker.ts — sendToUser
// only enqueues, so the request thread never blocks on FCM round-trips.
export const pushService = createPushService({
  isConfigured: isPushConfigured,
  enqueueSendToUser: async (userId, payload) => {
    const job = await pushQueue.add('send-to-user', {
      kind: 'send-to-user',
      userId,
      payload,
    })
    return { id: job.id }
  },
  log: serviceLogger.child({ service: 'push' }),
})

export const fuzzyMatchService = createFuzzyMatchService({ logger: serviceLogger })

export const dailyLoginService = createDailyLoginService({
  logger: serviceLogger,
  dailyLoginRepository,
  inventoryRepository,
})

export const rewardsService = createRewardsService({
  logger: serviceLogger,
  rewardRepository,
})

export const jobService = createJobService({
  logger: serviceLogger,
  importQueue,
  geoQueue,
})

export const leaderboardService = createLeaderboardService({
  logger: serviceLogger,
  challengeRepository,
  leaderboardRepository,
})

export const adminService = createAdminService({
  logger: serviceLogger,
  gameRepository,
  screenshotRepository,
  challengeRepository,
  sessionRepository,
})

export const userService = createUserService({
  logger: serviceLogger,
  sessionRepository,
  challengeRepository,
})

export const achievementService = createAchievementService({
  logger: serviceLogger,
  achievementRepository,
  userRepository,
})

export const referralService = createReferralService({
  logger: serviceLogger,
  userRepository,
  inventoryRepository,
})

/**
 * Post-guess reward side-effects. Currently unlocks any pending
 * reactivation chests for the user (per the reactivation PRD: the chest
 * is staged when the user is flagged inactive, then becomes claimable on
 * the user's next guess so re-entry is earned through play). Errors are
 * swallowed by the caller — this hook must never break a guess submit.
 */
async function onAfterGuessSubmitted(userId: string): Promise<void> {
  const unlocked = await rewardsService.unlockPendingByUserAndSource(
    userId,
    'reactivation'
  )
  for (const grant of unlocked) {
    emitRewardGranted(userId, {
      rewardId: grant.id,
      source: grant.source,
      sourceRef: grant.sourceRef,
      items: grant.payload.items,
      grantedAt: grant.grantedAt,
      unlockedAt: grant.unlockedAt,
    })
  }
}

/**
 * Public-API webhook fan-out on session completion. Resolves the user's
 * public slug, computes the rank for ranked sessions, and dispatches to
 * `session.completed` subscribers. Catch-up sessions still trigger the
 * webhook (people DO ask their chat "I finally beat yesterday's") but
 * `countsForLeaderboard: false` flags them so receivers can ignore.
 */
async function onAfterSessionCompleted(params: {
  userId: string
  sessionId: string
  challengeId: number
  finalScore: number
  screenshotsFound: number
  reason: 'all_found' | 'forfeit'
  isCatchUp: boolean
}): Promise<void> {
  // Resolve slug + public flag in one cheap query. If the user hasn't
  // opted in, there's nothing to dispatch — bail before fetching subs.
  const { db } = await import('../../infrastructure/database/connection.js')
  const userRow = await db('user')
    .where('id', params.userId)
    .select<{ public_slug: string | null; public_profile_enabled: boolean }>(
      'public_slug',
      'public_profile_enabled'
    )
    .first()
  if (!userRow?.public_profile_enabled || !userRow.public_slug) return

  const challenge = await challengeRepository.findById(params.challengeId)
  if (!challenge) return

  // Final rank — same pure-DB query the public profile endpoint uses.
  // Catch-up sessions are explicitly excluded from the leaderboard so
  // `rank` is null in that path.
  let rank: number | null = null
  if (!params.isCatchUp) {
    const higher = await db('game_sessions')
      .join('user', 'game_sessions.user_id', 'user.id')
      .where('daily_challenge_id', params.challengeId)
      .andWhere('is_completed', true)
      .andWhere('is_catch_up', false)
      .whereRaw('"user"."isAnonymous" = ?', [false])
      .andWhere('total_score', '>', params.finalScore)
      .count<{ count: string }[]>('game_sessions.id as count')
      .first()
    rank = Number(higher?.count ?? 0) + 1
  }

  await webhookDispatch.sessionCompleted({
    userId: params.userId,
    slug: userRow.public_slug,
    sessionId: params.sessionId,
    challengeDate: challenge.challenge_date,
    score: params.finalScore,
    screenshotsFound: params.screenshotsFound,
    totalScreenshots: 10,
    rank,
    countsForLeaderboard: !params.isCatchUp,
  })

  // rank.changed — rank-only companion event, completing-streamer-only.
  // Skipped for catch-up sessions (no leaderboard rank to report).
  if (!params.isCatchUp && rank !== null) {
    await webhookDispatch.rankChanged({
      userId: params.userId,
      slug: userRow.public_slug,
      sessionId: params.sessionId,
      challengeDate: challenge.challenge_date,
      rank,
    })
  }
}

/**
 * Public-API webhook fan-out when a streamer starts their daily. Resolves
 * the slug + opt-in flag, then dispatches `session.started`. Only opted-in
 * streamers with a slug trigger anything.
 */
async function onAfterSessionStarted(params: {
  userId: string
  sessionId: string
  challengeId: number
  challengeDate: string
  isCatchUp: boolean
}): Promise<void> {
  const { db } = await import('../../infrastructure/database/connection.js')
  const userRow = await db('user')
    .where('id', params.userId)
    .select<{ public_slug: string | null; public_profile_enabled: boolean }>(
      'public_slug',
      'public_profile_enabled'
    )
    .first()
  if (!userRow?.public_profile_enabled || !userRow.public_slug) return

  await webhookDispatch.sessionStarted({
    userId: params.userId,
    slug: userRow.public_slug,
    sessionId: params.sessionId,
    challengeDate: params.challengeDate,
    countsForLeaderboard: !params.isCatchUp,
  })
}

export const gameService = createGameService({
  logger: serviceLogger,
  fuzzyMatchService,
  achievementService,
  challengeRepository,
  sessionRepository,
  screenshotRepository,
  userRepository,
  inventoryRepository,
  gameRepository,
  funnelEventRepository,
  positionSecondChanceRepository,
  positionLetterRevealRepository,
  onAfterGuessSubmitted,
  onAfterSessionCompleted,
  onAfterSessionStarted,
})

export const geoScoringService = createGeoScoringService({ logger: serviceLogger })

export const geoConsensusService = createGeoConsensusService({ logger: serviceLogger })

export const geoContributorService = createGeoContributorService({
  logger: serviceLogger,
  geoContributorRepository,
})

export const geoRewardService = createGeoRewardService({
  logger: serviceLogger,
  inventoryRepository,
  geoPinRepository,
  geoContributorRepository,
  geoScreenshotRepository,
})

export const geoGameService = createGeoGameService({
  logger: serviceLogger,
  geoScoringService,
  geoScreenshotRepository,
  geoPinRepository,
  geoMapRepository,
  sessionRepository,
})
