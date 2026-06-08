// ============================================
// Domain Entities
// ============================================

// User types
export interface User {
  id: string
  username: string
  email: string
  displayName: string
  avatarUrl?: string
  isGuest: boolean
  isAdmin: boolean
  totalScore: number
  currentStreak: number
  longestStreak?: number
  lastPlayedAt?: string
  lastLoginAt?: string
  createdAt: string
  emailMarketingConsent: boolean
  emailConsentUpdatedAt?: string
  // Selected UI theme. Defaults to 'default' for everyone. Non-default
  // values are premium-only; the frontend renders the user's selection
  // and falls back to 'default' if the catalog drops a theme later.
  selectedTheme: string
}

// Minimal public profile — safe to expose to unauthenticated visitors.
export interface PublicProfile {
  username: string
  displayName: string
  avatarUrl?: string
  createdAt: string
  totalScore: number
  currentStreak: number
  longestStreak: number
  gamesPlayed: number
  badges: Array<{ key: string; quantity: number }>
  // `sessionId` is deliberately omitted: it would let an anonymous
  // visitor pivot to /api/leaderboard/session/:sessionId to read the
  // player's answers for today (gated server-side, but the id should
  // not leak in the first place).
  recentSessions: Array<{
    challengeDate: string
    totalScore: number
    completedAt: string | null
  }>
}

// Game catalog types
export interface Game {
  id: number
  name: string
  slug: string
  aliases: string[]
  releaseYear?: number
  developer?: string
  publisher?: string
  genres?: string[]
  platforms?: string[]
  coverImageUrl?: string
  metacritic?: number
  rawgId?: number
  lastSyncedAt?: string
}

// Screenshot types
export interface Screenshot {
  id: number
  gameId: number
  imageUrl: string
  thumbnailUrl?: string
  difficulty: 1 | 2 | 3
  locationHint?: string
}

// ============================================
// Challenge Domain
// ============================================

export interface DailyChallenge {
  id: number
  challengeDate: string
  tiers: Tier[]
}

export interface Tier {
  id: number
  dailyChallengeId: number
  tierNumber: number
  name: string
  timeLimitSeconds: number
  screenshots: TierScreenshot[]
}

export interface TierScreenshot {
  id: number
  tierId: number
  screenshotId: number
  position: number
  bonusMultiplier?: number
  screenshot: Screenshot
}

// ============================================
// Session Domain
// ============================================

export interface GameSession {
  id: string
  userId: string
  dailyChallengeId: number
  currentPosition: number
  totalScore: number
  isCompleted: boolean
  startedAt: string
  completedAt?: string
}

export interface TierSession {
  id: string
  gameSessionId: string
  tierId: number
  score: number
  correctAnswers: number
  isCompleted: boolean
  startedAt: string
  completedAt?: string
}

export interface Guess {
  id: number
  tierSessionId: string
  screenshotId: number
  position: number
  tryNumber: number
  guessedGameId?: number
  guessedText?: string
  isCorrect: boolean
  sessionElapsedMs: number
  scoreEarned: number
  powerUpUsed?: PowerUpType
  createdAt: string
}

// ============================================
// Power-up Domain
// ============================================

export type PowerUpType = 'x2_timer' | 'hint' | 'hint_year' | 'hint_publisher' | 'hint_developer'

export interface PowerUp {
  id: number
  tierSessionId: string
  powerUpType: PowerUpType
  isUsed: boolean
  earnedAtRound: number
  usedAtRound?: number
}

// ============================================
// Leaderboard Domain
// ============================================

export interface LeaderboardEntry {
  rank: number
  userId: string
  username: string
  displayName: string
  avatarUrl?: string
  totalScore: number
  correctAnswers?: number
  totalTimeMs?: number
  completedAt?: string
  sessionId?: string
}

// Live event types
export interface LiveEvent {
  id: number
  dailyChallengeId: number
  name: string
  scheduledAt: string
  durationMinutes: number
  isActive: boolean
}

// ============================================
// Achievement Domain
// ============================================

export interface Achievement {
  id: number
  key: string
  name: string
  description: string
  category: string
  iconUrl: string | null
  points: number
  tier: number
  isHidden: boolean
}

export interface UserAchievement {
  id: number
  userId: string
  achievementId: number
  earnedAt: string
  progress: number
  progressMax: number | null
  metadata: Record<string, any> | null
  achievement: Achievement
}

export interface AchievementWithProgress extends Achievement {
  earned: boolean
  earnedAt: string | null
  progress: number
  progressMax: number | null
}

export interface AchievementStats {
  totalEarned: number
  totalPoints: number
  byCategory: Record<string, number>
  byTier: Record<number, number>
}

export interface NewlyEarnedAchievement {
  key: string
  name: string
  description: string
  category: string
  iconUrl: string | null
  points: number
  tier: number
}

// ============================================
// Game State (Frontend)
// ============================================

export type GamePhase =
  | 'idle'
  | 'daily_intro'
  | 'playing'
  | 'result'
  | 'bonus_round'
  | 'challenge_complete'

export interface GuessAttempt {
  /** Free-text the user entered (game name) for this attempt. */
  guess: string
  isCorrect: boolean
}

export interface GuessResult {
  position: number
  isCorrect: boolean
  correctGame: Game
  userGuess: string | null
  timeTakenMs: number
  scoreEarned: number
  hintPenalty?: number
  wrongGuessPenalty?: number
  screenshot?: Screenshot
  /** All guesses the user made for this position, in chronological order. */
  attempts?: GuessAttempt[]
}

