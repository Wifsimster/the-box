import dotenv from 'dotenv'

dotenv.config()

export const env = {
  NODE_ENV: process.env['NODE_ENV'] || 'development',
  PORT: parseInt(process.env['PORT'] || '3000', 10),
  LOG_LEVEL: process.env['LOG_LEVEL'] || 'info',
  DATABASE_URL: process.env['DATABASE_URL'] || 'postgresql://thebox:thebox_secret@localhost:5432/thebox',
  CORS_ORIGIN: process.env['CORS_ORIGIN'] || 'http://localhost:5173',

  // Better Auth
  BETTER_AUTH_SECRET: process.env['BETTER_AUTH_SECRET'] || 'dev-secret-change-in-production-min-32-chars',
  API_URL: process.env['API_URL'] || 'http://localhost:3000',

  // Resend (Email)
  RESEND_API_KEY: process.env['RESEND_API_KEY'] || '',
  EMAIL_FROM: process.env['EMAIL_FROM'] || 'no-reply@the-box.battistella.ovh',

  // Relance (re-engagement) email — kill switch + cron override.
  // Defaults to 17:00 UTC daily, two hours before the streak-risk job.
  RELANCE_EMAIL_ENABLED: process.env['RELANCE_EMAIL_ENABLED'] || 'true',
  RELANCE_EMAIL_CRON: process.env['RELANCE_EMAIL_CRON'] || '0 17 * * *',

  // Long-horizon win-back email for users inactive (no play, no session
  // refresh) for N days. Runs weekly to avoid piling reminders onto
  // already-gone users; per-user cooldown inside the worker is 30 days.
  INACTIVE_USER_REMINDER_ENABLED: process.env['INACTIVE_USER_REMINDER_ENABLED'] || 'true',
  INACTIVE_USER_REMINDER_CRON: process.env['INACTIVE_USER_REMINDER_CRON'] || '0 16 * * 1',
  INACTIVE_USER_REMINDER_DAYS: process.env['INACTIVE_USER_REMINDER_DAYS'] || '14',

  // Public-facing frontend URL (used in marketing email CTAs)
  FRONTEND_URL: process.env['FRONTEND_URL'] || 'https://the-box.battistella.ovh',

  // RAWG API (for fetching game screenshots)
  RAWG_API_KEY: process.env['RAWG_API_KEY'] || '',

  // Redis (for BullMQ job queue)
  REDIS_URL: process.env['REDIS_URL'] || 'redis://localhost:6379',
}

export function validateEnv(): void {
  const required = ['BETTER_AUTH_SECRET']

  if (env.NODE_ENV === 'production') {
    for (const key of required) {
      if (!process.env[key]) {
        throw new Error(`Missing required environment variable: ${key}`)
      }
    }

    if (env.BETTER_AUTH_SECRET.length < 32) {
      throw new Error('BETTER_AUTH_SECRET must be at least 32 characters')
    }
  }
}
