/**
 * Domain service barrel — factories and types ONLY.
 *
 * This module must never import from `infrastructure/`. The dependency rule
 * is presentation -> domain -> (ports), with the domain depending outward on
 * nothing; a composition root that lives inside the layer it is supposed to
 * keep pure inverts that rule and makes the whole domain un-importable
 * without booting Redis, Postgres and a Socket.io server.
 *
 * The pre-wired singletons built from these factories live one level up, in
 * `src/composition/services.ts`. Import factories and types from here;
 * import ready-to-use instances from there.
 */
export { AuthError } from './auth.service.js'
export { createGameService, type GameService, GameError } from './game.service.js'
export { createLeaderboardService, type LeaderboardService } from './leaderboard.service.js'
export { createAdminService, type AdminService } from './admin.service.js'
export {
  createAdminAnalyticsService,
  buildUserAnalyticsReport,
  buildGrowthStatsReport,
  percent,
  type AdminAnalyticsService,
  type AdminAnalyticsServiceDeps,
  type UserAnalyticsReport,
  type GrowthStatsReport,
} from './admin-analytics.service.js'
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
  createGeoGamersScoringService,
  type GeoGamersScoringService,
  GEOGAMERS_SCORE_VERSION,
  GEOGAMERS_ATTEMPTS_MAX,
} from './geogamers-scoring.service.js'
export {
  createGeoGamersService,
  type GeoGamersService,
  GeoGamersError,
  GEOGAMERS_MIN_RUN_SECONDS,
  GEOGAMERS_PHASE_TIME_LIMIT_SECONDS,
} from './geogamers.service.js'
export {
  createGeoGamersSeasonService,
  type GeoGamersSeasonService,
  type SeasonRanking,
} from './geogamers-season.service.js'
export {
  createBillingService,
  toSubscriptionStatus,
  type BillingService,
  type BillingServiceDeps,
  type BillingStripeGateway,
  type BillingCatalogResolver,
} from './billing.service.js'
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