// Position tracking for navigation.
// `timed_out` is a terminal state: the player ran out of time on this
// screenshot. Unlike `skipped` it is NOT revisitable and is revealed as an
// unfound game at the end of the challenge.
export type PositionStatus = 'not_visited' | 'in_progress' | 'skipped' | 'correct' | 'timed_out'

export interface PositionState {
  position: number
  status: PositionStatus
  isCorrect: boolean
  screenshotData?: ScreenshotResponse
  hasIncorrectGuess?: boolean
  hintYearUsed?: boolean
  hintPublisherUsed?: boolean
  hintDeveloperUsed?: boolean
  hintGenreUsed?: boolean
  /**
   * True once the user has spent a `second_chance` for this position in
   * the current tier session. Drives the modal's "show once" behaviour
   * and the disabled state of the inventory item.
   */
  secondChanceActivated?: boolean
  /**
   * Total active (on-screen) milliseconds already spent guessing this
   * position, excluding the segment currently in progress. Lets the countdown
   * timer RESUME from the remaining budget when the player navigates back to a
   * skipped position instead of resetting to the full limit. Persisted with
   * `positionStates`, so a refresh can't reset it either.
   */
  timeSpentMs?: number
}

// ============================================
// API Types
// ============================================

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: ApiError
}

export interface ApiError {
  code: string
  message: string
}

// Auth API
export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  username: string
  email: string
  password: string
}

export interface AuthResponse {
  user: User
  token: string
}

// Challenge API
export interface TodayChallengeResponse {
  challengeId: number | null
  date: string
  totalScreenshots: number
  hasPlayed: boolean
  userSession?: {
    sessionId: string
    tierSessionId: string
    currentPosition: number
    isCompleted: boolean
    totalScore: number
    /** Positions where user has guessed correctly */
    correctPositions: number[]
    /** Count of screenshots found (correct answers) */
    screenshotsFound: number
    /** Session start time */
    sessionStartedAt: string
    /** Whether this is a catch-up session (previous day play) */
    isCatchUp?: boolean
  } | null
  /** Yesterday's challenge info if available and not yet played */
  yesterdayChallenge?: {
    challengeId: number
    date: string
    hasPlayed: boolean
    /** If played, whether it was completed */
    isCompleted?: boolean
  } | null
}

export interface StartChallengeResponse {
  sessionId: string
  tierSessionId: string
  totalScreenshots: number
  sessionStartedAt: string
}

// Backwards compatibility alias
export type StartTierResponse = StartChallengeResponse

export interface ScreenshotResponse {
  screenshotId: number
  position: number
  imageUrl: string
  bonusMultiplier?: number
  /**
   * Seconds the player has to guess this screenshot before it times out.
   * Sourced from the tier's `time_limit_seconds` (defaults to 45). Drives
   * the in-game countdown timer.
   */
  timeLimitSeconds: number
}

// Guess API
export interface GuessRequest {
  tierSessionId: string
  screenshotId: number
  position: number
  gameId: number | null
  guessText: string
  roundTimeTakenMs: number
  powerUpUsed?: 'hint_year' | 'hint_publisher' | 'hint_developer' | 'hint_genre'
}

export interface GuessResponse {
  isCorrect: boolean
  correctGame: Game
  scoreEarned: number
  totalScore: number
  screenshotsFound: number
  nextPosition: number | null
  isCompleted: boolean
  completionReason?: 'all_found' | 'forfeit'
  hintPenalty?: number
  hintFromInventory?: boolean
  wrongGuessPenalty?: number
  /**
   * Set on the response that follows a correct guess where a previously
   * activated `second_chance` floor was applied. The frontend uses it to
   * surface a small "+X (seconde chance)" badge so the player understands
   * why their score was bumped up. Absent (`undefined`) when no floor was
   * applied, including when the player guessed correctly without an
   * active activation.
   */
  secondChanceFloorBoost?: number
  availableHints?: {
    year: string | null
    publisher: string | null
    developer: string | null
    /**
     * Primary genre tag for the screenshot's game, or null when the
     * game has no genres set. Frontend renders the first tag only —
     * genre arrays are intentionally not exposed (privacy/discriminative
     * value: revealing all tags ≈ revealing the game).
     */
    genre: string | null
  }
  newlyEarnedAchievements?: NewlyEarnedAchievement[]
}

// End game (forfeit) API
export interface EndGameResponse {
  totalScore: number
  screenshotsFound: number
  unfoundCount: number
  penaltyApplied: number
  isCompleted: boolean
  completionReason: 'forfeit'
  unfoundGames: Array<{
    position: number
    game: Game
    screenshot: Screenshot
  }>
  newlyEarnedAchievements?: NewlyEarnedAchievement[]
}

// Search API
export interface GameSearchResult {
  id: number
  name: string
  releaseYear?: number
  coverImageUrl?: string
}

// Leaderboard API
export interface LeaderboardResponse {
  date: string
  challengeId?: number
  entries: LeaderboardEntry[]
}

export interface PercentileResponse {
  percentile: number      // e.g., 85 means "top 15%"
  totalPlayers: number    // total completed sessions
  rank: number            // actual rank position
}

export interface MonthlyLeaderboardEntry {
  rank: number
  userId: string
  username: string
  displayName: string
  avatarUrl?: string
  totalScore: number
  gamesPlayed: number
}

