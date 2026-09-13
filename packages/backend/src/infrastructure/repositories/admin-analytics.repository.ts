/**
 * Admin analytics repository.
 *
 * The only place these engagement/growth queries live. It implements the
 * `AdminAnalyticsRepository` port: every method returns plain counter rows,
 * already unwrapped from Knex's `{ rows: [...] }` envelope, so nothing
 * downstream needs to know Knex is underneath.
 *
 * All counts exclude guest accounts (anonymous Better Auth sessions whose
 * emails end in @guest.thebox.local) so they reflect the real, identified
 * user base. Queries run in parallel — the dashboard renders in one
 * round-trip.
 */
import { db } from '../database/connection.js'
import type {
  AdminAnalyticsRepository,
  AtRiskStreakRow,
  ChurnCounters,
  DailyActivityCounters,
  DormancyCounters,
  EngagementBucketCounters,
  FunnelCounters,
  GrowthStatsCounters,
  LoginStreakCounters,
  RecentlyActiveUserRow,
  SessionAverageCounters,
  SessionTotalsCounters,
  TopPlayerByScoreRow,
  TopPlayerBySessionsRow,
  TopReferrerRow,
  UserAnalyticsCounters,
  UserTotalsCounters,
  WindowedCounters,
} from '../../domain/ports/analytics.js'

const GUEST_EMAIL_LIKE = '%@guest.thebox.local'

/** Knex `.first()` yields `undefined` for an empty result; the port says `null`. */
function orNull<T>(row: T | undefined): T | null {
  return row ?? null
}

