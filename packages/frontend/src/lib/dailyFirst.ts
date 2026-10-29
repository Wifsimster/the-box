export function isTodayPath(pathname: string): boolean {
  return /^\/[a-z]{2}\/?$/.test(pathname)
}

export interface FeatureFlags {
  geoCommunity: boolean
  geogamers: boolean
  describeGuess: boolean
}

export interface FeatureGated {
  feature?: keyof FeatureFlags
}

export function filterByFeatures<T extends FeatureGated>(items: readonly T[], features: FeatureFlags): T[] {
  return items.filter((item) => !item.feature || features[item.feature])
}

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

export function yesterdayAction(yesterday: YesterdayChallengeInfo): YesterdayAction {
  if (yesterday.hasPlayed && yesterday.isCompleted && yesterday.sessionId) {
    return { kind: 'answers', path: `/history/${yesterday.sessionId}` }
  }
  const path = `/play?date=${encodeURIComponent(yesterday.date)}`
  return yesterday.hasPlayed ? { kind: 'resume', path } : { kind: 'catchUp', path }
}

export type LeaderboardTab = 'daily' | 'monthly' | 'achievements' | 'geogamers'

export function visibleLeaderboardTabs(active: LeaderboardTab): LeaderboardTab[] {
  const tabs: LeaderboardTab[] = ['daily', 'monthly']
  if (active === 'achievements' || active === 'geogamers') tabs.push(active)
  return tabs
}
