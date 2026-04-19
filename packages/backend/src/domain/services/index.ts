export { authService, AuthError } from './auth.service.js'
export { gameService, GameError } from './game.service.js'
export { leaderboardService } from './leaderboard.service.js'
export { adminService } from './admin.service.js'
export { createFuzzyMatchService, type FuzzyMatchService } from './fuzzy-match.service.js'
export { userService } from './user.service.js'
export { achievementService } from './achievement.service.js'
export { createDailyLoginService, type DailyLoginService } from './daily-login.service.js'
export { DailyLoginError } from './daily-login.service.js'
export { createJobService, type JobService } from './job.service.js'
export { referralService, ReferralError } from './referral.service.js'

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
import { serviceLogger } from '../../infrastructure/logger/logger.js'
import { importQueue } from '../../infrastructure/queue/queues.js'
import {
  dailyLoginRepository,
  inventoryRepository,
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
