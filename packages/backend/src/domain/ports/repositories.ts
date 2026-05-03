/**
 * Domain-facing repository ports.
 *
 * Each interface captures the subset of methods domain services call on
 * the corresponding infrastructure repository. Stage 1 keeps these wide
 * (using the exact shapes produced by the repositories today) so the
 * existing repositories are trivially assignable to the ports. Later
 * stages can tighten them toward domain-only types.
 */
import type {
  DailyReward,
  Game,
  GameSearchResult,
  ImportState,
  ImportStatus,
  LeaderboardEntry,
  MonthlyLeaderboardEntry,
  PercentileResponse,
  Screenshot,
  User,
  UserInventory,
  UserInventoryItem,
  GeoChallenge,
  GeoChallengeWithStatus,
  GeoContributorStats,
  GeoContributorTier,
  GeoContributorTierThreshold,
  GeoGuessResult,
  GeoLeaderboardEntry,
  GeoMap,
  GeoPinStatus,
  GeoPinSubmission,
  GeoPoint,
  GeoScreenshotCandidate,
  GeoScreenshotMeta,
} from '@the-box/types'

// ---------- User ----------

export interface ReferralUserInfo {
  id: string
  email: string
  referredBy: string | null
  referralClaimedAt: Date | null
}

export interface ReferralIdentity {
  id: string
  email: string
}

export interface UserRepository {
  findById(id: string): Promise<User | null>
  findByEmail(email: string): Promise<User | null>
  findByUsername(username: string): Promise<User | null>
  findByUsernameOrEmail(username: string, email: string): Promise<User | null>
  updateScore(userId: string, additionalScore: number): Promise<void>
  updateStreak(userId: string, currentStreak: number, longestStreak: number): Promise<void>
  updateAvatarUrl(userId: string, avatarUrl: string | null): Promise<User | null>
  updateEmailMarketingConsent(userId: string, consent: boolean): Promise<User | null>
  // Referral-related user queries (operate on the user table only)
  getReferralInfo(userId: string): Promise<ReferralUserInfo | null>
  getReferralIdentity(userId: string): Promise<ReferralIdentity | null>
  /**
   * Atomically link a referee to a referrer only if the referee has no
   * existing `referred_by` value. Returns true if a row was updated.
   */
  linkReferral(refereeId: string, referrerId: string, claimedAt: Date): Promise<boolean>
  countReferralsMade(referrerId: string): Promise<number>
  getCurrentStreak(userId: string): Promise<number>
  getStreakGraceUsedAt(userId: string): Promise<Date | null>
  markStreakGraceUsed(userId: string): Promise<void>
}

// ---------- Game ----------

export interface GameRepository {
  findById(id: number): Promise<Game | null>
  findBySlug(slug: string): Promise<Game | null>
  findByRawgId(rawgId: number): Promise<Game | null>
  findAll(): Promise<Game[]>
  findPaginated(options: {
    page?: number
    limit?: number
    search?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
  }): Promise<{ games: Game[]; total: number; page: number; limit: number }>
  search(query: string, limit?: number): Promise<GameSearchResult[]>
  create(data: Partial<Game>): Promise<Game>
  update(id: number, data: Partial<Game>): Promise<Game | null>
  delete(id: number): Promise<void>
  updateFromRawg(
    id: number,
    data: {
      name?: string
      releaseYear?: number
      developer?: string
      publisher?: string
      genres?: string[]
      platforms?: string[]
      coverImageUrl?: string
      metacritic?: number
      rawgId?: number
      lastSyncedAt?: Date
    }
  ): Promise<Game | null>
  /**
   * Returns just the `genres` array for a game, or `[]` if the game
   * does not exist or has no genres set. Used by the domain when the
   * full `Game` record is not needed (e.g. achievement evaluation).
   */
  getGenresById(gameId: number): Promise<string[]>
  /**
   * Returns the `genres` array for the first matching game joined via
   * the given screenshot ids. Used when the caller only knows a set of
   * screenshots and needs a representative game's genres (e.g. the
   * forfeit achievement check). Returns `[]` if no game is found.
   */
  getGenresByScreenshotIds(screenshotIds: number[]): Promise<string[]>
}

