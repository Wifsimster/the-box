export type BrandLang = 'fr' | 'en'

export const SITE_NAME = 'The Box'

export const SITE_TAGLINE: Record<BrandLang, string> = {
  fr: 'Une capture. Un jeu à deviner.',
  en: 'One screenshot. One guess.',
}

export const SITE_CATEGORY: Record<BrandLang, string> = {
  fr: 'The Box — le jeu quotidien du screenshot',
  en: 'The Box — the daily video-game screenshot game',
}

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
  selectedTheme: string
  country?: CountryCode
}

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
  recentSessions: Array<{
    challengeDate: string
    totalScore: number
    completedAt: string | null
  }>
}

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

export interface Screenshot {
  id: number
  gameId: number
  imageUrl: string
  thumbnailUrl?: string
  difficulty: 1 | 2 | 3
  locationHint?: string
}

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

export type PowerUpType =
  | 'x2_timer'
  | 'hint'
  /** @deprecated Retired 2026-06 (legacy metadata hints) — appears on historical `guesses.power_up_used` values only, never on new guesses. */
  | 'hint_year'
  /** @deprecated Retired 2026-06 (legacy metadata hints) — historical values only. */
  | 'hint_publisher'
  /** @deprecated Retired 2026-06 (legacy metadata hints) — historical values only. */
  | 'hint_developer'
  /** @deprecated Retired 2026-06 (legacy metadata hints) — historical values only. */
  | 'hint_genre'
  | 'hint_letter'

export interface PowerUp {
  id: number
  tierSessionId: string
  powerUpType: PowerUpType
  isUsed: boolean
  earnedAtRound: number
  usedAtRound?: number
}

export interface LeaderboardEntry {
  rank: number
  userId: string
  username: string
  displayName: string
  avatarUrl?: string
  totalScore: number
  correctAnswers?: number
  totalTimeMs?: number
  avgCaptureTimeMs?: number
  completedAt?: string
  sessionId?: string
}

export interface LiveEvent {
  id: number
  dailyChallengeId: number
  name: string
  scheduledAt: string
  durationMinutes: number
  isActive: boolean
}

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

export type GamePhase =
  | 'idle'
  | 'daily_intro'
  | 'playing'
  | 'result'
  | 'bonus_round'
  | 'challenge_complete'

export interface GuessAttempt {
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
  letterPenalty?: number
  wrongGuessPenalty?: number
  streakBonus?: number
  streak?: number
  matchPrecision?: 'exact' | 'partial'
  screenshot?: Screenshot
  attempts?: GuessAttempt[]
}

export type PositionStatus = 'not_visited' | 'in_progress' | 'skipped' | 'correct' | 'timed_out'

export interface PositionState {
  position: number
  status: PositionStatus
  isCorrect: boolean
  screenshotData?: ScreenshotResponse
  hasIncorrectGuess?: boolean
  secondChanceActivated?: boolean
  letterReveal?: LetterRevealState
  timeSpentMs?: number
  proximityHint?: GuessProximityHint
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: ApiError
}

export interface ApiError {
  code: string
  message: string
}

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
    correctPositions: number[]
    screenshotsFound: number
    sessionStartedAt: string
    isCatchUp?: boolean
  } | null
  yesterdayChallenge?: {
    challengeId: number
    date: string
    hasPlayed: boolean
    isCompleted?: boolean
    sessionId?: string | null
  } | null
}

export interface StartChallengeResponse {
  sessionId: string
  tierSessionId: string
  totalScreenshots: number
  sessionStartedAt: string
}

export type StartTierResponse = StartChallengeResponse

export interface ScreenshotResponse {
  screenshotId: number
  position: number
  imageUrl: string
  timeLimitSeconds: number
  letterReveal?: LetterRevealState
}

export interface LetterRevealState {
  maskedTitle: string
  lettersRevealed: number
  maxLetters: number
  penaltyPct: number
  nextPenaltyPct: number | null
}

