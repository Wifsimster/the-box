import dotenv from 'dotenv'

dotenv.config()

export const env = {
  NODE_ENV: process.env['NODE_ENV'] || 'development',
  PORT: parseInt(process.env['PORT'] || '3000', 10),
  LOG_LEVEL: process.env['LOG_LEVEL'] || 'info',
  DATABASE_URL: process.env['DATABASE_URL'] || 'postgresql://thebox:thebox_secret@localhost:5432/thebox',
  DATABASE_SSL: process.env['DATABASE_SSL'] || 'false',
  CORS_ORIGIN: process.env['CORS_ORIGIN'] || 'http://localhost:5173',

  BETTER_AUTH_SECRET: process.env['BETTER_AUTH_SECRET'] || 'dev-secret-change-in-production-min-32-chars',
  API_URL: process.env['API_URL'] || 'http://localhost:3000',

  RESEND_API_KEY: process.env['RESEND_API_KEY'] || '',
  EMAIL_FROM: process.env['EMAIL_FROM'] || 'no-reply@the-box.battistella.ovh',

  RELANCE_EMAIL_ENABLED: process.env['RELANCE_EMAIL_ENABLED'] || 'true',
  RELANCE_EMAIL_CRON: process.env['RELANCE_EMAIL_CRON'] || '0 17 * * *',

  INACTIVE_USER_REMINDER_ENABLED: process.env['INACTIVE_USER_REMINDER_ENABLED'] || 'true',
  INACTIVE_USER_REMINDER_CRON: process.env['INACTIVE_USER_REMINDER_CRON'] || '0 16 * * 1',
  INACTIVE_USER_REMINDER_DAYS: process.env['INACTIVE_USER_REMINDER_DAYS'] || '14',

  FRONTEND_URL: process.env['FRONTEND_URL'] || 'https://the-box.battistella.ovh',

  GEO_COMMUNITY_ENABLED: process.env['GEO_COMMUNITY_ENABLED'] || 'false',

  GEOGAMERS_ENABLED: process.env['GEOGAMERS_ENABLED'] || 'false',
  GEOGAMERS_MIN_ELIGIBLE_GAMES: process.env['GEOGAMERS_MIN_ELIGIBLE_GAMES'] || '10',
  GEOGAMERS_GAME_COOLDOWN_DAYS: process.env['GEOGAMERS_GAME_COOLDOWN_DAYS'] || '14',

  GEO_AGENT_API_ENABLED: process.env['GEO_AGENT_API_ENABLED'] || 'false',
  GEO_AGENT_MAX_INGESTS_PER_DAY: process.env['GEO_AGENT_MAX_INGESTS_PER_DAY'] || '20',
  GEO_AGENT_MAX_PINS_PER_HOUR: process.env['GEO_AGENT_MAX_PINS_PER_HOUR'] || '60',
  GEO_BACKFILL_ENABLED: process.env['GEO_BACKFILL_ENABLED'] || 'false',
  GEO_BACKFILL_BATCH: process.env['GEO_BACKFILL_BATCH'] || '10',
  GEO_AGENT_VISION_ENABLED: process.env['GEO_AGENT_VISION_ENABLED'] || 'false',
  GEO_AGENT_CURATE_ENABLED: process.env['GEO_AGENT_CURATE_ENABLED'] || 'false',
  GEO_AGENT_MAX_ENROLLS_PER_DAY: process.env['GEO_AGENT_MAX_ENROLLS_PER_DAY'] || '5',
  GEO_AGENT_MAX_CAPTURE_IMPORTS_PER_DAY: process.env['GEO_AGENT_MAX_CAPTURE_IMPORTS_PER_DAY'] || '10',
  GEO_AGENT_MAX_MAP_ACTIONS_PER_DAY: process.env['GEO_AGENT_MAX_MAP_ACTIONS_PER_DAY'] || '30',
  GEO_AGENT_MAX_MAP_UPLOADS_PER_DAY: process.env['GEO_AGENT_MAX_MAP_UPLOADS_PER_DAY'] || '10',
  GEO_AGENT_PROMOTE_ENABLED: process.env['GEO_AGENT_PROMOTE_ENABLED'] || 'false',
  GEO_AGENT_MAX_PROMOTES_PER_DAY: process.env['GEO_AGENT_MAX_PROMOTES_PER_DAY'] || '20',
  GEO_AGENT_PROMOTE_OVERRIDE_ENABLED:
    process.env['GEO_AGENT_PROMOTE_OVERRIDE_ENABLED'] || 'false',
  GEO_AGENT_MAX_PROMOTE_OVERRIDES_PER_DAY:
    process.env['GEO_AGENT_MAX_PROMOTE_OVERRIDES_PER_DAY'] || '5',

  DESCRIBE_GUESS_JUDGE: process.env['DESCRIBE_GUESS_JUDGE'] || '',
  DESCRIBE_GUESS_STUB_DELAY_MS: parseInt(process.env['DESCRIBE_GUESS_STUB_DELAY_MS'] || '0', 10) || 0,

  RAWG_API_KEY: process.env['RAWG_API_KEY'] || '',

  REDIS_URL: process.env['REDIS_URL'] || 'redis://localhost:6379',

  STRIPE_SECRET_KEY: process.env['STRIPE_SECRET_KEY'] || '',
  STRIPE_WEBHOOK_SECRET: process.env['STRIPE_WEBHOOK_SECRET'] || '',
  STRIPE_CHECKOUT_SUCCESS_URL: process.env['STRIPE_CHECKOUT_SUCCESS_URL'] || 'http://localhost:5173/fr/premium?checkout=success',
  STRIPE_CHECKOUT_CANCEL_URL: process.env['STRIPE_CHECKOUT_CANCEL_URL'] || 'http://localhost:5173/fr/premium?checkout=cancel',
  STRIPE_PORTAL_RETURN_URL: process.env['STRIPE_PORTAL_RETURN_URL'] || 'http://localhost:5173/fr/profile',
  STRIPE_PORTAL_CONFIG_ID: process.env['STRIPE_PORTAL_CONFIG_ID'] || '',

  KOE_IDENTITY_SECRET: process.env['KOE_IDENTITY_SECRET'] || '',

  VAPID_PUBLIC_KEY: process.env['VAPID_PUBLIC_KEY'] || '',
  VAPID_PRIVATE_KEY: process.env['VAPID_PRIVATE_KEY'] || '',
  VAPID_SUBJECT: process.env['VAPID_SUBJECT'] || '',
}

const DEV_AUTH_SECRET = 'dev-secret-change-in-production-min-32-chars'

export function validateEnv(): void {
  if (env.NODE_ENV !== 'development') {
    if (!process.env['BETTER_AUTH_SECRET']) {
      throw new Error('Missing required environment variable: BETTER_AUTH_SECRET')
    }
    if (env.BETTER_AUTH_SECRET === DEV_AUTH_SECRET) {
      throw new Error('Refusing to start with the development BETTER_AUTH_SECRET')
    }
    if (env.BETTER_AUTH_SECRET.length < 32) {
      throw new Error('BETTER_AUTH_SECRET must be at least 32 characters')
    }
  }
}
