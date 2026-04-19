export { authService, AuthError } from './auth.service.js'
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
import { serviceLogger } from '../../infrastructure/logger/logger.js'
import { importQueue } from '../../infrastructure/queue/queues.js'
import {
  achievementRepository,
  challengeRepository,
  dailyLoginRepository,
  gameRepository,
  inventoryRepository,
  leaderboardRepository,
  screenshotRepository,
  sessionRepository,
  userRepository,
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
})