// ---------- Session ----------

export interface GameSessionRecord {
  id: string
  user_id: string
  daily_challenge_id: number
  current_tier: number
  current_position: number
  total_score: number
  is_completed: boolean
  is_catch_up: boolean
  started_at: Date
  completed_at: Date | null
}

export interface TierSessionRecord {
  id: string
  game_session_id: string
  tier_id: number
  score: number
  correct_answers: number
  wrong_guesses: number
  is_completed: boolean
  started_at: Date
  completed_at: Date | null
}

export interface TierSessionWithContextRecord extends TierSessionRecord {
  user_id: string
  game_total_score: number
  game_session_started_at: Date
  game_session_id: string
  daily_challenge_id: number
  is_catch_up: boolean
  tier_number: number
  time_limit_seconds: number
}

export interface GameHistoryRecord {
  session_id: string
  challenge_date: string
  total_score: number
  is_completed: boolean
  completed_at: Date | null
}

export interface GuessWithGameRecord {
  id: number
  tierSessionId: string
  screenshotId: number
  position: number
  tryNumber: number
  guessedGameId: number | null
  guessedText: string | null
  isCorrect: boolean
  timeTakenMs: number
  sessionElapsedMs: number
  scoreEarned: number
  powerUpUsed: string | null
  correctGameId: number
  correctGameName: string
  correctGameSlug: string
  correctGameCoverImageUrl: string | null
  correctGameReleaseYear: number | null
  correctGameMetacritic: number | null
  correctGamePublisher: string | null
  correctGameDeveloper: string | null
  createdAt: Date
}

export interface SessionRepository {
  findGameSession(userId: string, challengeId: number): Promise<GameSessionRecord | null>
  findGameSessionById(sessionId: string, userId: string): Promise<GameSessionRecord | null>
  findCompletedGameSessionById(sessionId: string): Promise<GameSessionRecord | null>
  findLatestTierSession(gameSessionId: string): Promise<TierSessionRecord | null>
  createGameSession(data: {
    userId: string
    dailyChallengeId: number
    isCatchUp?: boolean
  }): Promise<GameSessionRecord>
  createTierSession(data: { gameSessionId: string; tierId: number }): Promise<TierSessionRecord>
  findTierSessionWithContext(tierSessionId: string): Promise<TierSessionWithContextRecord | null>
  updateTierSession(
    tierSessionId: string,
    data: { score: number; correctAnswers: number; wrongGuesses?: number }
  ): Promise<void>
  updateGameSession(
    gameSessionId: string,
    data: { totalScore: number; currentPosition: number; isCompleted: boolean }
  ): Promise<void>
  saveGuess(data: {
    tierSessionId: string
    screenshotId: number
    position: number
    guessedGameId: number | null
    guessedText: string
    isCorrect: boolean
    sessionElapsedMs: number
    scoreEarned: number
  }): Promise<void>
  getCorrectAnswersCount(tierSessionId: string): Promise<number>
  getCorrectPositions(gameSessionId: string): Promise<number[]>
  deleteGameSession(userId: string, challengeId: number): Promise<boolean>
  findUserGameHistory(userId: string): Promise<GameHistoryRecord[]>
  findAllInProgressSessions(): Promise<GameSessionRecord[]>
  findGuessesByGameSession(gameSessionId: string): Promise<GuessWithGameRecord[]>
  /**
   * Returns the minimal per-guess fields needed by achievement evaluation
   * for every guess across every tier session of a given game session,
   * ordered by position ascending. Keeps the achievement pipeline out
   * of Knex by exposing a domain-shaped projection.
   */
  findAchievementGuessData(gameSessionId: string): Promise<Array<{
    position: number
    isCorrect: boolean
    roundTimeTakenMs: number
    powerUpUsed: string | null
    screenshotId: number
  }>>
  countDistinctDaysPlayed(userId: string): Promise<number>
}

// ---------- Screenshot ----------

