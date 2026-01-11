// Re-export all types from shared package
export type {
  // Domain Entities
  User,
  Game,
  Screenshot,
  DailyChallenge,
  Tier,
  TierScreenshot,
  GameSession,
  TierSession,
  Guess,
  PowerUpType,
  PowerUp,
  LeaderboardEntry,
  LiveEvent,

  // Game State
  GamePhase,
  GuessResult,

  // API Types
  ApiResponse,
  ApiError,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  TodayChallengeResponse,
  StartChallengeResponse,
  StartTierResponse,
  ScreenshotResponse,
  GuessRequest,
  GuessResponse,
  GameSearchResult,
  LeaderboardResponse,

  // Socket Events
  LiveScore,
  JoinChallengeEvent,
  ScoreUpdateEvent,
  PlayerFinishedEvent,
  PlayerJoinedEvent,
  PlayerLeftEvent,
} from '@the-box/types'