export interface RevealLetterResponse extends LetterRevealState {
  fromInventory: boolean
}

export interface GuessRequest {
  tierSessionId: string
  screenshotId: number
  position: number
  gameId: number | null
  guessText: string
  roundTimeTakenMs: number
}

export type GuessProximityRelation =
  | 'same_franchise'
  | 'same_developer'
  | 'same_publisher'

export interface GuessProximityHint {
  relation: GuessProximityRelation
  value: string
}

export interface DescribeGuessAdminEntry {
  id: number
  createdAt: string
  guessText: string
  description: string
  locale: string
  isGuest: boolean
  targetGameId: number
  targetName: string | null
  chosenGameId: number | null
  chosenName: string | null
  probability: number | null
  accepted: boolean | null
  titlePrefilterHit: boolean
  model: string
  latencyMs: number | null
  error: string | null
}

export interface DescribeGuessAdminPage {
  entries: DescribeGuessAdminEntry[]
  total: number
  page: number
  limit: number
}

export interface GuessResponse {
  isCorrect: boolean
  correctGame?: Game
  proximityHint?: GuessProximityHint
  scoreEarned: number
  totalScore: number
  screenshotsFound: number
  nextPosition: number | null
  isCompleted: boolean
  completionReason?: 'all_found' | 'forfeit'
  letterPenalty?: number
  wrongGuessPenalty?: number
  secondChanceFloorBoost?: number
  streakBonus?: number
  streak?: number
  matchPrecision?: 'exact' | 'partial'
  newlyEarnedAchievements?: NewlyEarnedAchievement[]
}

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

export interface GameSearchResult {
  id: number
  name: string
  releaseYear?: number
  coverImageUrl?: string
}

export interface LeaderboardResponse {
  date: string
  challengeId?: number
  entries: LeaderboardEntry[]
  guestPlayers?: number
}

export interface PercentileResponse {
  percentile: number
  totalPlayers: number
  rank: number
}

export interface SessionStandingResponse extends PercentileResponse {
  sessionId: string
  totalScore: number
  ranked: boolean
}

export interface MonthlyLeaderboardEntry {
  rank: number
  userId: string
  username: string
  displayName: string
  avatarUrl?: string
  totalScore: number
  gamesPlayed: number
  correctAnswers?: number
  avgCaptureTimeMs?: number
}

export interface MonthlyLeaderboardResponse {
  year: number
  month: number
  entries: MonthlyLeaderboardEntry[]
}

export const COUNTRY_CODES = [
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
  'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS',
  'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN',
  'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE',
  'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF',
  'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM',
  'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM',
  'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC',
  'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK',
  'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA',
  'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG',
  'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW',
  'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS',
  'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO',
  'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI',
  'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA', 'ZM', 'ZW',
] as const

export type CountryCode = (typeof COUNTRY_CODES)[number]

const COUNTRY_CODE_SET: ReadonlySet<string> = new Set(COUNTRY_CODES)

export function isCountryCode(value: unknown): value is CountryCode {
  return typeof value === 'string' && COUNTRY_CODE_SET.has(value)
}

export interface CountryLeaderboardEntry {
  rank: number
  countryCode: CountryCode
  averageScore: number
  playerCount: number
}

export interface CountryLeaderboardResponse {
  year: number
  month: number
  minPlayers: number
  entries: CountryLeaderboardEntry[]
  viewer?: {
    countryCode: CountryCode | null
    playerCount: number
  }
}

export interface GameHistoryEntry {
  sessionId: string
  challengeDate: string
  totalScore: number
  isCompleted: boolean
  completedAt: string | null
  roundsCorrect: number
  totalScreenshots: number
}

