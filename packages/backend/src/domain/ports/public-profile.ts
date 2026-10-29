import type { Counter } from './analytics.js'

export interface PublicStreamerRecord {
  id: string
  public_slug: string
  display_name: string | null
  username: string | null
  avatar_url: string | null
  current_streak: number
  longest_streak: number
  total_score: number
}

export interface PublicDailySessionRecord {
  id: string
  total_score: number
  current_tier: number
  is_completed: boolean
  started_at: Date
  completed_at: Date | null
}

export interface PublicProfileRepository {
  findBySlug(slug: string): Promise<PublicStreamerRecord | null>

  countRankedSessions(userId: string): Promise<Counter>

  findDailySession(
    userId: string,
    challengeId: number
  ): Promise<PublicDailySessionRecord | null>

  countCorrectAnswers(gameSessionId: string): Promise<Counter>

  findPublicSlugs(userIds: string[]): Promise<Map<string, string | null>>
}