export interface ScreenshotWithGameRecord {
  id: number
  game_id: number
  image_url: string
  thumbnail_url: string | null
  difficulty: number
  location_hint: string | null
  created_at: Date
  game_name: string
  game_slug: string
  cover_image_url: string | null
  game_aliases: string[] | null
  release_year: number | null
  metacritic: number | null
}

export interface ScreenshotRepository {
  findById(id: number): Promise<Screenshot | null>
  findByGameId(gameId: number): Promise<Screenshot[]>
  findWithGame(id: number): Promise<{
    screenshot: Screenshot
    gameName: string
    coverImageUrl?: string
    aliases: string[]
    releaseYear?: number
    metacritic?: number
  } | null>
  getGameByScreenshotId(
    screenshotId: number
  ): Promise<{ publisher: string | null; developer: string | null } | null>
  findAll(): Promise<ScreenshotWithGameRecord[]>
  create(data: {
    gameId: number
    imageUrl: string
    thumbnailUrl?: string
    difficulty: number
    locationHint?: string
  }): Promise<Screenshot>
  findRandomNotInTier(
    tierId: number,
    count: number,
    minMetacritic?: number
  ): Promise<Screenshot[]>
}

// ---------- Achievement ----------

import type {
  AchievementRow as AchievementRecord,
  UserAchievementRow as UserAchievementRecord,
  UserAchievementWithDetails as UserAchievementWithDetailsRecord,
} from '../types/achievement.types.js'
export type { AchievementRecord, UserAchievementRecord, UserAchievementWithDetailsRecord }

export interface AchievementLeaderboardEntry {
  userId: string
  username: string
  displayName: string
  avatarUrl: string | null
  totalPoints: number
  achievementCount: number
}

export interface AchievementRepository {
  findAll(): Promise<AchievementRecord[]>
  findByKey(key: string): Promise<AchievementRecord | undefined>
  findByCategory(category: string): Promise<AchievementRecord[]>
  findUserAchievements(userId: string): Promise<UserAchievementWithDetailsRecord[]>
  hasAchievement(userId: string, achievementKey: string): Promise<boolean>
  awardAchievement(
    userId: string,
    achievementKey: string,
    progress?: number,
    progressMax?: number | null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata?: Record<string, any> | null
  ): Promise<UserAchievementRecord>
  updateProgress(
    userId: string,
    achievementKey: string,
    progress: number,
    progressMax?: number | null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata?: Record<string, any> | null
  ): Promise<UserAchievementRecord>
  getUserProgress(userId: string): Promise<Record<string, UserAchievementRecord>>
  getUserStats(userId: string): Promise<{
    totalEarned: number
    totalPoints: number
    byCategory: Record<string, number>
    byTier: Record<number, number>
  }>
  getLeaderboard(limit?: number): Promise<AchievementLeaderboardEntry[]>
  // ---- Aggregations used by the domain service ----
  countCompletedGameSessions(userId: string): Promise<number>
  countStartedGameSessions(userId: string): Promise<number>
  countAllGuesses(userId: string): Promise<number>
  countCorrectGuesses(userId: string): Promise<number>
  countSpeedCorrectGuesses(userId: string, maxTimeMs: number): Promise<number>
  countHintFreeCompletedGames(userId: string): Promise<number>
  countGenreCorrectGuesses(userId: string, genre: string): Promise<number>
  /**
   * Returns the most recent guesses for a user (newest first), up to `limit`.
   * Only `isCorrect` and `createdAt` are exposed; used to detect streaks of
   * consecutive correct guesses across all games.
   */
  findRecentGuessCorrectness(
    userId: string,
    limit: number
  ): Promise<Array<{ isCorrect: boolean; createdAt: Date }>>
  /**
   * Returns user ids for a challenge ordered by total_score DESC. Used to
   * compute a user's leaderboard rank.
   */
  findChallengeUserRanking(challengeId: number): Promise<Array<{ userId: string }>>
  /**
   * Returns the user's best (lowest) rank across all their completed
   * challenges. Returns null if the user has no completed challenges.
   */
  getUserBestChallengeRank(userId: string): Promise<number | null>
}

// ---------- Daily Login ----------