export interface MissedChallenge {
  challengeId: number
  date: string
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
  isPersonalBest: boolean
  guesses: Array<{
    position: number
    isCorrect: boolean
    correctGame: Game
    userGuess: string | null
    timeTakenMs: number
    scoreEarned: number
    hintPenalty?: number
    letterPenalty?: number
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

export type JobType = 'import-games' | 'import-screenshots' | 'sync-new-games' | 'batch-import-games' | 'create-daily-challenge' | 'sync-all-games' | 'cleanup-anonymous-users' | 'recalculate-scores' | 'clear-daily-data' | 'refresh-game-aliases'
export type JobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed'

export type ImportStatus = 'pending' | 'in_progress' | 'paused' | 'completed' | 'failed'

export interface ImportState {
  id: number
  importType: string
  status: ImportStatus

  batchSize: number
  minMetacritic: number
  screenshotsPerGame: number

  totalGamesAvailable: number | null
  currentPage: number
  lastProcessedOffset: number
  gamesProcessed: number
  gamesImported: number
  gamesSkipped: number
  screenshotsDownloaded: number
  failedCount: number

  currentBatch: number
  totalBatchesEstimated: number | null

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
  nextRunAt?: string
}

export interface JobData {
  targetGames?: number
  screenshotsPerGame?: number
  minMetacritic?: number
  maxGames?: number
  batchSize?: number
  importStateId?: number
  isResume?: boolean
  syncStateId?: number
  updateExistingMetadata?: boolean
  recalculateStateId?: number
  dryRun?: boolean
  startDate?: string
  endDate?: string
  offset?: number
}

export interface JobResult {
  gamesProcessed?: number
  screenshotsProcessed?: number
  failedCount?: number
  message?: string
  newGames?: number
  skipped?: number
  batchNumber?: number
  totalBatches?: number
  importStateId?: number
  totalGamesAvailable?: number
  isComplete?: boolean
  nextBatchScheduled?: boolean
  gamesImported?: number
  gamesSkipped?: number
  gamesUpdated?: number
  syncStateId?: number
  usersDeleted?: number
  sessionsProcessed?: number
  sessionsUpdated?: number
  sessionsSkipped?: number
  totalScoreChanges?: number
  recalculateStateId?: number
  dryRun?: boolean
  sessionsDeleted?: number
  challengeId?: number
  challengeDate?: string
  aliasesAdded?: number
}

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

export type RewardRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

export interface DailyReward {
  id: number
  dayNumber: number
  rewardType: 'powerup' | 'points' | 'legendary'
  rarity?: RewardRarity
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

export type RewardSource =
  | 'reactivation'
  | 'milestone'
  | 'streak_freeze'
  | 'leaderboard_payout'
  | 'cosmetic_unlock'
  | 'powerup_drop'
  | 'daily_login'

export interface RewardGrantItem {
  itemType: string
  itemKey: string
  quantity: number
}

export interface RewardGrantPayload {
  items: RewardGrantItem[]
}

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

export interface RewardGrantedEvent {
  rewardId: string
  source: RewardSource
  sourceRef: string
  items: RewardGrantItem[]
  grantedAt: string
  unlockedAt: string | null
}

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

export type GeoMapKind = 'image' | 'tiles'

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
  tiles?: GeoMapTilesConfig
  consensusRadius: number
  license: string
  attribution?: string
  region?: string
  wikiMapName?: string
  wikiRevisionId?: number
  zoneName?: string
  zoneSlug?: string
  provider?: string
  isSelected?: boolean
  /** @deprecated Kept for one release; mirrors `isSelected`. */
  isCaptureDefault?: boolean
}

export type GeoSourceKind = 'map' | 'candidates'

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
  promotedVia: 'consensus' | 'admin' | 'agent_override'
}

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

export interface GeoGameNeedingContent {
  gameId: number
  gameName: string | null
  candidateCount: number
  topPinCount: number
  pinsToNextThreshold: number
  bestCandidateId: number | null
}

export interface GeoCatalogGame {
  gameId: number
  gameName: string | null
  captureCount: number
  mapCount: number
  canonicalPinCount: number
  eligible: boolean
  starved: boolean
}

export interface GeoGamersHealthSnapshot {
  enabled: boolean
  minRequired: number
  cooldownDays: number
  eligibleGames: number
  eligibleScreenshots: number
  gamesOnCooldown: number
  starved: boolean
  todayChallengeExists: boolean
  currentChallengeDate: string | null
  season: { month: string; players: number }
}

export interface GeoChallenge {
  id: number
  challengeDate: string
  geoScreenshotMetaId: number
  tier: number
}

export interface GeoChallengeWithStatus extends GeoChallenge {
  hasGuessed: boolean
}

export interface GeoGuessInput {
  geoChallengeId: number
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
  averageScore?: number
  playerCount?: number
  correctMapId?: number
  wrongMap?: boolean
}

export interface GeoPlayableGame {
  id: number
  name: string
  coverImageUrl: string | null
  mapCount: number
  screenshotCount: number
  realWorldSetting: boolean
}

export interface GeoTodayStats {
  totalPinsToday: number
}

export interface GeoFreePlayView {
  game: { id: number; name: string }
  meta: Pick<GeoScreenshotMeta, 'id'>
  candidate: GeoScreenshotCandidate
  maps: GeoMap[]
  map?: GeoMap
}

export interface GeoFreePlayResult {
  guess: GeoPoint
  canonical: GeoPoint
  distance: number
  score: number
  scoreVersion: number
  correctMapId: number
  wrongMap: boolean
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
  confidence?: GeoPinConfidence
}

export type GeoPinConfidence = 1 | 2 | 3

export type GeoPinStatus = 'pending' | 'accepted' | 'rejected'

export type GeoPinSource = 'human' | 'agent_structured' | 'agent_vision'

export interface GeoPinSubmission {
  id: number
  userId: string | null
  geoScreenshotCandidateId: number
  pin: GeoPoint
  status: GeoPinStatus
  confidence?: GeoPinConfidence
  isAnonymous: boolean
  source: GeoPinSource
  agentRationale?: string
  agentModel?: string
  visionPass?: number
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

export interface UserPremiumGrantedEvent {
  userId: string
  tier: 'supporter_lifetime'
  grantedAt: string
}

export interface AchievementUnlockedEvent {
  userId: string
  achievements: NewlyEarnedAchievement[]
  unlockedAt: string
}

export type ScreenshotReportReason =
  | 'wrong_game'
  | 'low_quality'
  | 'not_recognizable'
  | 'inappropriate'
  | 'too_easy'
  | 'other'

export type BillingTier = 'premium_monthly' | 'premium_annual' | 'supporter_lifetime'

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'
  | 'paused'

export interface BillingPrice {
  tier: BillingTier
  unitAmount: number
  currency: string
  interval: 'month' | 'year' | null
  active: boolean
}

export interface BillingEntitlement {
  isPremium: boolean
  tier: BillingTier | null
  validUntil: string | null
  cancelAtPeriodEnd: boolean
  source: 'subscription' | 'supporter' | null
}

export interface AdvancedStats {
  bestScore: number
  averageScore: number
  totalCompletedSessions: number
  perfectSessions: number

