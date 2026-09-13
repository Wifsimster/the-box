/**
 * Recurring job registration.
 *
 * Everything that schedules a repeatable BullMQ job at boot: pruning
 * deprecated schedules, (re)registering the active ones with their timezone
 * config, and logging the resulting plan.
 *
 * Extracted from `index.ts`, where it was ~450 lines inside the `else` branch
 * of a Redis connectivity check inside a 570-line `start()`. The entrypoint's
 * job is to wire things together and listen; deciding what runs at 03:00 UTC
 * is a separate concern with its own reasons to change.
 */
import { env } from '../config/env.js'
import { logger } from '../infrastructure/logger/logger.js'
import { tryAcquireBootLock } from '../infrastructure/queue/connection.js'
import { geoQueue, importQueue } from '../infrastructure/queue/queues.js'

export async function registerScheduledJobs(): Promise<void> {
  // Clean up deprecated and stale recurring jobs
  // Also remove active recurring jobs so they can be re-added with correct timezone config
  const deprecatedJobs = [
    'sync-new-games',
    // Tournament feature was removed
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
  // Recurring-job re-registration runs at most once per rolling
  // deploy. Without this lock, two containers can interleave their
  // remove/add and leave the queue with either zero or two of a
  // recurring job. 60s is comfortably longer than the slowest
  // re-registration loop in this section. Containers that don't
  // hold the lock skip the entire schedule block below; the cron
  // that the registrar wrote will fire for everyone via Redis.
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
          // Remove active jobs so they can be re-added with updated config (e.g., timezone)
          await importQueue.removeRepeatableByKey(job.key)
          logger.debug({ jobName: job.name }, 'removed recurring job for re-registration')
        }
      }
    } catch (error) {
      logger.warn({ error: String(error) }, 'failed to clean up recurring jobs')
    }
  }
  // Re-add block below is also gated on the lock. We use an early
  // skip-style label rather than wrapping every `importQueue.add`
  // because the existing code is one long sequence of independent
  // try/catch blocks.
  if (hasRecurringRegistrar) {

  // Schedule recurring daily challenge creation (midnight UTC)
  try {
    await importQueue.add(
      'create-daily-challenge',
      {},
      {
        repeat: { pattern: '0 0 * * *', tz: 'UTC' }, // Cron: midnight UTC daily
        jobId: 'create-daily-challenge-recurring',
      }
    )
    logger.info('scheduled recurring create-daily-challenge job (daily at midnight UTC)')
  } catch (error) {
    logger.warn({ error: String(error) }, 'failed to schedule recurring daily challenge job')
  }

  // Schedule recurring GeoGamers challenge creation (00:05 UTC, just after
  // the classic daily job to spread load). Only when the feature is enabled.
  if (env.GEOGAMERS_ENABLED === 'true') {
    try {
      await importQueue.add(
        'create-geogamers-challenge',
        {},
        {
          repeat: { pattern: '5 0 * * *', tz: 'UTC' }, // Cron: 00:05 UTC daily
          jobId: 'create-geogamers-challenge-recurring',
        }
      )
      logger.info('scheduled recurring create-geogamers-challenge job (daily at 00:05 UTC)')
    } catch (error) {
      logger.warn({ error: String(error) }, 'failed to schedule recurring geogamers challenge job')
    }

    // Close the prior season on the 1st at 00:35 UTC (after the classic
    // leaderboard payout at 00:30) and grant season frames to eligible
    // top finishers. Idempotent via reward_grants.
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

  // Schedule recurring sync-all-games job (weekly on Sundays at 2 AM UTC)
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
        repeat: { pattern: '0 2 * * 0', tz: 'UTC' }, // Cron: 2 AM UTC every Sunday
        jobId: 'sync-all-games-recurring',
      }
    )
    logger.info('scheduled recurring sync-all-games job (weekly on Sundays at 2 AM UTC)')
  } catch (error) {
    logger.warn({ error: String(error) }, 'failed to schedule recurring sync-all-games job')
  }

  // Schedule recurring cleanup-anonymous-users job (daily at 1 AM UTC)
  try {
    await importQueue.add(
      'cleanup-anonymous-users',
      {},
      {
        repeat: { pattern: '0 1 * * *', tz: 'UTC' }, // Cron: 1 AM UTC daily
        jobId: 'cleanup-anonymous-users-recurring',
      }
    )
    logger.info('scheduled recurring cleanup-anonymous-users job (daily at 1 AM UTC)')
  } catch (error) {
    logger.warn({ error: String(error) }, 'failed to schedule recurring cleanup-anonymous-users job')
  }

  // Schedule recurring recalculate-scores job (daily at 3 AM UTC)
  try {
    await importQueue.add(
      'recalculate-scores',
      { batchSize: 100, dryRun: false },
      {
        repeat: { pattern: '0 3 * * *', tz: 'UTC' }, // Cron: 3 AM UTC daily
        jobId: 'recalculate-scores-recurring',
      }
    )
    logger.info('scheduled recurring recalculate-scores job (daily at 3 AM UTC)')
  } catch (error) {
    logger.warn({ error: String(error) }, 'failed to schedule recurring recalculate-scores job')
  }

  // Schedule recurring streak-risk win-back email (daily at 19:00 UTC ~ evening Europe)
  // Runs in the window where users can still salvage their streak before midnight UTC.
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

  // Schedule recurring evening-nudge push (daily at 18:00 UTC ~ evening
  // Europe). Personalizes the "play today's challenge" reminder with the
  // current title holder. Runs an hour before the streak-risk email; its
  // candidate query excludes users who will get that email, so no user is
  // double-nudged. A later slot means the leader/score is more "real" while
  // still leaving a comfortable window before the midnight UTC reset.
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

  // Schedule recurring relance (re-engagement) email for users with an
  // unclaimed daily reward (daily at 17:00 UTC ~ early evening Europe).
  // Runs two hours before the streak-risk job and the worker's eligibility
  // query enforces mutual exclusion so the same user never gets both
  // marketing emails inside a single calendar day.
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

  // Schedule recurring inactive-user-reminder — long-horizon win-back for
  // users who have not played AND have not refreshed an auth session in
  // N days. Default schedule is weekly (Mondays 16:00 UTC) to avoid
  // piling reminders on already-gone users; the worker also enforces a
  // 30-day per-user cooldown internally.
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

  // Daily reactivation-scan — 03:00 UTC. Targets users who have not
  // played in the last 7 days, splits 10% to a holdout cohort
  // (deterministic per user_id), stages a chest via rewardsService.grant
  // (autoUnlock=false — the chest unlocks on the user's next guess), and
  // emails BOTH cohorts a warm welcome-back. Per-user cadence is 28
  // days (enforced via a NOT EXISTS clause in the candidate query).
  // Copy follows a strict ban-list — see infrastructure/email/reactivation-email.ts.
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

  // Monthly streak-freeze grant — 1st of each month at 06:00 UTC. Grants
  // 1× streak_freeze to every active user (last_played_at within 60 days)
  // who is below the per-user cap (2). Idempotent on YYYY-MM source_ref.
  // Streak freezes auto-consume in daily-login when a user misses exactly
  // one day; they are NEVER purchasable (see docs/game-flow.md).
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

  // Daily milestone-account-age — 04:00 UTC. Scans active users
  // (last_played_at < 60 days) old enough to have crossed the smallest
  // account-age threshold (365 d) and evaluates account-age milestones
  // for each. Per-user idempotency comes from the existing
  // user_achievements unique constraint, so re-runs are no-ops once
  // a user has earned a milestone.
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

  // Daily prune of stale push subscriptions — 02:00 UTC. Hard-deletes
  // rows the fan-out worker has already deactivated (410/404 from the
  // push provider) once they've been silent for >30 days. Without this
  // the table grows monotonically with churned browsers / reinstalls.
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

  // Daily data-retention sweep — 04:15 UTC. Hard-deletes personal-data
  // bearing audit / log rows past their per-table retention windows
  // (RGPD Art. 5(1)(e) storage limitation): email_log >1y,
  // admin_audit_log >2y, webhook_deliveries >30d, stripe_event_log >1y.
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

  // Monthly leaderboard payout — 1st of each month at 00:30 UTC. Awards
  // a time-stamped cosmetic frame (`frame_top100_YYYY_MM`) to the top
  // 100 players of the PRIOR calendar month. Idempotent on YYYY-MM
  // source_ref via reward_grants unique constraint, so re-running the
  // cron the same day is a no-op. Per the rewards meeting (Nour's
  // recognition-tier framing): cosmetic only, never points/cash, never
  // a countdown UI on the leaderboard page.
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

  // One-shot announcement email for the new referral feature.
  // The worker keys off `user.referral_announcement_email_sent_at`, so
  // re-enqueueing on every boot is safe — already-mailed users are
  // filtered out at the SQL level. The stable `jobId` prevents the
  // queue from holding multiple pending copies between deploys.
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

  // Geo recurring jobs. Sweep stale repeatables from previous boots before
  // re-registering the metadata-resolve and ingest-tick crons below.
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

    // Auto-resolve metadata for curated games every 30 min: HEADs Fandom +
    // Steam storesearch and fills in steam_app_id / wiki_subdomain.
    await geoQueue.add(
      'resolve-metadata',
      { kind: 'resolve-metadata' },
      {
        repeat: { every: 30 * 60 * 1000 },
        jobId: 'geo-resolve-metadata-recurring',
      }
    )
    logger.info('scheduled recurring resolve-metadata geo job (every 30 min)')

    // Ingest tick every 15 min: enqueues per-game fandom/steam imports
    // for curated games that are missing maps or low on candidates.
    await geoQueue.add(
      'ingest-tick',
      { kind: 'ingest-tick' },
      {
        repeat: { every: 15 * 60 * 1000 },
        jobId: 'geo-ingest-tick-recurring',
      }
    )
    logger.info('scheduled recurring ingest-tick geo job (every 15 min)')

    // Backfill discovery every 30 min (issue #331, phase 6). Off by default —
    // the stale-sweep above still removes it if it was previously registered
    // and the flag was since turned off. Unlike ingest-tick (which tops up
    // every resolved game), this concentrates on sub-threshold games ranked
    // by distance-to-eligibility so effort moves the eligible-count needle.
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
  } // end if (hasRecurringRegistrar) — registration block

  // Log final repeatable jobs configuration with next run times
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
