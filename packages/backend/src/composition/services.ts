/**
 * Composition root for the backend's domain services.
 *
 * The ONE place where pure domain factories are bound to concrete
 * infrastructure — repositories, the Pino logger, BullMQ queues, the
 * Socket.io emitter, Web Push. Every service file under `domain/services/`
 * stays infrastructure-free; this module supplies what they declared they
 * need through their ports.
 *
 * It lives outside `domain/` on purpose. It used to be the bottom half of
 * `domain/services/index.ts`, which meant importing any domain type dragged
 * in Redis connections and made the layer's "no outward dependencies" rule
 * false in the one file that asserted it.
 *
 * Presentation code and workers should import their singletons from here.
 */

// Billing is wired in its own module (no BullMQ queues) so the unit-tested
// billing-webhook route can import the singleton without opening a Redis
// connection. Re-exported here so callers have one place to look.
export { billingService } from './billing.js'

import { createFuzzyMatchService } from '../domain/services/fuzzy-match.service.js'
import { createDailyLoginService } from '../domain/services/daily-login.service.js'
import { createRewardsService } from '../domain/services/rewards.service.js'
import { createJobService } from '../domain/services/job.service.js'
import { createLeaderboardService } from '../domain/services/leaderboard.service.js'
import { createAdminService } from '../domain/services/admin.service.js'
import { createAdminAnalyticsService } from '../domain/services/admin-analytics.service.js'
import { createUserService } from '../domain/services/user.service.js'
import { createAchievementService } from '../domain/services/achievement.service.js'
import { createReferralService } from '../domain/services/referral.service.js'
import { createGameService } from '../domain/services/game.service.js'
import { createGeoScoringService } from '../domain/services/geo-scoring.service.js'
import { createGeoConsensusService } from '../domain/services/geo-consensus.service.js'
import { createGeoRewardService } from '../domain/services/geo-reward.service.js'
import { createGeoContributorService } from '../domain/services/geo-contributor.service.js'
import { createGeoGameService } from '../domain/services/geo-game.service.js'
import { createGeoGamersScoringService } from '../domain/services/geogamers-scoring.service.js'
import { createGeoGamersService } from '../domain/services/geogamers.service.js'
import { createGeoGamersSeasonService } from '../domain/services/geogamers-season.service.js'
import { createWebhookDispatchService } from '../domain/services/webhook-dispatch.service.js'
import { createPushService } from '../domain/services/push.service.js'
import { serviceLogger } from '../infrastructure/logger/logger.js'
import { importQueue, geoQueue, webhookQueue, pushQueue } from '../infrastructure/queue/queues.js'
import { isPushConfigured } from '../infrastructure/push/push-sender.js'
import { emitRewardGranted } from '../infrastructure/socket/socket.js'
import {
  achievementRepository,
  adminAnalyticsRepository,
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
  geoGamersChallengeRepository,
  geoGamersRunRepository,
  geoGamersJokerRepository,
  geoGamersSeasonRepository,
  webhookRepository,
  webhookDeliveryRepository,
} from '../infrastructure/repositories/index.js'

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

export const adminAnalyticsService = createAdminAnalyticsService({
  logger: serviceLogger,
  analyticsRepository: adminAnalyticsRepository,
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
  // Resolve slug + public flag. If the user hasn't opted in, there's nothing
  // to dispatch — bail before fetching subs.
  const profile = await userRepository.getPublicProfileRef(params.userId)
  if (!profile?.publicProfileEnabled || !profile.publicSlug) return

  const challenge = await challengeRepository.findById(params.challengeId)
  if (!challenge) return

  // Final rank — shared with the public profile endpoint via the repository.
  // Catch-up sessions are explicitly excluded from the leaderboard so
  // `rank` is null in that path.
  const rank: number | null = params.isCatchUp
    ? null
    : await leaderboardRepository.rankForScore(params.challengeId, params.finalScore)

  await webhookDispatch.sessionCompleted({
    userId: params.userId,
    slug: profile.publicSlug,
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
      slug: profile.publicSlug,
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
  const profile = await userRepository.getPublicProfileRef(params.userId)
  if (!profile?.publicProfileEnabled || !profile.publicSlug) return

  await webhookDispatch.sessionStarted({
    userId: params.userId,
    slug: profile.publicSlug,
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

// GeoGamers mode. Scoring is pure; the orchestration service is wired here
// from the concrete repos, the fuzzy matcher, and a repo-backed alternate
// picker for joker re-rolls. `screenshotUrlFor` builds the opaque proxy URL so
// the domain never emits a raw asset path (anti-leak).
export const geoGamersScoringService = createGeoGamersScoringService({ logger: serviceLogger })

export const geoGamersService = createGeoGamersService({
  logger: serviceLogger,
  challengeRepo: geoGamersChallengeRepository,
  runRepo: geoGamersRunRepository,
  jokerRepo: geoGamersJokerRepository,
  alternatePicker: {
    pickAlternate: ({ excludeMetaId }) =>
      geoGamersChallengeRepository.pickAlternateMeta(excludeMetaId),
  },
  screenshotRepo: geoScreenshotRepository,
  mapRepo: geoMapRepository,
  gameRepo: gameRepository,
  fuzzyMatch: fuzzyMatchService,
  scoring: geoGamersScoringService,
  screenshotUrlFor: (runToken) => `/api/geogamers/image/${runToken}`,
})

export const geoGamersSeasonService = createGeoGamersSeasonService({
  logger: serviceLogger,
  ranking: geoGamersSeasonRepository,
})
