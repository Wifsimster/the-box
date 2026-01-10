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
  createdAt: string
}

// Game catalog types
export interface Game {
  id: number
  name: string
  slug: string
  aliases: string[]
  releaseYear?: number
  coverImageUrl?: string
}

// Screenshot types
export interface Screenshot {
  id: number
  gameId: number
  imageUrl: string
  thumbnailUrl?: string
  difficulty: 1 | 2 | 3
}

// Challenge types
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
  screenshot: Screenshot
}

// Session types
export interface GameSession {
  id: string
  userId: string
  dailyChallengeId: number
  currentTier: number
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
  guessedGameId?: number
  guessedText?: string
  isCorrect: boolean
  timeTakenMs: number
  scoreEarned: number
  powerUpUsed?: PowerUpType
  createdAt: string
}

// Power-up types
export type PowerUpType = 'x2_timer' | 'hint'

export interface PowerUp {
  id: number
  tierSessionId: string
  powerUpType: PowerUpType
  isUsed: boolean
  earnedAtRound: number
  usedAtRound?: number
}

// Leaderboard types
export interface LeaderboardEntry {
  rank: number
  userId: string
  username: string
  displayName: string
  avatarUrl?: string
  totalScore: number
  correctAnswers: number
  totalTimeMs: number
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

// Game state types
export type GamePhase =
  | 'idle'
  | 'tier_intro'
  | 'playing'
  | 'result'
  | 'bonus_round'
  | 'tier_complete'
  | 'challenge_complete'

export interface GuessResult {
  position: number
  isCorrect: boolean
  correctGame: Game
  userGuess: string | null
  timeTakenMs: number
  scoreEarned: number
}

// API Response types
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

export interface TodayChallengeResponse {
  challengeId: number
  date: string
  tiers: {
    tierNumber: number
    name: string
    screenshotCount: number
  }[]
  hasPlayed: boolean
  userSession?: {
    sessionId: string
    currentTier: number
    currentPosition: number
    isCompleted: boolean
    totalScore: number
  }
}

export interface ScreenshotResponse {
  position: number
  imageUrl: string
  timeLimit: number
}

export interface GuessRequest {
  sessionId: string
  position: number
  gameId: number | null
  guessText: string
  timeTakenMs: number
  powerUpUsed?: PowerUpType
}

export interface GuessResponse {
  isCorrect: boolean
  correctGame: Game
  scoreEarned: number
  totalScore: number
  nextPosition: number | null
  isCompleted: boolean
  isTierCompleted: boolean
}