export interface UserLoginStreakRecord {
  id: number
  user_id: string
  current_login_streak: number
  longest_login_streak: number
  last_login_date: string | null
  last_claimed_date: string | null
  current_day_in_cycle: number
  created_at: Date
  updated_at: Date
}

export interface LoginRewardClaimRecord {
  id: number
  user_id: string
  reward_id: number
  day_number: number
  streak_at_claim: number
  claimed_at: Date
}

export interface DailyLoginRepository {
  getAllRewards(): Promise<DailyReward[]>
  getRewardForDay(dayNumber: number): Promise<DailyReward | null>
  getOrCreateUserStreak(userId: string): Promise<UserLoginStreakRecord>
  getUserStreak(userId: string): Promise<UserLoginStreakRecord | null>
  updateUserStreak(
    userId: string,
    data: {
      currentLoginStreak: number
      longestLoginStreak: number
      lastLoginDate: string
      currentDayInCycle: number
    }
  ): Promise<void>
  /**
   * Atomically claim today's reward (insert claim row, bump streak's
   * last_claimed_date, upsert inventory items, increment total score).
   * The DB enforces "one claim per (user, UTC day)" via a unique index;
   * on collision the call returns `{ ok: false, reason: 'ALREADY_CLAIMED' }`
   * so the domain doesn't need to inspect SQLSTATE.
   */
  claimDailyReward(input: {
    userId: string
    rewardId: number
    dayNumber: number
    streakAtClaim: number
    items: Array<{ itemType: string; itemKey: string; quantity: number }>
    points: number
  }): Promise<{ ok: true } | { ok: false; reason: 'ALREADY_CLAIMED' }>
  hasClaimedToday(userId: string): Promise<boolean>
  getClaimHistory(userId: string, limit?: number): Promise<LoginRewardClaimRecord[]>
}

// ---------- Leaderboard ----------

export interface LeaderboardRepository {
  findByChallenge(challengeId: number, limit?: number): Promise<LeaderboardEntry[]>
  getPercentileForScore(challengeId: number, score: number): Promise<PercentileResponse>
  findByMonth(year: number, month: number, limit?: number): Promise<MonthlyLeaderboardEntry[]>
}

// ---------- Inventory ----------

export interface InventoryRepository {
  getUserInventory(userId: string): Promise<UserInventory>
  getItem(
    userId: string,
    itemType: string,
    itemKey: string
  ): Promise<UserInventoryItem | null>
  addItems(
    userId: string,
    itemType: string,
    itemKey: string,
    quantity: number
  ): Promise<void>
  useItems(
    userId: string,
    itemType: string,
    itemKey: string,
    quantity?: number
  ): Promise<boolean>
  getItemQuantity(userId: string, itemType: string, itemKey: string): Promise<number>
  addMultipleItems(
    userId: string,
    items: Array<{ itemType: string; itemKey: string; quantity: number }>
  ): Promise<void>
}

// ---------- Challenge ----------

export interface ChallengeRecord {
  id: number
  challenge_date: string
  created_at: Date
}

export interface TierRecord {
  id: number
  daily_challenge_id: number
  tier_number: number
  name: string
  time_limit_seconds: number
}

export interface TierScreenshotRecord {
  position: number
  bonus_multiplier: string
  screenshot_id: number
  image_url: string
}

export interface TierScreenshotWithGame {
  position: number
  screenshot: Screenshot
  game: Game
}

