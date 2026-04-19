/**
 * Achievement domain row types.
 *
 * These are the snake_case shapes that the achievement domain service and
 * its consumers in the presentation layer work with. They intentionally
 * mirror the database rows because the achievement routes serialize them
 * directly to clients (mapping snake_case to camelCase there).
 *
 * Kept under `domain/types/` so the domain service no longer needs to
 * reach into `infrastructure/repositories/achievement.repository.ts`.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface AchievementRow {
  id: number
  key: string
  name: string
  description: string | null
  category: string
  icon_url: string | null
  points: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  criteria: Record<string, any> | null
  tier: number
  is_hidden: boolean
  created_at: Date
}

export interface UserAchievementRow {
  id: number
  user_id: string
  achievement_id: number
  earned_at: Date
  progress: number
  progress_max: number | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: Record<string, any> | null
}

export interface UserAchievementWithDetails extends UserAchievementRow {
  achievement_key: string
  achievement_name: string
  achievement_description: string | null
  achievement_category: string
  achievement_icon_url: string | null
  achievement_points: number
  achievement_tier: number
}