export interface MonthlyLeaderboardResponse {
  year: number
  month: number
  entries: MonthlyLeaderboardEntry[]
}

// User History API
export interface GameHistoryEntry {
  sessionId: string
  challengeDate: string  // YYYY-MM-DD
  totalScore: number
  isCompleted: boolean
  completedAt: string | null
  roundsCorrect: number
  totalScreenshots: number
}

export interface MissedChallenge {
  challengeId: number
  date: string  // YYYY-MM-DD
}

export interface GameHistoryResponse {
  entries: GameHistoryEntry[]
  missedChallenges: MissedChallenge[]
}

export interface GameSessionDetailsResponse {
  sessionId: string
  challengeDate: string
  totalScore: number
  isCompleted: boolean
  completedAt: string | null
  totalScreenshots: number
  /**
   * True when this session's totalScore equals the user's all-time
   * highest completed-session score (and totalScore > 0). Drives the
   * "personal best" gold hero treatment on the details page.
   */
  isPersonalBest: boolean
  guesses: Array<{
    position: number
    isCorrect: boolean
    correctGame: Game
    userGuess: string | null
    timeTakenMs: number
    scoreEarned: number
    hintPenalty?: number
    wrongGuessPenalty?: number
    tryNumber: number
    screenshot: Screenshot
    attempts: GuessAttempt[]
  }>
  unfoundGames: Array<{
    position: number
    game: Game
    screenshot: Screenshot
  }>
}

// ============================================
// Job Management (Admin)
// ============================================

export type JobType = 'import-games' | 'import-screenshots' | 'sync-new-games' | 'batch-import-games' | 'create-daily-challenge' | 'sync-all-games' | 'cleanup-anonymous-users' | 'recalculate-scores' | 'clear-daily-data'
export type JobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed'

// Import State for batch processing
export type ImportStatus = 'pending' | 'in_progress' | 'paused' | 'completed' | 'failed'

export interface ImportState {
  id: number
  importType: string
  status: ImportStatus

  // Configuration
  batchSize: number
  minMetacritic: number
  screenshotsPerGame: number

  // Progress tracking
  totalGamesAvailable: number | null
  currentPage: number
  lastProcessedOffset: number
  gamesProcessed: number
  gamesImported: number
  gamesSkipped: number
  screenshotsDownloaded: number
  failedCount: number

  // Batch tracking
  currentBatch: number
  totalBatchesEstimated: number | null