export interface ChallengeRepository {
  findById(id: number): Promise<ChallengeRecord | null>
  findByDate(date: string): Promise<ChallengeRecord | null>
  findTiersByChallenge(challengeId: number): Promise<TierRecord[]>
  findTierById(tierId: number): Promise<TierRecord | null>
  findTierByNumber(challengeId: number, tierNumber: number): Promise<TierRecord | null>
  findScreenshotAtPosition(
    tierId: number,
    position: number
  ): Promise<TierScreenshotRecord | null>
  findAll(): Promise<ChallengeRecord[]>
  create(challengeDate: string): Promise<ChallengeRecord>
  createTier(data: {
    dailyChallengeId: number
    tierNumber: number
    name: string
    timeLimitSeconds: number
  }): Promise<TierRecord>
  createTierScreenshots(tierId: number, screenshotIds: number[]): Promise<void>
  deleteTierScreenshots(tierId: number): Promise<number>
  findRecentChallenges(days: number): Promise<ChallengeRecord[]>
  /**
   * Returns every position in a tier with its screenshot shape only
   * (no game info). Used by session-detail views to render already-played
   * screenshots regardless of guess outcome.
   */
  findTierScreenshots(tierId: number): Promise<Array<{ position: number; screenshot: Screenshot }>>
  /**
   * Returns position + screenshot + full game for the given positions
   * in a tier. Used when the caller needs to show the answer (i.e. unfound
   * positions in a completed session).
   */
  findTierScreenshotsWithGames(
    tierId: number,
    positions: number[]
  ): Promise<TierScreenshotWithGame[]>
  /**
   * Returns every tier screenshot whose position is NOT in the given
   * `excludePositions` list (i.e. "unfound" screenshots for a session),
   * joined with the full game record. Positions come back sorted
   * ascending. If `excludePositions` is empty, all positions are
   * returned.
   */
  findTierScreenshotsExcludingPositions(
    tierId: number,
    excludePositions: number[]
  ): Promise<TierScreenshotWithGame[]>
}

// ---------- Import State ----------

export interface ImportStateRepository {
  create(data: {
    importType?: string
    batchSize?: number
    minMetacritic?: number
    screenshotsPerGame?: number
  }): Promise<ImportState>
  findById(id: number): Promise<ImportState | null>
  findActive(): Promise<ImportState | null>
  findActiveByType(importType: string): Promise<ImportState | null>
  findAll(options?: { limit?: number; offset?: number }): Promise<ImportState[]>
  update(
    id: number,
    data: Partial<{
      status: ImportStatus
      totalGamesAvailable: number
      totalBatchesEstimated: number
      startedAt: Date
      pausedAt: Date
      resumedAt: Date
      completedAt: Date
    }>
  ): Promise<ImportState | null>
  updateProgress(
    id: number,
    progress: {
      currentPage?: number
      lastProcessedOffset?: number
      gamesProcessed?: number
      gamesImported?: number
      gamesSkipped?: number
      screenshotsDownloaded?: number
      failedCount?: number
      currentBatch?: number
    }
  ): Promise<ImportState | null>
  setStatus(id: number, status: ImportStatus): Promise<ImportState | null>
  delete(id: number): Promise<void>
}

// ---------- Funnel Event ----------

export type FunnelEventName =
  | 'session_started'
  | 'guess_submitted'
  | 'session_completed'
  | 'session_abandoned'

export interface FunnelEventInput {
  eventName: FunnelEventName
  userId?: string | null
  sessionId?: string | null
  payload?: Record<string, unknown>
}

export interface FunnelEventRepository {
  record(event: FunnelEventInput): Promise<void>
}

// ---------- Geolocation Mode ----------

export interface GeoMapRepository {
  findById(id: number): Promise<GeoMap | null>
  // Legacy single-map lookup, kept for callers (ingest tick fallback,
  // contribute pick) that don't yet need multi-map awareness. Returns the
  // most recently created enabled map for the game.
  findActiveByGameId(gameId: number): Promise<GeoMap | null>
  findFirstEnabledByGameId(gameId: number): Promise<GeoMap | null>
  findCaptureDefaultByGameId(gameId: number): Promise<GeoMap | null>
  // All maps (any state) for admin listings.
  listByGameId(
    gameId: number,
  ): Promise<Array<GeoMap & { isActive: boolean }>>
  // Enabled maps the daily-challenge chooser surfaces to players.
  listEnabledByGameId(gameId: number): Promise<GeoMap[]>
  findEnabledById(gameId: number, mapId: number): Promise<GeoMap | null>
}

