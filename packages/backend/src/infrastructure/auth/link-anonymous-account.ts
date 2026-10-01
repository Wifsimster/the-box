// Moves a guest's progress onto the account they register (or sign in to).
//
// Better Auth's anonymous plugin deletes the guest user right after a
// sign-up / sign-in made from a guest session, and every game table
// cascades on user deletion — so without this transfer a guest who
// registers mid-day loses today's daily game.
//
// Rows that would collide with the target account (it already played the
// same challenge, already owns the achievement) are left on the guest and
// disappear with it: the real account's data always wins.

export interface QueryClient {
  query(text: string, values?: unknown[]): Promise<unknown>
}

export interface TransactionalPool {
  connect(): Promise<QueryClient & { release(): void }>
}

export const TRANSFER_STATEMENTS: readonly string[] = [
  `UPDATE game_sessions AS g SET user_id = $2
     WHERE g.user_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM game_sessions t
          WHERE t.user_id = $2 AND t.daily_challenge_id = g.daily_challenge_id)`,
  `UPDATE live_event_participants AS p SET user_id = $2
     WHERE p.user_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM live_event_participants t
          WHERE t.user_id = $2 AND t.live_event_id = p.live_event_id)`,
  `UPDATE user_achievements AS a SET user_id = $2
     WHERE a.user_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM user_achievements t
          WHERE t.user_id = $2 AND t.achievement_id = a.achievement_id)`,
  `UPDATE "user" AS t SET
       -- Sessions still owned by the guest at this point are the ones that
       -- collided above; their points must not be credited twice.
       total_score = t.total_score + GREATEST(0, g.total_score - COALESCE(
         (SELECT SUM(s.total_score) FROM game_sessions s WHERE s.user_id = $1), 0)),
       current_streak = GREATEST(t.current_streak, g.current_streak),
       longest_streak = GREATEST(t.longest_streak, g.longest_streak),
       last_played_at = GREATEST(t.last_played_at, g.last_played_at)
     FROM "user" AS g
    WHERE g.id = $1 AND t.id = $2`,
]

export async function transferAnonymousUserData(
  pool: TransactionalPool,
  anonymousUserId: string,
  newUserId: string,
): Promise<void> {
  if (anonymousUserId === newUserId) return

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const statement of TRANSFER_STATEMENTS) {
      await client.query(statement, [anonymousUserId, newUserId])
    }
    await client.query('COMMIT')
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* ignore */ }
    throw error
  } finally {
    client.release()
  }
}