  // Timestamps
  startedAt: string | null
  pausedAt: string | null
  resumedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Job {
  id: string
  type: JobType
  status: JobStatus
  progress: number
  priority?: number
  data: JobData
  result?: JobResult
  error?: string
  createdAt: string
  startedAt?: string
  completedAt?: string
  failedAt?: string
  nextRunAt?: string // For recurring jobs, when the next run is scheduled
}

export interface JobData {
  // For import-games
  targetGames?: number
  screenshotsPerGame?: number
  minMetacritic?: number
  // For sync-new-games
  maxGames?: number
  // For batch-import-games
  batchSize?: number
  importStateId?: number
  isResume?: boolean
  // For sync-all-games
  syncStateId?: number
  updateExistingMetadata?: boolean
  // For recalculate-scores
  recalculateStateId?: number
  dryRun?: boolean
  startDate?: string
  endDate?: string
}

export interface JobResult {
  gamesProcessed?: number
  screenshotsProcessed?: number
  failedCount?: number
  message?: string
  // For sync-new-games
  newGames?: number
  skipped?: number
  // For batch-import-games and sync-all-games
  batchNumber?: number
  totalBatches?: number
  importStateId?: number
  totalGamesAvailable?: number
  isComplete?: boolean
  nextBatchScheduled?: boolean
  gamesImported?: number
  gamesSkipped?: number
  // For sync-all-games
  gamesUpdated?: number
  syncStateId?: number
  // For cleanup-anonymous-users
  usersDeleted?: number
  // For recalculate-scores
  sessionsProcessed?: number
  sessionsUpdated?: number
  sessionsSkipped?: number
  totalScoreChanges?: number
  recalculateStateId?: number
  dryRun?: boolean
  // For clear-daily-data
  sessionsDeleted?: number
  challengeId?: number
  challengeDate?: string
}

// Job API Types
export interface CreateJobRequest {
  type: JobType
  data?: JobData
}

export interface JobListResponse {
  jobs: Job[]
  total: number
}

export interface RecurringJob {
  id: string
  name: string
  pattern: string | null
  every: number | null
  nextRun: string | null
  isActive: boolean
}

// ============================================
// Email Log (admin)
// ============================================

export type EmailLogType =
  | 'password-reset'
  | 'verification'
  | 'streak-risk'
  | 'relance'
  | 'inactive-reminder'
  | 'referral-announcement'
  | 'admin-test'

export type EmailLogStatus = 'sent' | 'failed' | 'skipped'

export interface EmailLogEntry {
  id: number
  userId: string | null
  recipient: string
  type: EmailLogType
  subject: string
  status: EmailLogStatus
  providerMessageId: string | null
  errorMessage: string | null
  sentAt: string
}

export interface EmailLogResponse {
  entries: EmailLogEntry[]
  total: number
  page: number
  limit: number
}

export interface EmailLogQuery {
  page?: number
  limit?: number
  status?: EmailLogStatus
  type?: EmailLogType
  userId?: string
  search?: string
  dateFrom?: string
  dateTo?: string
}

// ============================================
// Daily Login Rewards Domain
// ============================================

export interface DailyReward {
  id: number
  dayNumber: number
  rewardType: 'powerup' | 'points' | 'legendary'
  rewardValue: {
    items: Array<{ key: string; quantity: number }>
    points: number
  }
  displayName: string
  description: string | null
  iconUrl: string | null
}

export interface UserLoginStreak {
  id: number
  userId: string
  currentLoginStreak: number
  longestLoginStreak: number
  lastLoginDate: string | null
  lastClaimedDate: string | null
  currentDayInCycle: number
}

export interface UserInventoryItem {
  id: number
  userId: string
  itemType: string
  itemKey: string
  quantity: number
}

export interface UserInventory {
  powerups: Record<string, number>
  totalItems: number
}

export interface DailyLoginStatus {
  isLoggedInToday: boolean
  canClaim: boolean
  hasClaimedToday: boolean
  currentStreak: number
  longestStreak: number
  currentDayInCycle: number
  todayReward: DailyReward | null
  allRewards: DailyReward[]
  /**
   * Set on the SINGLE response that follows a streak-freeze auto-consume
   * (the user missed exactly one day and a freeze was available). Frontend
   * shows a non-blocking toast; never null on subsequent calls within the
   * same login day. Absent (`null`) when no freeze was consumed.
   */
  streakFreezeConsumed?: {
    previousStreak: number
    newStreak: number
    freezesRemaining: number
  } | null
}

export interface ClaimRewardResponse {
  success: boolean
  reward: DailyReward
  newStreak: number
  newDayInCycle: number
  itemsAdded: Array<{ key: string; quantity: number }>
  pointsAdded: number
  inventory: UserInventory
}

export interface LoginRewardClaim {
  id: number
  userId: string
  rewardId: number
  dayNumber: number
  streakAtClaim: number
  claimedAt: string
}

// ============================================
// Generic Rewards (idempotent grants surfaced in RewardsInbox)
// ============================================

/**
 * Discriminator for the source of a reward grant. Each source pairs with a
 * `source_ref` natural key documented in `migrations/*_reward_grants.ts`.
 */
export type RewardSource =
  | 'reactivation'
  | 'milestone'
  | 'streak_freeze'
  | 'leaderboard_payout'
  | 'cosmetic_unlock'
  | 'powerup_drop'
  | 'daily_login'

/**
 * One inventory item granted as part of a reward. The shape mirrors
 * `user_inventory` rows.
 */
export interface RewardGrantItem {
  itemType: string
  itemKey: string
  quantity: number
}

/**
 * Persistent payload stored in `reward_grants.payload`. Kept narrow on
 * purpose: items are the only thing inboxes need to render. Source-specific
 * metadata (e.g. milestone display name) is resolved client-side via i18n
 * keys derived from `source` + `sourceRef`, not embedded here.
 */
export interface RewardGrantPayload {
  items: RewardGrantItem[]
}

/**
 * Domain representation of a reward grant. Repositories return rows mapped
 * to this shape; routes serialize to JSON directly.
 */
export interface RewardGrant {
  id: string
  userId: string
  source: RewardSource
  sourceRef: string
  payload: RewardGrantPayload
  grantedAt: string
  unlockedAt: string | null
  claimedAt: string | null
}

/**
 * Socket.io event emitted to room `user:${userId}` AFTER the inventory
 * upsert commits. Frontend stores subscribe once and update the inbox
 * + Zustand inventory cache on receipt.
 */
export interface RewardGrantedEvent {
  rewardId: string
  source: RewardSource
  sourceRef: string
  items: RewardGrantItem[]
  grantedAt: string
  unlockedAt: string | null
}

// ============================================
// Cosmetic equipment (V2b)
// ============================================

export type CosmeticSlot = 'avatar_frame' | 'name_title'

export interface OwnedCosmetic {
  itemKey: string
  quantity: number
  slot: CosmeticSlot
  equipped: boolean
}

export interface CosmeticsState {
  owned: OwnedCosmetic[]
  equipped: Partial<Record<CosmeticSlot, string | null>>
}

// ============================================
// Geolocation Mode (additive — separate from the main game)
// ============================================

// Normalized [0..1] map coordinates. Both axes independent of pixel size.
export interface GeoPoint {
  x: number
  y: number
}

export type GeoMapSource =
  | 'registry'
  | 'fandom'
  | 'strategywiki'
  | 'fextralife'
  | 'wand'
  | 'mapgenie'
  | 'wikidata'
  | 'steam'
  | 'manual'

// 'image' = single flat PNG/JPG (most games today). 'tiles' = Leaflet-style
// tile pyramid (e.g. World of Warcraft via World-of-MapCraft, Hollow Knight
// at higher resolutions). Both kinds share widthPx/heightPx as the world
// rectangle in pixels at the deepest zoom — pin coordinates stay normalized
// [0..1] regardless of kind.
export type GeoMapKind = 'image' | 'tiles'

// Naming schemes for tile URL templates. Kept as a strict union (rather than
// free-form strings) so the formatter, the worker probe, and the renderer
// all agree on what a registry entry means.
//
//  - 'xyz': vanilla `{z}/{x}/{y}` substitution; Leaflet's default. Z grows
//    with zoom (z=0 most zoomed-out).
//  - 'xyz-padded2-inverted': zero-pad x and y to 2 digits, and invert z so
//    the URL's z=0 is the deepest layer (used by World-of-MapCraft).
export type GeoTileScheme = 'xyz' | 'xyz-padded2-inverted'

export interface GeoMapTilesConfig {
  urlTemplate: string
  minZoom: number
  maxZoom: number
  tileSize: number
  scheme: GeoTileScheme
}

export interface GeoMap {
  id: number
  gameId: number
  source: GeoMapSource
  sourceUrl?: string
  imageUrl: string
  widthPx: number
  heightPx: number
  kind: GeoMapKind
  // Set when kind === 'tiles'. Undefined for kind === 'image'.
  tiles?: GeoMapTilesConfig
  consensusRadius: number
  license: string
  attribution?: string
  // Optional region label for games whose world is natively split
  // (Witcher 3 Velen / Skellige, BG3 Acts I-III, Diablo II Acts I-V).
  // Undefined = canonical / world map (default).
  region?: string
  // Fandom Interactive Maps source identity (only set for source='fandom').
  // wikiMapName is the `Map:` page name without prefix; wikiRevisionId is
  // the JSON revisionId at import time, used for change detection.
  wikiMapName?: string
  wikiRevisionId?: number
  // Zone the map covers. NULL zone_slug = single-zone / world map.
  zoneName?: string
  zoneSlug?: string
  // Provider that produced this candidate (mirrors `source` for now;
  // diverges if we ever ingest a wand-sourced map under a custom ingest tag).
  provider?: string
  // Admin chose this map for its (game, zone). Exactly one selected map per
  // (game, zone). For multi-source pipelines, only the selected one is shown
  // to players.
  isSelected?: boolean
  /** @deprecated Kept for one release; mirrors `isSelected`. */
  isCaptureDefault?: boolean
}

// =====
// Multi-source map fetch pipeline (BullMQ-driven, replaces topup screenshots).
// =====

export type GeoSourceKind = 'map' | 'candidates'

// Providers tracked by the new pipeline. Keep in sync with the
// `geo_source_config` table seed.
export type GeoSourceName =
  | 'fandom'
  | 'strategywiki'
  | 'mapgenie'
  | 'wand'
  | 'steam'
  | 'rawg'
  | 'manual'

export interface GeoSourceConfig {
  source: GeoSourceName
  kind: GeoSourceKind
  priority: number
  isEnabled: boolean
  rateLimitPerMin?: number
  cooldownSecondsOnEmpty: number
}

export type MapPipelineStage =
  | 'queued'
  | 'fetching_map'
  | 'fetching_candidates'
  | 'awaiting_curation'
  | 'ready'
  | 'blocked'

export interface MapPipelineState {
  gameId: number
  currentStage: MapPipelineStage
  activeSource?: GeoSourceName
  nextSourceIdx: number
  attemptsTotal: number
  zonesTotal: number
  zonesCovered: number
  zonesSelected: number
  needsCuration: boolean
  lastAttemptAt?: string
  nextEligibleAt?: string
  updatedAt: string
}

export type GeoIngestOutcome =
  | 'success'
  | 'not_found'
  | 'rate_limited'
  | 'parse_error'
  | 'http_5xx'
  | 'http_4xx'
  | 'timeout'
  | 'empty'
  | 'circuit_open'

export type GeoIngestAttemptKind = 'map' | 'candidates'

export interface GeoIngestAttempt {
  id: number
  gameId: number
  source: GeoSourceName
  attemptKind: GeoIngestAttemptKind
  outcome: GeoIngestOutcome
  httpStatus?: number
  errorCode?: string
  errorDetail?: Record<string, unknown>
  itemsIngested: number
  latencyMs?: number
  correlationId?: string
  attemptedAt: string
}

// Lightweight subset of GeoMap surfaced to the daily challenge chooser. The
// player needs an image + size to render the thumbnail and (for the selected
// map) the canvas; everything else stays server-side until reveal.
export interface GeoMapOption {
  id: number
  region?: string
  imageUrl: string
  widthPx: number
  heightPx: number
  kind: GeoMapKind
  tiles?: GeoMapTilesConfig
}

export interface GeoScreenshotCandidate {
  id: number
  gameId: number
  /**
   * Set when the candidate is fetched via the admin review listing — the
   * repository joins `games` so the Pins UI can label rows without a
   * second round-trip per row. Per-id detail lookups don't populate it.
   */
  gameName?: string
  geoMapId: number
  screenshotId?: number
  imageUrl: string
  thumbnailUrl?: string
  source: 'steam' | 'rawg' | 'manual'
  externalId?: string
  status: 'pending' | 'collecting' | 'promoted' | 'rejected'
  pinCount: number
}

export interface GeoScreenshotMeta {
  id: number
  geoScreenshotCandidateId: number
  geoMapId: number
  canonical: GeoPoint
  confidence: number
  consensusVersion: number
  promotedVia: 'consensus' | 'admin'
}

// Per-game summary surfaced by the admin moderation list. Counts come from a
// single GROUP BY on geo_screenshot_candidate so the moderator sees the true
// number of captures per game (the per-candidate listing is paginated and
// would lie if we summed a capped page client-side).
export interface GeoCandidateGameSummary {
  gameId: number
  gameName: string | null
  collectingCount: number
  pendingCount: number
  promotedCount: number
  rejectedCount: number
  totalCount: number
  oldestPendingAt: string | null
}

export interface GeoChallenge {
  id: number
  challengeDate: string
  geoScreenshotMetaId: number
  tier: number
}

// Sibling shape returned by the userId-aware history endpoint so the
// frontend can find the next unplayed challenge without an extra
// per-challenge round-trip. `hasGuessed` is true if the player has
// already submitted *or* skipped this challenge — both block today's
// slot symmetrically.
export interface GeoChallengeWithStatus extends GeoChallenge {
  hasGuessed: boolean
}

export interface GeoGuessInput {
  geoChallengeId: number
  // Map the player picked from the chooser. Required when the challenge's
  // game has > 1 enabled map; the API still accepts a missing value for
  // single-map games and treats it as "the only one".
  geoMapId?: number
  guess: GeoPoint
  durationMs?: number
}

export interface GeoGuessResult {
  guess: GeoPoint
  canonical: GeoPoint
  distance: number
  score: number
  scoreVersion: number
  // Community comparison: average score across all players who have
  // already submitted on this challenge (the just-recorded guess
  // included), and how many players that average is computed from.
  // Optional so older clients / older persisted store snapshots stay valid.
  averageScore?: number
  playerCount?: number
  // Multi-map reveal: the map the screenshot actually belongs to and a
  // flag for "the player picked the wrong map" (score floored to ~1).
  // Optional so older persisted store snapshots stay valid.
  correctMapId?: number
  wrongMap?: boolean
}

// ---- Free-play (unranked, all-games-all-maps browser) ----

// Catalog row: a game that the free-play picker can offer. mapCount and
// screenshotCount let the UI render badges without an N+1 lookup; the cover
// art is reused from the games table when available.
export interface GeoPlayableGame {
  id: number
  name: string
  coverImageUrl: string | null
  mapCount: number
  screenshotCount: number
  // True when the game is set in real geography (GTA → LA, Yakuza →
  // Tokyo). The cold-start shuffle uses this to bias first-time
  // visitors toward titles where the pin task has an obvious mental
  // model. Defaults to false for fictional-world games (Zelda's
  // Hyrule, Elden Ring's Lands Between, etc.).
  realWorldSetting: boolean
}

// Public dataset social-proof counter — total pins submitted since UTC
// midnight. Surfaced on the empty/first-run state so a cold visitor
// immediately sees they're joining an active community.
export interface GeoTodayStats {
  totalPinsToday: number
}

// View returned by `POST /api/geo/free-play/random`. Mirrors the daily
// challenge view minus the challenge wrapper — there is no challenge id
// because nothing is persisted server-side.
export interface GeoFreePlayView {
  // Echoed back so the client doesn't have to hold onto its own request
  // copy; `name` may be empty when the service couldn't cheaply look it
  // up (the free-play picker fills it from its games-list cache anyway).
  game: { id: number; name: string }
  meta: GeoScreenshotMeta
  candidate: GeoScreenshotCandidate
  maps: GeoMap[]
  // The map the screenshot canonically belongs to. Only populated AFTER
  // a guess is scored (the pick endpoint never includes it).
  map?: GeoMap
}

// Result of `POST /api/geo/free-play/guess`. Same shape as the daily
// `GeoGuessResult` minus the leaderboard-only `averageScore` /
// `playerCount` fields — free-play is unranked, so those would always
// be empty.
export interface GeoFreePlayResult {
  guess: GeoPoint
  canonical: GeoPoint
  distance: number
  score: number
  scoreVersion: number
  correctMapId: number
  wrongMap: boolean
  // Total contribution pins recorded against this capture so far. Surfaced
  // on submit so the player can see how many people have pinned the same
  // screenshot. Free-play guesses don't bump this — only crowdsourced
  // contributions do.
  pinCount: number
}

export interface GeoLeaderboardEntry {
  userId: string
  username: string
  displayName: string
  avatarUrl?: string
  score: number
  rank: number
}

export interface GeoPinSubmissionInput {
  geoScreenshotCandidateId: number
  pin: GeoPoint
  // Optional self-reported confidence — 1 = sure, 2 = approximate,
  // 3 = pure guess. The consensus algorithm uses it as a weight; an
  // unspecified value is treated as "sure".
  confidence?: GeoPinConfidence
}

// Self-reported confidence on a pin submission. Stored as a smallint
// in `geo_pin_submission.confidence` (CHECK 1–3); the type narrows to
// the same domain on the wire so a future weighting tweak doesn't
// have to chase string-vs-int representations.
export type GeoPinConfidence = 1 | 2 | 3

export type GeoPinStatus = 'pending' | 'accepted' | 'rejected'

export interface GeoPinSubmission {
  id: number
  userId: string
  geoScreenshotCandidateId: number
  pin: GeoPoint
  status: GeoPinStatus
  confidence?: GeoPinConfidence
  // True when the submitter was a Better Auth anonymous (guest)
  // session at submit time. Persisted so the consensus pipeline and
  // admin moderation can downweight or filter without re-deriving
  // provenance after the fact.
  isAnonymous: boolean
  distanceFromCentroid?: number
  reviewedAt?: string
  createdAt: string
}

export type GeoContributorTier = 'bronze' | 'silver' | 'gold' | 'diamond'

export interface GeoContributorStats {
  userId: string
  tier: GeoContributorTier
  totalSubmitted: number
  totalAccepted: number
  totalRejected: number
  accuracy: number
  shadowBanned: boolean
  tierPromotedAt?: string
}

export interface GeoContributorTierThreshold {
  tier: GeoContributorTier
  minAccepted: number
  minAccuracy: number
  displayOrder: number
}

// Realtime event payloads on the `/geo` namespace (or `geo:*` prefix).
export interface GeoRewardedEvent {
  userId: string
  geoScreenshotCandidateId: number
  items: Array<{ itemType: string; itemKey: string; quantity: number }>
}

export interface GeoTierUpEvent {
  userId: string
  previousTier: GeoContributorTier
  newTier: GeoContributorTier
}

// Realtime payload for the `/notifications` namespace, fired when an admin
// grants a user lifetime Premium. The frontend listens for this event and
// surfaces it as a toast — the user is also notified by email.
export interface UserPremiumGrantedEvent {
  userId: string
  tier: 'supporter_lifetime'
  grantedAt: string
}

// Realtime payload for the `/notifications` namespace, fired the moment a
// user unlocks one or more achievements — game completion, forfeit, or a
// background account-age milestone sweep. The frontend surfaces each as a
// celebratory toast so the unlock is seen immediately, on any page. The
// `user_achievements` rows are already persisted, so a missed emit (offline
// client) is reconciled when the achievements page next loads — this emit
// is best-effort, not authoritative.
export interface AchievementUnlockedEvent {
  userId: string
  achievements: NewlyEarnedAchievement[]
  unlockedAt: string
}

// Capture eligibility reporting. A user can flag a screenshot they believe
// shouldn't be playable (wrong game, unreadable, inappropriate, etc.). After
// enough distinct users report the same target it is auto-deactivated for
// all game modes. The reason union is kept here as a pure type so both
// frontend and backend agree on the wire shape; each side declares its own
// runtime list of values (this package emits CJS and is consumed as
// types-only).
export type ScreenshotReportReason =
  | 'wrong_game'
  | 'low_quality'
  | 'not_recognizable'
  | 'inappropriate'
  | 'too_easy'
  | 'other'

// ============================================
// Billing — Stripe-backed Premium subscription
// ============================================
// Wire shape only. The runtime price catalog (display amounts paired with
// env-driven Stripe price IDs) lives server-side in the backend config so
// this package stays types-only.

export type BillingTier = 'premium_monthly' | 'premium_annual' | 'supporter_lifetime'

// Mirrors a Stripe Subscription status. Internal billing status is derived
// from this; treat 'active' and 'trialing' as the only entitlement-granting
// states for recurring tiers.
export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'
  | 'paused'

// Public-facing price metadata returned by GET /api/billing/prices. Amount
// is in the smallest currency unit (cents) so the frontend formats once.
// Stripe price IDs are intentionally not exposed: the backend resolves
// them by lookup_key and the frontend identifies tiers by `tier` only.
export interface BillingPrice {
  tier: BillingTier
  unitAmount: number
  currency: string
  interval: 'month' | 'year' | null
  active: boolean
}

// Server-derived view of the caller's entitlement, returned by
// GET /api/billing/me. `validUntil` is the period end for recurring tiers
// (so the UI can show "Premium until ...") and null for lifetime grants.
export interface BillingEntitlement {
  isPremium: boolean
  tier: BillingTier | null
  validUntil: string | null
  cancelAtPeriodEnd: boolean
  source: 'subscription' | 'supporter' | null
}

// ============================================
// Premium-only profile stats (advanced view)
// ============================================
//
// Returned by GET /api/user/advanced-stats (premium-gated). Aggregates
// over the user's completed daily sessions only — catch-up sessions are
// excluded so the numbers don't drift from the leaderboard view. All
// time values are milliseconds.

export interface AdvancedStats {
  // Headline aggregates over completed daily sessions.
  bestScore: number
  averageScore: number
  totalCompletedSessions: number
  perfectSessions: number // sessions at 2000pts (the perfect ceiling)

