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
  type GeoDailyChallengeView,
  GeoGameError,
  GEO_CONTRIBUTE_HOURLY_LIMIT,
  GEO_CONTRIBUTE_MIN_DAYS_PLAYED,
} from './geo-game.service.js'
export {
  wikiSubdomainCandidates,
  defaultWikiPageTitles,
  parseSteamAppIdFromUrl,
  normalizeGameTitle,
  tombstoneRetryAfter,
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
import { serviceLogger } from '../../infrastructure/logger/logger.js'
import { importQueue } from '../../infrastructure/queue/queues.js'
import {
  achievementRepository,
  challengeRepository,
  dailyLoginRepository,
  funnelEventRepository,
  gameRepository,
  inventoryRepository,
  leaderboardRepository,
  screenshotRepository,
  sessionRepository,
  userRepository,
  geoChallengeRepository,
  geoContributorRepository,
  geoMapRepository,
  geoPinRepository,
  geoScreenshotRepository,
} from '../../infrastructure/repositories/index.js'

export const fuzzyMatchService = createFuzzyMatchService({ logger: serviceLogger })

export const dailyLoginService = createDailyLoginService({
  logger: serviceLogger,
  dailyLoginRepository,
  inventoryRepository,
  userRepository,
})

export const jobService = createJobService({
  logger: serviceLogger,
  importQueue,
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
  geoChallengeRepository,
  geoScreenshotRepository,
  geoPinRepository,
  geoMapRepository,
  sessionRepository,
})
