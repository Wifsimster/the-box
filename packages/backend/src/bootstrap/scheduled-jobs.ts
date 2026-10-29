import { env } from '../config/env.js'
import { logger } from '../infrastructure/logger/logger.js'
import { tryAcquireBootLock } from '../infrastructure/queue/connection.js'
import { geoQueue, importQueue } from '../infrastructure/queue/queues.js'

export async function registerScheduledJobs(): Promise<void> {
  const deprecatedJobs = [
    'sync-new-games',
    'create-weekly-tournament',
    'create-monthly-tournament',
    'end-weekly-tournament',
    'end-monthly-tournament',
    'send-tournament-reminders',
  ]
  const activeRecurringJobs = [
    'create-daily-challenge',
    'sync-all-games',
    'cleanup-anonymous-users',
    'recalculate-scores',
    'streak-risk-email',
    'evening-nudge',
    'relance-email',
    'inactive-user-reminder',
    'streak-freeze-grant',
    'reactivation-scan',
    'milestone-account-age',
    'leaderboard-payout-monthly',
    'prune-push-subscriptions',
  ]
  const hasRecurringRegistrar = await tryAcquireBootLock('recurring-jobs', 60)
  if (!hasRecurringRegistrar) {
    logger.info('another container holds the recurring-job lock; skipping re-registration')
  }
  if (hasRecurringRegistrar) {
    try {
      const repeatableJobs = await importQueue.getRepeatableJobs()
      for (const job of repeatableJobs) {
        if (deprecatedJobs.includes(job.name)) {
          await importQueue.removeRepeatableByKey(job.key)
          logger.info({ jobName: job.name }, 'removed deprecated recurring job')
        } else if (activeRecurringJobs.includes(job.name)) {
          await importQueue.removeRepeatableByKey(job.key)
          logger.debug({ jobName: job.name }, 'removed recurring job for re-registration')
        }
      }
    } catch (error) {
      logger.warn({ error: String(error) }, 'failed to clean up recurring jobs')
    }
  }
  if (hasRecurringRegistrar) {

  try {
    await importQueue.add(
      'create-daily-challenge',
      {},
      {
        repeat: { pattern: '0 0 * * *', tz: 'UTC' },
        jobId: 'create-daily-challenge-recurring',
      }
    )
    logger.info('scheduled recurring create-daily-challenge job (daily at midnight UTC)')
  } catch (error) {
    logger.warn({ error: String(error) }, 'failed to schedule recurring daily challenge job')
  }

  if (env.GEOGAMERS_ENABLED === 'true') {
    try {
      await importQueue.add(
        'create-geogamers-challenge',
        {},
        {
          repeat: { pattern: '5 0 * * *', tz: 'UTC' },
          jobId: 'create-geogamers-challenge-recurring',
        }
      )
      logger.info('scheduled recurring create-geogamers-challenge job (daily at 00:05 UTC)')
    } catch (error) {
      logger.warn({ error: String(error) }, 'failed to schedule recurring geogamers challenge job')
    }

    try {
      await importQueue.add(
        'geogamers-season-payout',
        {},
        {
          repeat: { pattern: '35 0 1 * *', tz: 'UTC' },
          jobId: 'geogamers-season-payout-recurring',
        }
      )
      logger.info('scheduled recurring geogamers-season-payout job (1st @ 00:35 UTC)')
    } catch (error) {
      logger.warn({ error: String(error) }, 'failed to schedule recurring geogamers season payout job')
    }
  }

  try {
    await importQueue.add(
      'sync-all-games',
      {
        batchSize: 100,
        minMetacritic: 70,
        screenshotsPerGame: 5,
        updateExistingMetadata: true,
      },
      {
        repeat: { pattern: '0 2 * * 0', tz: 'UTC' },
        jobId: 'sync-all-games-recurring',
      }
    )
    logger.info('scheduled recurring sync-all-games job (weekly on Sundays at 2 AM UTC)')
  } catch (error) {
    logger.warn({ error: String(error) }, 'failed to schedule recurring sync-all-games job')
  }

  try {
    await importQueue.add(
      'cleanup-anonymous-users',
      {},
      {
        repeat: { pattern: '0 1 * * *', tz: 'UTC' },
        jobId: 'cleanup-anonymous-users-recurring',
      }
    )
    logger.info('scheduled recurring cleanup-anonymous-users job (daily at 1 AM UTC)')
  } catch (error) {
    logger.warn({ error: String(error) }, 'failed to schedule recurring cleanup-anonymous-users job')
  }

  try {
    await importQueue.add(
      'recalculate-scores',
      { batchSize: 100, dryRun: false },
      {
        repeat: { pattern: '0 3 * * *', tz: 'UTC' },
        jobId: 'recalculate-scores-recurring',
      }
    )
    logger.info('scheduled recurring recalculate-scores job (daily at 3 AM UTC)')
  } catch (error) {
    logger.warn({ error: String(error) }, 'failed to schedule recurring recalculate-scores job')
  }

  try {
    await importQueue.add(
      'streak-risk-email',
      {},
      {
        repeat: { pattern: '0 19 * * *', tz: 'UTC' },
        jobId: 'streak-risk-email-recurring',
      }
    )
    logger.info('scheduled recurring streak-risk-email job (daily at 19:00 UTC)')
  } catch (error) {
    logger.warn({ error: String(error) }, 'failed to schedule recurring streak-risk-email job')
  }

  try {
    await importQueue.add(
      'evening-nudge',
      {},
      {
        repeat: { pattern: '0 18 * * *', tz: 'UTC' },
        jobId: 'evening-nudge-recurring',
      }
    )
    logger.info('scheduled recurring evening-nudge job (daily at 18:00 UTC)')
  } catch (error) {
    logger.warn({ error: String(error) }, 'failed to schedule recurring evening-nudge job')
  }

  try {
    await importQueue.add(
      'relance-email',
      {},
      {
        repeat: { pattern: env.RELANCE_EMAIL_CRON, tz: 'UTC' },
        jobId: 'relance-email-recurring',
      }
    )
    logger.info({ pattern: env.RELANCE_EMAIL_CRON }, 'scheduled recurring relance-email job')
  } catch (error) {
    logger.warn({ error: String(error) }, 'failed to schedule recurring relance-email job')
  }

  try {
    await importQueue.add(
      'inactive-user-reminder',
      {},
      {
        repeat: { pattern: env.INACTIVE_USER_REMINDER_CRON, tz: 'UTC' },
        jobId: 'inactive-user-reminder-recurring',
      }
    )
    logger.info(
      { pattern: env.INACTIVE_USER_REMINDER_CRON, days: env.INACTIVE_USER_REMINDER_DAYS },
      'scheduled recurring inactive-user-reminder job'
    )
  } catch (error) {
    logger.warn({ error: String(error) }, 'failed to schedule recurring inactive-user-reminder job')
  }

  try {
    await importQueue.add(
      'reactivation-scan',
      {},
      {
        repeat: { pattern: '0 3 * * *', tz: 'UTC' },
        jobId: 'reactivation-scan-recurring',
      }
    )
    logger.info('scheduled recurring reactivation-scan job (daily at 03:00 UTC)')
  } catch (error) {
    logger.warn({ error: String(error) }, 'failed to schedule recurring reactivation-scan job')
  }

  try {
    await importQueue.add(
      'streak-freeze-grant',
      {},
      {
        repeat: { pattern: '0 6 1 * *', tz: 'UTC' },
        jobId: 'streak-freeze-grant-recurring',
      }
    )
    logger.info('scheduled recurring streak-freeze-grant job (monthly, 1st @ 06:00 UTC)')
  } catch (error) {
    logger.warn({ error: String(error) }, 'failed to schedule recurring streak-freeze-grant job')
  }

  try {
    await importQueue.add(
      'milestone-account-age',
      {},
      {
        repeat: { pattern: '0 4 * * *', tz: 'UTC' },
        jobId: 'milestone-account-age-recurring',
      }
    )
    logger.info('scheduled recurring milestone-account-age job (daily at 04:00 UTC)')
  } catch (error) {
    logger.warn({ error: String(error) }, 'failed to schedule recurring milestone-account-age job')
  }

  try {
    await importQueue.add(
      'prune-push-subscriptions',
      {},
      {
        repeat: { pattern: '0 2 * * *', tz: 'UTC' },
        jobId: 'prune-push-subscriptions-recurring',
      },
    )
    logger.info('scheduled recurring prune-push-subscriptions job (daily at 02:00 UTC)')
  } catch (error) {
    logger.warn({ error: String(error) }, 'failed to schedule recurring prune-push-subscriptions job')
  }

  try {
    await importQueue.add(
      'data-retention',
      {},
      {
        repeat: { pattern: '15 4 * * *', tz: 'UTC' },
        jobId: 'data-retention-recurring',
      },
    )
    logger.info('scheduled recurring data-retention job (daily at 04:15 UTC)')
  } catch (error) {
    logger.warn({ error: String(error) }, 'failed to schedule recurring data-retention job')
  }

  try {
    await importQueue.add(
      'leaderboard-payout-monthly',
      {},
      {
        repeat: { pattern: '30 0 1 * *', tz: 'UTC' },
        jobId: 'leaderboard-payout-monthly-recurring',
      }
    )
    logger.info('scheduled recurring leaderboard-payout-monthly job (1st @ 00:30 UTC)')
  } catch (error) {
    logger.warn({ error: String(error) }, 'failed to schedule recurring leaderboard-payout-monthly job')
  }

  try {
    await importQueue.add(
      'referral-announcement-email',
      {},
      {
        jobId: 'referral-announcement-email-oneshot',
        removeOnComplete: true,
        removeOnFail: false,
      }
    )
    logger.info('enqueued one-shot referral-announcement-email job')
  } catch (error) {
    logger.warn({ error: String(error) }, 'failed to enqueue referral-announcement-email job')
  }

  try {
    const existing = await geoQueue.getRepeatableJobs()
    for (const job of existing) {
      if (
        job.name === 'schedule-daily-challenge' ||
        job.name === 'resolve-metadata' ||
        job.name === 'ingest-tick' ||
        job.name === 'backfill-tick'
      ) {
        await geoQueue.removeRepeatableByKey(job.key)
      }
    }

    await geoQueue.add(
      'resolve-metadata',
      { kind: 'resolve-metadata' },
      {
        repeat: { every: 30 * 60 * 1000 },
        jobId: 'geo-resolve-metadata-recurring',
      }
    )
    logger.info('scheduled recurring resolve-metadata geo job (every 30 min)')

    await geoQueue.add(
      'ingest-tick',
      { kind: 'ingest-tick' },
      {
        repeat: { every: 15 * 60 * 1000 },
        jobId: 'geo-ingest-tick-recurring',
      }
    )
    logger.info('scheduled recurring ingest-tick geo job (every 15 min)')

    if (env.GEO_BACKFILL_ENABLED === 'true') {
      const backfillBatch = Number(env.GEO_BACKFILL_BATCH) || 10
      await geoQueue.add(
        'backfill-tick',
        { kind: 'backfill-tick', batchSize: backfillBatch },
        {
          repeat: { every: 30 * 60 * 1000 },
          jobId: 'geo-backfill-tick-recurring',
        }
      )
      logger.info(
        { batchSize: backfillBatch },
        'scheduled recurring backfill-tick geo job (every 30 min)',
      )
    }
  } catch (error) {
    logger.warn({ error: String(error) }, 'failed to register recurring geo jobs')
  }
  }

  try {
    const repeatableJobs = await importQueue.getRepeatableJobs()
    const geoRepeatableJobs = await geoQueue.getRepeatableJobs()
    logger.info({
      repeatableJobs: [...repeatableJobs, ...geoRepeatableJobs].map(j => ({
        name: j.name,
        pattern: j.pattern,
        tz: j.tz,
        next: j.next ? new Date(j.next).toISOString() : null,
      }))
    }, 'repeatable jobs scheduled')
  } catch (error) {
    logger.warn({ error: String(error) }, 'failed to log repeatable jobs state')
  }
}