  // Solve-time distribution across correct guesses (ms).
  solveTimeMs: {
    p25: number
    median: number
    p75: number
    mean: number
  }

  // How often the user reaches for each hint type. Counts only.
  hintUsage: {
    hint_year: number
    hint_publisher: number
    hint_developer: number
    hint_genre: number
  }

  // Last-six-months progression (oldest → newest). `month` is YYYY-MM.
  monthlyScores: Array<{
    month: string
    totalScore: number
    sessionCount: number
  }>

  // Streaks pulled from the user record so the panel can render them
  // without a second round-trip.
  streaks: {
    current: number
    longest: number
  }
}

// ============================================
// Web Push Notifications
// ============================================

// Wire payload the backend ships to the service worker via web-push. The SW
// renders a notification using `title`/`body` and stores `url` + `data` for
// the click handler. `type` is a free-form discriminator the SW also uses to
// pick a notification tag (so e.g. successive 'streak_at_risk' nudges
// coalesce instead of stacking).
export interface PushPayload {
  type: string
  title: string
  body: string
  url?: string
  data?: Record<string, unknown>
}

// POST /api/push/subscribe body. The browser hands us all four fields; the
// backend rejects `endpoint` if its host is not on the push-provider
// allowlist (FCM, Mozilla autopush, Apple, Windows).
export interface PushSubscribeRequest {
  endpoint: string
  keys: { p256dh: string; auth: string }
  userAgent?: string
}

// DELETE /api/push/subscribe body.
export interface PushUnsubscribeRequest {
  endpoint: string
}

// GET /api/push/subscribe / POST /api/push/subscribe success body.
export interface PushSubscribeResponse {
  id: number
  isActive: boolean
}

// Per-device summary returned by the (planned) GET /api/push/subscriptions
// endpoint. Intentionally omits the endpoint URL itself — the client doesn't
// need the per-device token, only enough to identify the row in a list.
export interface PushSubscriptionSummary {
  id: number
  userAgent: string | null
  createdAt: string
  lastSuccessAt: string | null
  isActive: boolean
}

// ============================================
// Public API / Streamer Kit (M1)
// ============================================

// One of four scopes a key can carry. M1 only branches on read:public vs the
// owner-only scopes; the latter three are stored against the key for forward
// compatibility with M2 (SSE + webhooks) so we don't need a second migration.
export type ApiKeyScope = 'read:public' | 'read:self' | 'stream:self' | 'webhooks:self'

export type ApiKeyMode = 'live' | 'test'

// Returned by /api/streamer-keys.list — never includes the plaintext.
export interface ApiKeySummary {
  id: number
  label: string
  keyPrefix: string
  mode: ApiKeyMode
  scopes: ApiKeyScope[]
  isActive: boolean
  createdAt: string
  lastUsedAt: string | null
  lastUsedIp: string | null
}

// One-shot response from /api/streamer-keys.create. Plaintext is only ever
// returned here and never persisted; if the user loses it they rotate.
export interface ApiKeyCreated extends ApiKeySummary {
  plaintext: string
}

// /api/public/v1/challenge/today — no spoilers, just shape.
export interface PublicChallengeToday {
  date: string
  totalScreenshots: number
  scoringConfig: {
    initialScore: number
    decayRate: number
  }
}

// /api/public/v1/streamers/:slug — public profile by slug.
export interface PublicStreamerProfile {
  slug: string
  displayName: string
  avatarUrl: string | null
  currentStreak: number
  longestStreak: number
  totalScore: number
  gamesPlayed: number
  // Today's snapshot, denormalized for chat one-liners. Null when the
  // streamer hasn't started today's challenge.
  today: {
    score: number
    rank: number | null
    completed: boolean
  } | null
}

// Today's session state, no spoilers. Sufficient to drive an overlay's
// "screenshots N/M, score X" readout without revealing the answer.
export interface PublicStreamerToday {
  slug: string
  status: 'not_started' | 'in_progress' | 'completed'
  // Present when status !== 'not_started'.
  session: {
    score: number
    screenshotsDone: number
    totalScreenshots: number
    tier: number | null
    startedAt: string
    completedAt: string | null
    rank: number | null
    countsForLeaderboard: boolean
  } | null
}

// /api/public/v1/leaderboard/daily and /monthly.
export interface PublicLeaderboardEntry {
  rank: number
  slug: string | null
  displayName: string
  avatarUrl: string | null
  totalScore: number
  // Only set on the daily endpoint.
  completedAt?: string
  // Only set on the monthly endpoint.
  gamesPlayed?: number
}

// ============================================
// Public API M2 — Webhooks + SSE events
// ============================================

// Top-level event taxonomy. Lives here so backend dispatch and frontend
// (test harness, settings UI) share one source of truth. Adding a new
// event = add it here, plus the handler in the dispatch site, plus an
// optional default subscription row.
export type PublicEventType =
  | 'session.started'
  | 'session.completed'
  | 'screenshot.scored'
  | 'rank.changed'

// Webhook registration row as returned to the owner. Plaintext secret is
// only present in the `WebhookCreated` shape below.
export interface WebhookSummary {
  id: number
  url: string
  label: string
  secretPrefix: string
  // Empty array means "all events". Otherwise a strict subset of PublicEventType.
  events: PublicEventType[]
  isActive: boolean
  createdAt: string
  lastDeliveredAt: string | null
}

export interface WebhookCreated extends WebhookSummary {
  // The signing secret. Shown exactly once at registration. If lost, the
  // owner must revoke and re-register.
  secret: string
}

// Envelope every webhook POST body uses. Keeps the verifier snippets in
// docs short — peel off `data` and switch on `event`.
export interface WebhookPayload<T = unknown> {
  // Stable id of the originating event. Idempotency key for receivers:
  // de-dup on this before acting.
  eventId: string
  event: PublicEventType
  // ISO timestamp the event was minted at (DB commit time, not delivery).
  occurredAt: string
  // Public slug of the streamer the event is about. Always set for streamer
  // events; future system-wide events may use a sentinel.
  slug: string
  data: T
}

// session.completed payload — used both by the webhook envelope and by
// the SSE channel. Score + rank are post-completion finalized values.
export interface SessionCompletedEvent {
  score: number
  screenshotsFound: number
  totalScreenshots: number
  rank: number | null
  challengeDate: string
  countsForLeaderboard: boolean
}

// session.started payload — fired when a streamer begins their daily.
// Useful for chat-bots that switch scenes or post "now playing" lines.
export interface SessionStartedEvent {
  sessionId: string
  challengeDate: string
  countsForLeaderboard: boolean
}

// rank.changed payload — fired alongside session.completed for the player
// who just finished a ranked (non-catch-up) session. A rank-only signal for
// bots that don't need the full session result. Not dispatched for catch-up
// sessions (those carry no leaderboard rank).
export interface RankChangedEvent {
  rank: number
  challengeDate: string
}

// SSE live-channel event names. The same envelope discipline as webhooks,
// but `id:` / `event:` / `data:` are emitted directly (not wrapped) so
// `EventSource.addEventListener('session.completed', …)` works out of the box.
export type SseEventName = PublicEventType | 'heartbeat' | 'connected'
