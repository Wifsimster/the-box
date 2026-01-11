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
  completionReason?: 'all_found'
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
// Job Management (Admin)
// ============================================

export type JobType = 'import-games' | 'import-screenshots' | 'sync-new-games'
export type JobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed'

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
}

export interface JobResult {
  gamesProcessed?: number
  screenshotsProcessed?: number
  failedCount?: number
  message?: string
  // For sync-new-games
  newGames?: number
  skipped?: number
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
