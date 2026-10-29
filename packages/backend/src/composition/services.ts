export { billingService } from './billing.js'

import { createFuzzyMatchService } from '../domain/services/fuzzy-match.service.js'
import { createDailyLoginService } from '../domain/services/daily-login.service.js'
import { createRewardsService } from '../domain/services/rewards.service.js'
import { createJobService } from '../domain/services/job.service.js'
import { createLeaderboardService } from '../domain/services/leaderboard.service.js'
import { createAdminService } from '../domain/services/admin.service.js'
import { createAdminAnalyticsService } from '../domain/services/admin-analytics.service.js'
import { createUserService } from '../domain/services/user.service.js'
import { createPlayerStatsService } from '../domain/services/player-stats.service.js'
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
  playerStatsRepository,
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

export const webhookDispatch = createWebhookDispatchService({
  logger: serviceLogger,
  webhookRepository,
  webhookDeliveryRepository,
  enqueueDelivery: async (deliveryId) => {
    await webhookQueue.add('deliver', { kind: 'deliver', deliveryId })
  },
})

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

export const playerStatsService = createPlayerStatsService({
  logger: serviceLogger,
  playerStatsRepository,
  streakLookup: userRepository,
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

async function onAfterSessionCompleted(params: {
  userId: string
  sessionId: string
  challengeId: number
  finalScore: number
  screenshotsFound: number
  reason: 'all_found' | 'forfeit'
  isCatchUp: boolean
}): Promise<void> {
  const profile = await userRepository.getPublicProfileRef(params.userId)
  if (!profile?.publicProfileEnabled || !profile.publicSlug) return

  const challenge = await challengeRepository.findById(params.challengeId)
  if (!challenge) return

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
