import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  date,
  decimal,
  text,
  serial,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// Users table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 50 }).unique().notNull(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 100 }),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  isGuest: boolean('is_guest').default(false).notNull(),
  isAdmin: boolean('is_admin').default(false).notNull(),
  totalScore: integer('total_score').default(0).notNull(),
  currentStreak: integer('current_streak').default(0).notNull(),
  longestStreak: integer('longest_streak').default(0).notNull(),
  lastPlayedAt: timestamp('last_played_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Video game catalog
export const games = pgTable('games', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).unique().notNull(),
  aliases: text('aliases').array(),
  releaseYear: integer('release_year'),
  developer: varchar('developer', { length: 255 }),
  publisher: varchar('publisher', { length: 255 }),
  genres: text('genres').array(),
  platforms: text('platforms').array(),
  coverImageUrl: varchar('cover_image_url', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  nameIdx: index('games_name_idx').on(table.name),
}))

// Screenshot library
export const screenshots = pgTable('screenshots', {
  id: serial('id').primaryKey(),
  gameId: integer('game_id').references(() => games.id, { onDelete: 'cascade' }).notNull(),
  imageUrl: varchar('image_url', { length: 500 }).notNull(),
  thumbnailUrl: varchar('thumbnail_url', { length: 500 }),
  haov: integer('haov').default(180).notNull(), // Horizontal angle of view
  vaov: integer('vaov').default(90).notNull(), // Vertical angle of view
  difficulty: integer('difficulty').default(2).notNull(), // 1=easy, 2=medium, 3=hard
  locationHint: varchar('location_hint', { length: 255 }),
  isActive: boolean('is_active').default(true).notNull(),
  timesUsed: integer('times_used').default(0).notNull(),
  correctGuesses: integer('correct_guesses').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// Daily challenges
export const dailyChallenges = pgTable('daily_challenges', {
  id: serial('id').primaryKey(),
  challengeDate: date('challenge_date').unique().notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// Tiers within daily challenges
export const tiers = pgTable('tiers', {
  id: serial('id').primaryKey(),
  dailyChallengeId: integer('daily_challenge_id').references(() => dailyChallenges.id, { onDelete: 'cascade' }).notNull(),
  tierNumber: integer('tier_number').notNull(),
  name: varchar('name', { length: 50 }).notNull(),
  timeLimitSeconds: integer('time_limit_seconds').default(30).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueTier: uniqueIndex('unique_tier').on(table.dailyChallengeId, table.tierNumber),
}))

// Screenshots assigned to tiers (18 per tier)
export const tierScreenshots = pgTable('tier_screenshots', {
  id: serial('id').primaryKey(),
  tierId: integer('tier_id').references(() => tiers.id, { onDelete: 'cascade' }).notNull(),
  screenshotId: integer('screenshot_id').references(() => screenshots.id, { onDelete: 'cascade' }).notNull(),
  position: integer('position').notNull(), // 1-18
  bonusMultiplier: decimal('bonus_multiplier', { precision: 3, scale: 2 }).default('1.0').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniquePosition: uniqueIndex('unique_tier_position').on(table.tierId, table.position),
}))

// User game sessions (one per user per daily challenge)
export const gameSessions = pgTable('game_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  dailyChallengeId: integer('daily_challenge_id').references(() => dailyChallenges.id, { onDelete: 'cascade' }).notNull(),
  currentTier: integer('current_tier').default(1).notNull(),
  currentPosition: integer('current_position').default(1).notNull(),
  totalScore: integer('total_score').default(0).notNull(),
  isCompleted: boolean('is_completed').default(false).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => ({
  uniqueSession: uniqueIndex('unique_user_challenge').on(table.userId, table.dailyChallengeId),
}))

// Individual tier sessions
export const tierSessions = pgTable('tier_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameSessionId: uuid('game_session_id').references(() => gameSessions.id, { onDelete: 'cascade' }).notNull(),
  tierId: integer('tier_id').references(() => tiers.id, { onDelete: 'cascade' }).notNull(),
  score: integer('score').default(0).notNull(),
  correctAnswers: integer('correct_answers').default(0).notNull(),
  isCompleted: boolean('is_completed').default(false).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
})

// Individual guesses
export const guesses = pgTable('guesses', {
  id: serial('id').primaryKey(),
  tierSessionId: uuid('tier_session_id').references(() => tierSessions.id, { onDelete: 'cascade' }).notNull(),
  screenshotId: integer('screenshot_id').references(() => screenshots.id).notNull(),
  position: integer('position').notNull(),
  guessedGameId: integer('guessed_game_id').references(() => games.id),
  guessedText: varchar('guessed_text', { length: 255 }),
  isCorrect: boolean('is_correct').notNull(),
  timeTakenMs: integer('time_taken_ms').notNull(),
  scoreEarned: integer('score_earned').default(0).notNull(),
  powerUpUsed: varchar('power_up_used', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// Power-ups inventory per session
export const powerUps = pgTable('power_ups', {
  id: serial('id').primaryKey(),
  tierSessionId: uuid('tier_session_id').references(() => tierSessions.id, { onDelete: 'cascade' }).notNull(),
  powerUpType: varchar('power_up_type', { length: 50 }).notNull(), // 'x2_timer', 'hint'
  isUsed: boolean('is_used').default(false).notNull(),
  earnedAtRound: integer('earned_at_round'),
  usedAtRound: integer('used_at_round'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// Bonus round results
export const bonusRounds = pgTable('bonus_rounds', {
  id: serial('id').primaryKey(),
  tierSessionId: uuid('tier_session_id').references(() => tierSessions.id, { onDelete: 'cascade' }).notNull(),
  afterPosition: integer('after_position').notNull(), // After which round (5, 10, 15)
  powerUpWon: varchar('power_up_won', { length: 50 }),
  timeTakenMs: integer('time_taken_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// Live events (scheduled multiplayer sessions)
export const liveEvents = pgTable('live_events', {
  id: serial('id').primaryKey(),
  dailyChallengeId: integer('daily_challenge_id').references(() => dailyChallenges.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  durationMinutes: integer('duration_minutes').default(60).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// Players in live events
export const liveEventParticipants = pgTable('live_event_participants', {
  id: serial('id').primaryKey(),
  liveEventId: integer('live_event_id').references(() => liveEvents.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  gameSessionId: uuid('game_session_id').references(() => gameSessions.id, { onDelete: 'cascade' }),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueParticipant: uniqueIndex('unique_event_participant').on(table.liveEventId, table.userId),
}))

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  gameSessions: many(gameSessions),
  liveEventParticipants: many(liveEventParticipants),
}))

export const gamesRelations = relations(games, ({ many }) => ({
  screenshots: many(screenshots),
  guesses: many(guesses),
}))

export const screenshotsRelations = relations(screenshots, ({ one, many }) => ({
  game: one(games, {
    fields: [screenshots.gameId],
    references: [games.id],
  }),
  tierScreenshots: many(tierScreenshots),
  guesses: many(guesses),
}))

export const dailyChallengesRelations = relations(dailyChallenges, ({ many }) => ({
  tiers: many(tiers),
  gameSessions: many(gameSessions),
  liveEvents: many(liveEvents),
}))

export const tiersRelations = relations(tiers, ({ one, many }) => ({
  dailyChallenge: one(dailyChallenges, {
    fields: [tiers.dailyChallengeId],
    references: [dailyChallenges.id],
  }),
  tierScreenshots: many(tierScreenshots),
  tierSessions: many(tierSessions),
}))

export const tierScreenshotsRelations = relations(tierScreenshots, ({ one }) => ({
  tier: one(tiers, {
    fields: [tierScreenshots.tierId],
    references: [tiers.id],
  }),
  screenshot: one(screenshots, {
    fields: [tierScreenshots.screenshotId],
    references: [screenshots.id],
  }),
}))

export const gameSessionsRelations = relations(gameSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [gameSessions.userId],
    references: [users.id],
  }),
  dailyChallenge: one(dailyChallenges, {
    fields: [gameSessions.dailyChallengeId],
    references: [dailyChallenges.id],
  }),
  tierSessions: many(tierSessions),
}))

export const tierSessionsRelations = relations(tierSessions, ({ one, many }) => ({
  gameSession: one(gameSessions, {
    fields: [tierSessions.gameSessionId],
    references: [gameSessions.id],
  }),
  tier: one(tiers, {
    fields: [tierSessions.tierId],
    references: [tiers.id],
  }),
  guesses: many(guesses),
  powerUps: many(powerUps),
  bonusRounds: many(bonusRounds),
}))

export const guessesRelations = relations(guesses, ({ one }) => ({
  tierSession: one(tierSessions, {
    fields: [guesses.tierSessionId],
    references: [tierSessions.id],
  }),
  screenshot: one(screenshots, {
    fields: [guesses.screenshotId],
    references: [screenshots.id],
  }),
  guessedGame: one(games, {
    fields: [guesses.guessedGameId],
    references: [games.id],
  }),
}))
