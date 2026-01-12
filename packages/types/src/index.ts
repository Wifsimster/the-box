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
  initialScore: number
  decayRate: number
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

export type PowerUpType = 'x2_timer' | 'hint'

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
}

// Position tracking for navigation
export type PositionStatus = 'not_visited' | 'in_progress' | 'skipped' | 'correct'

export interface PositionState {
  position: number
  status: PositionStatus
  isCorrect: boolean
  screenshotData?: ScreenshotResponse
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
    /** Session start time for score countdown */
    sessionStartedAt: string
    /** Scoring configuration for countdown */
    scoringConfig: ScoringConfig
  } | null
}

export interface ScoringConfig {
  initialScore: number
  decayRate: number
}

export interface StartChallengeResponse {
  sessionId: string
  tierSessionId: string
  totalScreenshots: number
  sessionStartedAt: string
  scoringConfig: ScoringConfig
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
  sessionElapsedMs: number
  powerUpUsed?: PowerUpType
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
}

// End game (forfeit) API
export interface EndGameResponse {
  totalScore: number
  screenshotsFound: number
  unfoundCount: number
  penaltyApplied: number
  isCompleted: boolean
  completionReason: 'forfeit'
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

// ============================================
// Socket Events
// ============================================

export interface LiveScore {
  username: string
  score: number
}

export interface JoinChallengeEvent {
  challengeId: number
  username: string
}

export interface ScoreUpdateEvent {
  challengeId: number
  score: number
}

export interface PlayerFinishedEvent {
  challengeId: number
  score: number
}

export interface PlayerJoinedEvent {
  username: string
  totalPlayers: number
}

export interface PlayerLeftEvent {
  username: string
  totalPlayers: number
}

// ============================================
// Party System (Multiplayer Rooms)
// ============================================

export interface PartyMember {
  socketId: string
  username: string
  score: number
  isHost: boolean
  isReady: boolean
}

export interface Party {
  code: string
  hostSocketId: string
  challengeId: number | null
  members: PartyMember[]
  isGameStarted: boolean
  createdAt: string
}

// Party Socket Events (Client -> Server)
export interface CreatePartyEvent {
  username: string
}

export interface JoinPartyEvent {
  partyCode: string
  username: string
}

export interface LeavePartyEvent {
  partyCode: string
}

export interface StartPartyGameEvent {
  partyCode: string
  challengeId: number
}

export interface PartyResetGameEvent {
  partyCode: string
}

export interface PartyScoreUpdateEvent {
  partyCode: string
  score: number
}

export interface PartyPlayerFinishedEvent {
  partyCode: string
  score: number
}

// Party Socket Events (Server -> Client)
export interface PartyCreatedEvent {
  partyCode: string
  party: Party
}

export interface PartyJoinedEvent {
  party: Party
}

export interface PartyUpdatedEvent {
  party: Party
}

export interface PartyGameStartedEvent {
  challengeId: number
}

export interface PartyGameResetEvent {
  message: string
}

export interface PartyErrorEvent {
  message: string
}

export interface PartyDisbandedEvent {
  reason: string
}

// ============================================
// Job Management (Admin)
// ============================================

export type JobType = 'import-games' | 'import-screenshots' | 'sync-new-games' | 'batch-import-games' | 'create-daily-challenge'
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
  data: JobData
  result?: JobResult
  error?: string
  createdAt: string
  startedAt?: string
  completedAt?: string
  failedAt?: string
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
}

export interface JobResult {
  gamesProcessed?: number
  screenshotsProcessed?: number
  failedCount?: number
  message?: string
  // For sync-new-games
  newGames?: number
  skipped?: number
  // For batch-import-games
  batchNumber?: number
  totalBatches?: number
  importStateId?: number
  totalGamesAvailable?: number
  isComplete?: boolean
  nextBatchScheduled?: boolean
  gamesImported?: number
  gamesSkipped?: number
}

// Job Socket Events
export interface JobProgressEvent {
  jobId: string
  progress: number
  current: number
  total: number
  message: string
}

export interface JobCompletedEvent {
  jobId: string
  result: JobResult
}

export interface JobFailedEvent {
  jobId: string
  error: string
}

// Extended progress event for batch imports
export interface BatchImportProgressEvent extends JobProgressEvent {
  importStateId: number
  totalGamesAvailable: number
  currentBatch: number
  totalBatches: number
  gamesImported: number
  gamesSkipped: number
  screenshotsDownloaded: number
  estimatedTimeRemaining: string | null
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
