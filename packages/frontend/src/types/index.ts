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
  ScoringConfig,
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

  // Job Management (Admin)
  JobType,
  JobStatus,
  Job,
  JobData,
  JobResult,
  JobProgressEvent,
  JobCompletedEvent,
  JobFailedEvent,
  CreateJobRequest,
  JobListResponse,
  RecurringJob,
} from '@the-box/types'
