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
  createdAt: string
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
}

// Position tracking for navigation
export type PositionStatus = 'not_visited' | 'in_progress' | 'skipped' | 'correct'

export interface PositionState {
  position: number
  status: PositionStatus
  isCorrect: boolean
  screenshotData?: ScreenshotResponse
  hasIncorrectGuess?: boolean
  hintYearUsed?: boolean
  hintPublisherUsed?: boolean
  hintDeveloperUsed?: boolean
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
  /** Game name hint - only returned for admin users */
  gameName?: string
}

// Guess API
export interface GuessRequest {
  tierSessionId: string
  screenshotId: number
  position: number
  gameId: number | null
  guessText: string
  roundTimeTakenMs: number
  powerUpUsed?: 'hint_year' | 'hint_publisher' | 'hint_developer'
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
  availableHints?: {
    year: string | null
    publisher: string | null
    developer: string | null
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
}

export interface GameHistoryResponse {
  entries: GameHistoryEntry[]
}

export interface GameSessionDetailsResponse {
  sessionId: string
  challengeDate: string
  totalScore: number
  isCompleted: boolean
  completedAt: string | null
  totalScreenshots: number
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
