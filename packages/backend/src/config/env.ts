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
  EMAIL_FROM: process.env['EMAIL_FROM'] || 'noreply@thebox.local',

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
