/**
 * Pure helpers behind the daily-first information architecture: the home
 * route *is* today's box, the second tab is "Results", and everything else
 * (Panorama, Premium, the former landing page on /about) is secondary.
 *
 * Kept free of React and browser APIs so the node test runner can cover them.
 */

/** True for the bare language root (`/fr`, `/en/`): today's box. */
export function isTodayPath(pathname: string): boolean {
  return /^\/[a-z]{2}\/?$/.test(pathname)
}

/** Feature flags as served by `GET /api/features`. */
export interface FeatureFlags {
  geoCommunity: boolean
  geogamers: boolean
  /** "Describe the game" in shadow mode (DESCRIBE_GUESS_ENABLED + ANTHROPIC_API_KEY). */
  describeGuess: boolean
}

/** Anything gated by an optional runtime flag (nav entries, mode cards…). */
export interface FeatureGated {
  feature?: keyof FeatureFlags
}

/** Drop the entries whose runtime flag is off. Ungated entries always stay. */
export function filterByFeatures<T extends FeatureGated>(items: readonly T[], features: FeatureFlags): T[] {
  return items.filter((item) => !item.feature || features[item.feature])
}

/** Shape of `TodayChallengeResponse.yesterdayChallenge`. */
export interface YesterdayChallengeInfo {
  date: string
  hasPlayed: boolean
  isCompleted?: boolean
  sessionId?: string | null
}

export type YesterdayAction =
  | { kind: 'answers'; path: string }
  | { kind: 'resume'; path: string }
  | { kind: 'catchUp'; path: string }

/**
 * What the "yesterday's box" line offers (decision D6):
 * - finished → your answers (the history page of that session);
 * - started but not finished → resume it as a catch-up;
 * - missed → catch it up (off the leaderboard).
 *
 * Yesterday's answers are never revealed to someone who has not played it:
 * that would spoil the 7-day catch-up window.
 */
export function yesterdayAction(yesterday: YesterdayChallengeInfo): YesterdayAction {
  if (yesterday.hasPlayed && yesterday.isCompleted && yesterday.sessionId) {
    return { kind: 'answers', path: `/history/${yesterday.sessionId}` }
  }
  const path = `/play?date=${encodeURIComponent(yesterday.date)}`
  return yesterday.hasPlayed ? { kind: 'resume', path } : { kind: 'catchUp', path }
}

export type LeaderboardTab = 'daily' | 'monthly' | 'achievements' | 'geogamers'

/**
 * Tabs shown in the "Results" tab bar (decision D9). Only the daily and
 * monthly rankings are listed; the achievements and Panorama boards stay
 * reachable through `?tab=` and show up only while they are the active tab.
 */
export function visibleLeaderboardTabs(active: LeaderboardTab): LeaderboardTab[] {
  const tabs: LeaderboardTab[] = ['daily', 'monthly']
  if (active === 'achievements' || active === 'geogamers') tabs.push(active)
  return tabs
}