export interface GeoScreenshotRepository {
  findCandidateById(id: number): Promise<GeoScreenshotCandidate | null>
  findRandomUnlabeledForGame(gameId: number): Promise<GeoScreenshotCandidate | null>
  incrementPinCount(candidateId: number): Promise<number>
  setCandidateStatus(
    candidateId: number,
    status: 'pending' | 'collecting' | 'promoted' | 'rejected',
  ): Promise<void>
  findMetaByCandidateId(candidateId: number): Promise<GeoScreenshotMeta | null>
  findMetaById(id: number): Promise<GeoScreenshotMeta | null>
  promoteCandidateToMeta(data: {
    candidateId: number
    geoMapId: number
    canonicalX: number
    canonicalY: number
    confidence: number
    consensusVersion: number
    promotedVia: 'consensus' | 'admin'
    promotedBy?: string
  }): Promise<GeoScreenshotMeta>
  countPromotedForGame(gameId: number): Promise<number>
  pickRandomPromotedForGame(
    gameId: number,
    geoMapId?: number,
    excludeMetaIds?: number[],
  ): Promise<GeoScreenshotMeta | null>
  // Free-play catalog: games with at least one promoted screenshot, plus
  // the per-game count of distinct maps and screenshots so the picker can
  // render badges without an N+1 lookup.
  listPlayableGames(): Promise<
    Array<{
      id: number
      name: string
      coverImageUrl: string | null
      mapCount: number
      screenshotCount: number
    }>
  >
}

export interface GeoChallengeRepository {
  findByDate(date: string, tier?: number): Promise<GeoChallenge | null>
  findCurrent(tier?: number): Promise<GeoChallenge | null>
  listRecent(days: number): Promise<GeoChallenge[]>
  listRecentWithStatus(days: number, userId?: string): Promise<GeoChallengeWithStatus[]>
  create(data: {
    challengeDate: string
    geoScreenshotMetaId: number
    tier?: number
  }): Promise<GeoChallenge>
  setCurrent(args: { challengeId: number; tier?: number }): Promise<void>
  findGuess(
    userId: string,
    challengeId: number,
  ): Promise<{
    id: number
    user_id: string
    geo_challenge_id: number
    x: number
    y: number
    distance: number
    score: number
    score_version: number
    duration_ms: number | null
    is_skip: boolean
    created_at: Date
  } | null>
  recordGuess(data: {
    userId: string
    geoChallengeId: number
    guess: GeoPoint
    distance: number
    score: number
    scoreVersion: number
    durationMs?: number
    geoMapIdPicked?: number | null
    wrongMap?: boolean
  }): Promise<GeoGuessResult>
  recordSkip(data: { userId: string; geoChallengeId: number }): Promise<void>
  upsertDaily(args: { challengeDate: string; userId: string; score: number }): Promise<void>
  upsertMonthly(args: { period: string; userId: string; scoreDelta: number }): Promise<void>
  topDaily(challengeDate: string, limit?: number): Promise<GeoLeaderboardEntry[]>
  topMonthly(period: string, limit?: number): Promise<GeoLeaderboardEntry[]>
  getChallengeStats(
    challengeId: number,
  ): Promise<{ averageScore: number; playerCount: number }>
}

export interface GeoPinRepository {
  submit(data: {
    userId: string
    geoScreenshotCandidateId: number
    pin: GeoPoint
  }): Promise<GeoPinSubmission | null>
  listByCandidate(candidateId: number): Promise<GeoPinSubmission[]>
  listPendingByCandidate(candidateId: number): Promise<GeoPinSubmission[]>
  applyDecision(args: {
    pinId: number
    status: GeoPinStatus
    distanceFromCentroid: number
  }): Promise<void>
  countByUserInWindow(userId: string, windowSeconds: number): Promise<number>
  userRejectionRatio7d(userId: string): Promise<{ submitted: number; rejected: number }>
}

export interface GeoContributorRepository {
  getStats(userId: string): Promise<GeoContributorStats | null>
  bumpCounters(args: {
    userId: string
    submittedDelta: number
    acceptedDelta: number
    rejectedDelta: number
  }): Promise<void>
  setTier(userId: string, tier: GeoContributorTier): Promise<void>
  setShadowBanned(userId: string, shadowBanned: boolean): Promise<void>
  listThresholds(): Promise<GeoContributorTierThreshold[]>
}