  solveTimeMs: {
    p25: number
    median: number
    p75: number
    mean: number
  }

  hintUsage: {
    hintLetter: number
    legacyMetadataHints: number
  }

  monthlyScores: Array<{
    month: string
    totalScore: number
    sessionCount: number
  }>

  streaks: {
    current: number
    longest: number
  }
}

export interface PushPayload {
  type: string
  title: string
  body: string
  url?: string
  data?: Record<string, unknown>
}

export interface PushSubscribeRequest {
  endpoint: string
  keys: { p256dh: string; auth: string }
  userAgent?: string
}

export interface PushUnsubscribeRequest {
  endpoint: string
}

export interface PushSubscribeResponse {
  id: number
  isActive: boolean
}

export interface PushSubscriptionSummary {
  id: number
  userAgent: string | null
  createdAt: string
  lastSuccessAt: string | null
  isActive: boolean
}

export type ApiKeyScope =
  | 'read:public'
  | 'read:self'
  | 'stream:self'
  | 'webhooks:self'
  | 'geo-agent:read'
  | 'geo-agent:ingest'
  | 'geo-agent:propose'
  | 'geo-agent:curate'
  | 'geo-agent:promote'
  | 'geo-agent:promote-override'
  | 'admin:settings'

export const GEO_AGENT_SCOPES = [
  'geo-agent:read',
  'geo-agent:ingest',
  'geo-agent:propose',
  'geo-agent:curate',
  'geo-agent:promote',
  'geo-agent:promote-override',
] as const satisfies readonly ApiKeyScope[]

export function isGeoAgentScope(scope: ApiKeyScope): boolean {
  return scope.startsWith('geo-agent:')
}

export const ADMIN_AGENT_SCOPES = ['admin:settings'] as const satisfies readonly ApiKeyScope[]

export const AGENT_KEY_SCOPES = [
  ...GEO_AGENT_SCOPES,
  ...ADMIN_AGENT_SCOPES,
] as const satisfies readonly ApiKeyScope[]

export function isAgentScope(scope: ApiKeyScope): boolean {
  return scope.startsWith('geo-agent:') || scope.startsWith('admin:')
}

export type AppSettingType = 'boolean' | 'string' | 'number' | 'secret'

export interface AppSettingView {
  key: string
  type: AppSettingType
  group: string
  value: boolean | string | number | null
  defaultValue: boolean | string | number | null
  isSet: boolean
  secret?: { set: boolean; mask: string | null }
  constraints?: { min?: number; max?: number; pattern?: string; maxLength?: number }
  updatedAt: string | null
  updatedBy: string | null
}

export type ApiKeyMode = 'live' | 'test'

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

export interface ApiKeyCreated extends ApiKeySummary {
  plaintext: string
}

export interface PublicChallengeToday {
  date: string
  totalScreenshots: number
  scoringConfig: {
    initialScore: number
    decayRate: number
  }
}

export interface PublicStreamerProfile {
  slug: string
  displayName: string
  avatarUrl: string | null
  currentStreak: number
  longestStreak: number
  totalScore: number
  gamesPlayed: number
  today: {
    score: number
    rank: number | null
    completed: boolean
  } | null
}

export interface PublicStreamerToday {
  slug: string
  status: 'not_started' | 'in_progress' | 'completed'
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

export interface PublicLeaderboardEntry {
  rank: number
  slug: string | null
  displayName: string
  avatarUrl: string | null
  totalScore: number
  completedAt?: string
  gamesPlayed?: number
}

export type PublicEventType =
  | 'session.started'
  | 'session.completed'
  | 'screenshot.scored'
  | 'rank.changed'

export interface WebhookSummary {
  id: number
  url: string
  label: string
  secretPrefix: string
  events: PublicEventType[]
  isActive: boolean
  createdAt: string
  lastDeliveredAt: string | null
}

export interface WebhookCreated extends WebhookSummary {
  secret: string
}

export interface WebhookPayload<T = unknown> {
  eventId: string
  event: PublicEventType
  occurredAt: string
  slug: string
  data: T
}

export interface SessionCompletedEvent {
  score: number
  screenshotsFound: number
  totalScreenshots: number
  rank: number | null
  challengeDate: string
  countsForLeaderboard: boolean
}

export interface SessionStartedEvent {
  sessionId: string
  challengeDate: string
  countsForLeaderboard: boolean
}

export interface RankChangedEvent {
  rank: number
  challengeDate: string
}

export type SseEventName = PublicEventType | 'heartbeat' | 'connected'

export type GeoGamersRunPhase = 'identify' | 'locate' | 'done'

export interface GeoGamersChallenge {
  id: number
  challengeDate: string
}

export interface GeoGamersGameAttempt {
  guess: string
  normalized: string
  correct: boolean
  at: string
}

export interface GeoGamersRunView {
  runToken: string
  challengeDate: string
  phase: GeoGamersRunPhase
  screenshotUrl: string
  attemptsUsed: number
  attemptsMax: number
  timeLimitSeconds: number
  timeSpentMs: number
  jokerAvailable: boolean
  game?: { id: number; name: string }
  maps?: GeoMapOption[]
  gamePoints?: number
}

export interface GeoGamersGuessGameResult {
  correct: boolean
  attemptsUsed: number
  attemptsRemaining: number
  gamePoints?: number
  proximity?: 'far' | 'close' | 'very_close'
  run: GeoGamersRunView
}

export interface GeoGamersGuessLocationResult {
  guess: GeoPoint
  canonical: GeoPoint
  distance: number
  locationPoints: number
  gamePoints: number
  totalPoints: number
  scoreVersion: number
  ghostRank?: number
  rank?: number
}

export interface GeoGamersClaimResult {
  claimed: boolean
  challengeDate: string
  totalPoints: number
}

export interface GeoGamersSeasonStanding {
  userId: string
  username: string
  daysPlayed: number
  jokerUsed: boolean
  rawTotal: number
  seasonScore: number
  droppedDays: number
  provisional: boolean
  rank: number
}

export interface GeoGamersSeasonMe extends GeoGamersSeasonStanding {
  dailyBreakdown: Array<{
    date: string
    gamePoints: number
    locationPoints: number
    total: number
    dropped: boolean
    jokerUsed: boolean
  }>
}

export interface GeoGamersRunCompletedEvent {
  userId: string
  challengeDate: string
  totalPoints: number
}

export interface GeoGamersSeasonUpdatedEvent {
  month: string
  topN: GeoGamersSeasonStanding[]
}

export type GeoGamersPartyStatus = 'lobby' | 'in_round' | 'reveal' | 'finished'

export interface GeoGamersPartyPlayer {
  id: string
  name: string
  isHost: boolean
  connected: boolean
}

export interface GeoGamersPartyConfig {
  rounds: number
  timerSeconds: number
}

export interface GeoGamersPartyRoundResult {
  playerId: string
  attemptsUsed: number
  gamePoints: number | null
  solvedGame: boolean
  guess: GeoPoint | null
  locationPoints: number | null
  totalPoints: number | null
  done: boolean
}

export interface GeoGamersPartyRound {
  index: number
  geoScreenshotMetaId: number
  gameId: number
  gameName: string
  geoMapId: number
  canonical: GeoPoint
  results: Record<string, GeoGamersPartyRoundResult>
  revealed: boolean
}

export interface GeoGamersParty {
  code: string
  status: GeoGamersPartyStatus
  config: GeoGamersPartyConfig
  hostId: string
  players: GeoGamersPartyPlayer[]
  currentRound: number
  rounds: GeoGamersPartyRound[]
  createdAtMs: number
}

export interface GeoGamersPartyView {
  code: string
  status: GeoGamersPartyStatus
  config: GeoGamersPartyConfig
  hostId: string
  players: GeoGamersPartyPlayer[]
  currentRound: number
  totalRounds: number
  maxPlayers: number
  round?: {
    index: number
    screenshotUrl: string
    maps?: GeoMapOption[]
    gameName?: string
  }
  you?: {
    attemptsUsed: number
    attemptsLeft: number
    resolvedPhase1: boolean
    done: boolean
  }
  scoreboard: Array<{ playerId: string; name: string; total: number }>
  reveal?: {
    index: number
    gameName: string
    canonical: GeoPoint
    pins: Array<{ playerId: string; name: string; guess: GeoPoint | null; points: number }>
  }
}

export interface GeoGamersPartyCreatedEvent {
  code: string
}

export interface GeoGamersPartyIdentityEvent {
  playerId: string
}