export const adminAnalyticsRepository: AdminAnalyticsRepository = {
  async fetchUserAnalytics(): Promise<UserAnalyticsCounters> {
    const [
      totalsRow,
      activeUsersRow,
      newUsersRow,
      sessionsRow,
      sessionsAggRow,
      activityBucketsRow,
      streakRow,
      dailyActivityRows,
      topPlayersBySessionsRows,
      topPlayersByScoreRows,
      recentlyActiveRows,
      churnRow,
      dormancyRow,
      funnelRow,
      atRiskStreakRows,
    ] = await Promise.all([
    // Total non-guest users + how many have ever played
    db('user')
      .select<{ total: string; verified: string; ever_played: string; banned: string }>(
        db.raw('COUNT(*) AS total'),
        db.raw('COUNT(*) FILTER (WHERE "emailVerified" = true) AS verified'),
        db.raw('COUNT(*) FILTER (WHERE last_played_at IS NOT NULL) AS ever_played'),
        db.raw('COUNT(*) FILTER (WHERE banned = true) AS banned'),
      )
      .whereNot('email', 'like', GUEST_EMAIL_LIKE)
      .first(),
    // Active users by login window
    db('user')
      .select<{ d1: string; d7: string; d30: string }>(
        db.raw(`COUNT(*) FILTER (WHERE "lastLoginAt" > NOW() - INTERVAL '24 hours') AS d1`),
        db.raw(`COUNT(*) FILTER (WHERE "lastLoginAt" > NOW() - INTERVAL '7 days')  AS d7`),
        db.raw(`COUNT(*) FILTER (WHERE "lastLoginAt" > NOW() - INTERVAL '30 days') AS d30`),
      )
      .whereNot('email', 'like', GUEST_EMAIL_LIKE)
      .first(),
    // New signups (createdAt window)
    db('user')
      .select<{ d1: string; d7: string; d30: string }>(
        db.raw(`COUNT(*) FILTER (WHERE "createdAt" > NOW() - INTERVAL '24 hours') AS d1`),
        db.raw(`COUNT(*) FILTER (WHERE "createdAt" > NOW() - INTERVAL '7 days')  AS d7`),
        db.raw(`COUNT(*) FILTER (WHERE "createdAt" > NOW() - INTERVAL '30 days') AS d30`),
      )
      .whereNot('email', 'like', GUEST_EMAIL_LIKE)
      .first(),
    // Game session totals scoped to non-guest users
    db.raw<{ rows: Array<{ total: string; completed: string; catch_up: string }> }>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE gs.is_completed = true)::text AS completed,
         COALESCE(SUM(CASE WHEN gs.is_catch_up = true THEN 1 ELSE 0 END), 0)::text AS catch_up
       FROM game_sessions gs
       JOIN "user" u ON u.id = gs.user_id
       WHERE u.email NOT LIKE ?`,
      [GUEST_EMAIL_LIKE],
    ),
    // Average sessions / completed sessions per user who has played at
    // least once. Bypasses zero-division by guarding against an empty
    // denominator on the application side.
    db.raw<{ rows: Array<{ avg_sessions: string | null; avg_completed: string | null; players: string }> }>(
      `SELECT
         AVG(per_user.session_count)::text AS avg_sessions,
         AVG(per_user.completed_count)::text AS avg_completed,
         COUNT(*)::text AS players
       FROM (
         SELECT gs.user_id,
                COUNT(*) AS session_count,
                COUNT(*) FILTER (WHERE gs.is_completed = true) AS completed_count
         FROM game_sessions gs
         JOIN "user" u ON u.id = gs.user_id
         WHERE u.email NOT LIKE ?
         GROUP BY gs.user_id
       ) per_user`,
      [GUEST_EMAIL_LIKE],
    ),
    // Engagement buckets: split players by lifetime session count so we
    // can spot the long tail (1 session = curious, 20+ = power users).
    db.raw<{ rows: Array<{ b1: string; b2_5: string; b6_20: string; b21_plus: string; never: string }> }>(
      `WITH per_user AS (
         SELECT u.id,
                COUNT(gs.id) AS session_count
         FROM "user" u
         LEFT JOIN game_sessions gs ON gs.user_id = u.id
         WHERE u.email NOT LIKE ?
         GROUP BY u.id
       )
       SELECT
         COUNT(*) FILTER (WHERE session_count = 0)::text                          AS never,
         COUNT(*) FILTER (WHERE session_count = 1)::text                          AS b1,
         COUNT(*) FILTER (WHERE session_count BETWEEN 2 AND 5)::text              AS b2_5,
         COUNT(*) FILTER (WHERE session_count BETWEEN 6 AND 20)::text             AS b6_20,
         COUNT(*) FILTER (WHERE session_count > 20)::text                         AS b21_plus
       FROM per_user`,
      [GUEST_EMAIL_LIKE],
    ),
    // Login-streak distribution. Pulled from user_login_streaks (NOT
    // game streaks) — the daily-login feature is the closest proxy for
    // "did this person come back today?".
    db('user_login_streaks as s')
      .innerJoin('user as u', 'u.id', 's.user_id')
      .whereNot('u.email', 'like', GUEST_EMAIL_LIKE)
      .select<{ avg_current: string | null; max_streak: string | null; with_streak: string }>(
        db.raw('AVG(s.current_login_streak)::text AS avg_current'),
        db.raw('MAX(s.longest_login_streak)::text AS max_streak'),
        db.raw('COUNT(*) FILTER (WHERE s.current_login_streak > 0)::text AS with_streak'),
      )
      .first(),
    // Daily Active Users — count distinct logins per day for 14 days.
    // generate_series fills the gaps so the UI doesn't have to.
    db.raw<{ rows: Array<{ day: string; active: string; new_signups: string }> }>(
      `WITH days AS (
         SELECT generate_series(
           (CURRENT_DATE - INTERVAL '13 days')::date,
           CURRENT_DATE::date,
           INTERVAL '1 day'
         )::date AS day
       )
       SELECT
         to_char(d.day, 'YYYY-MM-DD') AS day,
         COALESCE(COUNT(DISTINCT u.id) FILTER (WHERE date_trunc('day', u."lastLoginAt") = d.day), 0)::text AS active,
         COALESCE(COUNT(DISTINCT n.id) FILTER (WHERE date_trunc('day', n."createdAt")    = d.day), 0)::text AS new_signups
       FROM days d
       LEFT JOIN "user" u ON date_trunc('day', u."lastLoginAt") = d.day AND u.email NOT LIKE ?
       LEFT JOIN "user" n ON date_trunc('day', n."createdAt")    = d.day AND n.email NOT LIKE ?
       GROUP BY d.day
       ORDER BY d.day ASC`,
      [GUEST_EMAIL_LIKE, GUEST_EMAIL_LIKE],
    ),
    // Top 10 players by lifetime sessions
    db.raw<{ rows: Array<{ user_id: string; username: string | null; name: string; sessions: string; completed: string; total_score: string; last_played_at: Date | null }> }>(
      `SELECT u.id AS user_id, u.username, u.name, u.total_score::text AS total_score,
              u.last_played_at,
              COUNT(gs.id)::text AS sessions,
              COUNT(*) FILTER (WHERE gs.is_completed = true)::text AS completed
       FROM "user" u
       JOIN game_sessions gs ON gs.user_id = u.id
       WHERE u.email NOT LIKE ?
       GROUP BY u.id
       ORDER BY COUNT(gs.id) DESC
       LIMIT 10`,
      [GUEST_EMAIL_LIKE],
    ),
    // Top 10 by all-time score
    db('user')
      .select<Array<{ id: string; username: string | null; name: string; total_score: number; current_streak: number; last_played_at: Date | null }>>(
        'id', 'username', 'name', 'total_score', 'current_streak', 'last_played_at',
      )
      .whereNot('email', 'like', GUEST_EMAIL_LIKE)
      .where('total_score', '>', 0)
      .orderBy('total_score', 'desc')
      .limit(10),
    // Most recently active 15 users — handy for the admin to spot bot
    // signups and see who's around right now.
    db('user')
      .select<Array<{ id: string; username: string | null; name: string; email: string; createdAt: Date; lastLoginAt: Date | null; last_played_at: Date | null; total_score: number; current_streak: number; banned: boolean }>>(
        'id', 'username', 'name', 'email', 'createdAt', 'lastLoginAt', 'last_played_at', 'total_score', 'current_streak', 'banned',
      )
      .whereNot('email', 'like', GUEST_EMAIL_LIKE)
      .whereNotNull('lastLoginAt')
      .orderBy('lastLoginAt', 'desc')
      .limit(15),
    // Churn windows: of all users that ever logged in, how many have
    // gone silent past 30/60/90 days. Denominator excludes "never
    // logged in" so the rate reflects abandonment of real users rather
    // than the never-activated long tail.
    db('user')
      .select<{ ever_active: string; inactive_30d: string; inactive_60d: string; inactive_90d: string }>(
        db.raw(`COUNT(*) FILTER (WHERE "lastLoginAt" IS NOT NULL) AS ever_active`),
        db.raw(`COUNT(*) FILTER (WHERE "lastLoginAt" IS NOT NULL AND "lastLoginAt" < NOW() - INTERVAL '30 days') AS inactive_30d`),
        db.raw(`COUNT(*) FILTER (WHERE "lastLoginAt" IS NOT NULL AND "lastLoginAt" < NOW() - INTERVAL '60 days') AS inactive_60d`),
        db.raw(`COUNT(*) FILTER (WHERE "lastLoginAt" IS NOT NULL AND "lastLoginAt" < NOW() - INTERVAL '90 days') AS inactive_90d`),
      )
      .whereNot('email', 'like', GUEST_EMAIL_LIKE)
      .first(),
    // Dormancy distribution: bucket every non-guest user by days since
    // last login. Drives the lifecycle bar so the admin can see at a
    // glance how much of the base is healthy vs. at-risk vs. lost.
    db('user')
      .select<{ never_logged: string; active: string; warm: string; at_risk: string; dormant: string; lost: string }>(
        db.raw(`COUNT(*) FILTER (WHERE "lastLoginAt" IS NULL) AS never_logged`),
        db.raw(`COUNT(*) FILTER (WHERE "lastLoginAt" > NOW() - INTERVAL '7 days') AS active`),
        db.raw(`COUNT(*) FILTER (WHERE "lastLoginAt" <= NOW() - INTERVAL '7 days'  AND "lastLoginAt" > NOW() - INTERVAL '30 days') AS warm`),
        db.raw(`COUNT(*) FILTER (WHERE "lastLoginAt" <= NOW() - INTERVAL '30 days' AND "lastLoginAt" > NOW() - INTERVAL '60 days') AS at_risk`),
        db.raw(`COUNT(*) FILTER (WHERE "lastLoginAt" <= NOW() - INTERVAL '60 days' AND "lastLoginAt" > NOW() - INTERVAL '90 days') AS dormant`),
        db.raw(`COUNT(*) FILTER (WHERE "lastLoginAt" <= NOW() - INTERVAL '90 days') AS lost`),
      )
      .whereNot('email', 'like', GUEST_EMAIL_LIKE)
      .first(),
    // Signup → first-play funnel over the last 30 days. Surfaces how
    // many fresh signups actually start a session, and how many are
    // still active 7 days in. Sized to the same 30d window everything
    // else on the page uses.
    db('user')
      .select<{ signed_up: string; played: string; still_active_7d: string }>(
        db.raw('COUNT(*) AS signed_up'),
        db.raw('COUNT(*) FILTER (WHERE last_played_at IS NOT NULL) AS played'),
        db.raw(`COUNT(*) FILTER (WHERE last_played_at > NOW() - INTERVAL '7 days') AS still_active_7d`),
      )
      .whereNot('email', 'like', GUEST_EMAIL_LIKE)
      .where('createdAt', '>', db.raw(`NOW() - INTERVAL '30 days'`))
      .first(),
    // Streak-at-risk: users carrying a real streak (≥3) who haven't
    // logged in for 36h–7d. They still have a recoverable streak — an
    // admin can nudge them before they drop off. Past 7 days the
    // streak is almost certainly gone so we exclude that tail.
    db('user')
      .select<Array<{ id: string; username: string | null; name: string; email: string; current_streak: number; lastLoginAt: Date | null; last_played_at: Date | null; total_score: number }>>(
        'id', 'username', 'name', 'email', 'current_streak', 'lastLoginAt', 'last_played_at', 'total_score',
      )
      .whereNot('email', 'like', GUEST_EMAIL_LIKE)
      .where('banned', false)
      .where('current_streak', '>=', 3)
      .whereRaw(`"lastLoginAt" < NOW() - INTERVAL '36 hours'`)
      .whereRaw(`"lastLoginAt" > NOW() - INTERVAL '7 days'`)
      .orderBy([
        { column: 'current_streak', order: 'desc' },
        { column: 'lastLoginAt', order: 'asc' },
      ])
      .limit(15),
    ])

    return {
      totals: orNull<UserTotalsCounters>(totalsRow),
      activeUsers: orNull<WindowedCounters>(activeUsersRow),
      newUsers: orNull<WindowedCounters>(newUsersRow),
      sessionTotals: orNull<SessionTotalsCounters>(sessionsRow.rows[0]),
      sessionAverages: orNull<SessionAverageCounters>(sessionsAggRow.rows[0]),
      engagementBuckets: orNull<EngagementBucketCounters>(activityBucketsRow.rows[0]),
      loginStreaks: orNull<LoginStreakCounters>(streakRow),
      dailyActivity: dailyActivityRows.rows as DailyActivityCounters[],
      topBySessions: topPlayersBySessionsRows.rows as TopPlayerBySessionsRow[],
      topByScore: topPlayersByScoreRows as TopPlayerByScoreRow[],
      recentlyActive: recentlyActiveRows as RecentlyActiveUserRow[],
      churn: orNull<ChurnCounters>(churnRow),
      dormancy: orNull<DormancyCounters>(dormancyRow),
      funnel: orNull<FunnelCounters>(funnelRow),
      atRiskStreaks: atRiskStreakRows as AtRiskStreakRow[],
    }
  },

  async fetchGrowthStats(): Promise<GrowthStatsCounters> {
    const [
      referralTotalsRow,
      consentTotalsRow,
      streakEmail24hRow,
      streakEmail7dRow,
      topReferrers,
      mostRecentStreakEmailRow,
      relanceEmail24hRow,
      relanceEmail7dRow,
      mostRecentRelanceEmailRow,
    ] = await Promise.all([
      db('user')
        .count<{ count: string }>({ count: '*' })
        .whereNotNull('referred_by')
        .first(),
      db('user')
        .select<{ consented: string; total: string }>(
          db.raw(`COUNT(*) FILTER (WHERE email_marketing_consent = true) AS consented`),
          db.raw(`COUNT(*) AS total`)
        )
        .whereNot('email', 'like', GUEST_EMAIL_LIKE)
        .first(),
      db('user')
        .count<{ count: string }>({ count: '*' })
        .whereRaw(`last_streak_risk_email_at > NOW() - INTERVAL '24 hours'`)
        .first(),
      db('user')
        .count<{ count: string }>({ count: '*' })
        .whereRaw(`last_streak_risk_email_at > NOW() - INTERVAL '7 days'`)
        .first(),
      db.raw<{ rows: TopReferrerRow[] }>(
        `SELECT u.id AS referrer_id, u.username, u.name, COUNT(*)::text AS count
         FROM "user" r
         JOIN "user" u ON u.id = r.referred_by
         WHERE r.referred_by IS NOT NULL
         GROUP BY u.id, u.username, u.name
         ORDER BY COUNT(*) DESC
         LIMIT 10`
      ),
      db('user')
        .max<{ last: Date | null }>({ last: 'last_streak_risk_email_at' })
        .first(),
      db('user')
        .count<{ count: string }>({ count: '*' })
        .whereRaw(`last_relance_email_at > NOW() - INTERVAL '24 hours'`)
        .first(),
      db('user')
        .count<{ count: string }>({ count: '*' })
        .whereRaw(`last_relance_email_at > NOW() - INTERVAL '7 days'`)
        .first(),
      db('user')
        .max<{ last: Date | null }>({ last: 'last_relance_email_at' })
        .first(),
    ])

    return {
      referralsClaimed: referralTotalsRow?.count ?? 0,
      consented: consentTotalsRow?.consented ?? 0,
      totalNonGuestUsers: consentTotalsRow?.total ?? 0,
      topReferrers: topReferrers.rows,
      streakRiskEmailLast24h: streakEmail24hRow?.count ?? 0,
      streakRiskEmailLast7d: streakEmail7dRow?.count ?? 0,
      streakRiskEmailLastSentAt: mostRecentStreakEmailRow?.last ?? null,
      relanceEmailLast24h: relanceEmail24hRow?.count ?? 0,
      relanceEmailLast7d: relanceEmail7dRow?.count ?? 0,
      relanceEmailLastSentAt: mostRecentRelanceEmailRow?.last ?? null,
    }
  },
}
