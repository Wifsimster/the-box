export { authService, AuthError } from './auth.service.js'
export { gameService, GameError } from './game.service.js'
export { leaderboardService } from './leaderboard.service.js'
export { adminService } from './admin.service.js'
export { createFuzzyMatchService, type FuzzyMatchService } from './fuzzy-match.service.js'
export { userService } from './user.service.js'
export { achievementService } from './achievement.service.js'
export { dailyLoginService, DailyLoginError } from './daily-login.service.js'
export { referralService, ReferralError } from './referral.service.js'

// ---------------------------------------------------------------------------
// Composition root for domain services.
//
// This module is the one place where pre-wired singletons are constructed
// from the infrastructure layer. Individual service files must remain pure
// (no infrastructure imports). Callers importing `fuzzyMatchService` from
// here continue to work unchanged.
// ---------------------------------------------------------------------------
import { createFuzzyMatchService } from './fuzzy-match.service.js'
import { serviceLogger } from '../../infrastructure/logger/logger.js'

export const fuzzyMatchService = createFuzzyMatchService({ logger: serviceLogger })
