import { useEffect, useEffectEvent, useMemo, useReducer, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Play, Flame, Gamepad2, Sparkles, CloudOff, RefreshCw } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { gameApi } from '@/lib/api/game'
import { useReducedMotionSafe } from '@/hooks/useReducedMotionSafe'
import { HistoryTimeline, type TimelineItem } from '@/components/history/HistoryTimeline'
import { HistoryFilters } from '@/components/history/HistoryFilters'
import type { GameHistoryEntry, MissedChallenge } from '@/types'

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Score-range bounds are fixed; kept at module scope so they don't occupy a
// useState slot or get reallocated each render.
const SCORE_RANGE: readonly [number, number] = [-1000, 2000]

interface HistoryDataState {
  history: GameHistoryEntry[]
  missedChallenges: MissedChallenge[]
  loading: boolean
  failed: boolean
}

type HistoryDataAction =
  | { type: 'loadStart' }
  | { type: 'loaded'; history: GameHistoryEntry[]; missedChallenges: MissedChallenge[] }
  | { type: 'loadFailed' }

const initialHistoryData: HistoryDataState = {
  history: [],
  missedChallenges: [],
  loading: true,
  failed: false,
}

function historyDataReducer(
  state: HistoryDataState,
  action: HistoryDataAction,
): HistoryDataState {
  switch (action.type) {
    case 'loadStart':
      return { ...state, loading: true }
    case 'loaded':
      return {
        history: action.history,
        missedChallenges: action.missedChallenges,
        loading: false,
        failed: false,
      }
    case 'loadFailed':
      return { ...state, loading: false, failed: true }
    default:
      return state
  }
}

// Current streak = consecutive completed days ending today (or yesterday if
// today not yet played). Counts back from the most recent of {today,
// yesterday} that the user actually played.
function calculateStreak(entries: GameHistoryEntry[]): number {
  const playedDates = new Set<string>()
  for (const e of entries) {
    if (e.isCompleted) playedDates.add(e.challengeDate)
  }
  if (playedDates.size === 0) return 0

  const today = new Date()
  const todayStr = ymd(today)
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const yesterdayStr = ymd(yesterday)

  let cursor: Date
  if (playedDates.has(todayStr)) cursor = today
  else if (playedDates.has(yesterdayStr)) cursor = yesterday
  else return 0

  let count = 0
  while (playedDates.has(ymd(cursor))) {
    count++
    cursor.setDate(cursor.getDate() - 1)
  }
  return count
}

/**
 * ActivityPanel — the player's game history (timeline of played sessions and
 * missed challenges). Extracted from the former standalone HistoryPage so it
 * can live inside the profile hub's "Activity" tab; the `/history` route now
 * redirects here, while `/history/:sessionId` still opens the detail page.
 */
export function ActivityPanel() {
  const { t, i18n } = useTranslation()
  const { localizedPath } = useLocalizedPath()
  const { session } = useAuth()
  const [{ history, missedChallenges, loading, failed }, dispatchData] = useReducer(
    historyDataReducer,
    initialHistoryData,
  )
  const reducedMotion = useReducedMotionSafe()

  // Filter states
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'inProgress'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const scoreRange = SCORE_RANGE

  // Fetch history when session is available
  const fetchHistory = useCallback(() => {
    if (!session) return
    dispatchData({ type: 'loadStart' })
    gameApi.getGameHistory()
      .then(data => {
        dispatchData({
          type: 'loaded',
          history: data.entries,
          missedChallenges: data.missedChallenges || [],
        })
      })
      .catch(() => {
        dispatchData({ type: 'loadFailed' })
      })
  }, [session])

  // Fetch on mount
  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  // Refetch when page becomes visible (user returns from game). `fetchHistory`
  // is only read inside the visibilitychange handler, so it's wrapped in an
  // effect event — the effect itself only re-subscribes when the session
  // identity changes, not on every parent render.
  const onVisibilityChange = useEffectEvent(() => {
    if (document.visibilityState === 'visible' && session) {
      fetchHistory()
    }
  })
  useEffect(() => {
    const handler = () => onVisibilityChange()
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  // Format date for display. Stable across renders for a given language so it
  // can safely appear in the timeline memo's dependency list.
  const formatDate = useCallback(
    (dateStr: string) => {
      const date = new Date(dateStr)
      return date.toLocaleDateString(i18n.language, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    },
    [i18n.language],
  )

  // Aggregate stats — computed client-side from already-fetched entries.
  const aggregates = useMemo(() => {
    const playedCount = history.filter(e => e.isCompleted).length
    const streak = calculateStreak(history)
    return { playedCount, streak }
  }, [history])

  // Filter history entries
  const filteredHistory = history.filter(entry => {
    if (statusFilter === 'completed' && !entry.isCompleted) return false
    if (statusFilter === 'inProgress' && entry.isCompleted) return false
    if (entry.totalScore < scoreRange[0] || entry.totalScore > scoreRange[1]) return false
    if (searchQuery && !formatDate(entry.challengeDate).toLowerCase().includes(searchQuery.toLowerCase())) {
      return false
    }
    return true
  })

  // Unified chronological timeline — interleaves played sessions with missed
  // challenges so today's game appears at the top alongside older dates.
  const timeline: TimelineItem[] = useMemo(() => {
    const items: TimelineItem[] = filteredHistory.map(entry => ({
      kind: 'played' as const,
      date: entry.challengeDate,
      entry,
    }))

    if (statusFilter === 'all') {
      for (const challenge of missedChallenges) {
        if (searchQuery && !formatDate(challenge.date).toLowerCase().includes(searchQuery.toLowerCase())) {
          continue
        }
        items.push({ kind: 'missed', date: challenge.date, challenge })
      }
    }

    items.sort((a, b) => b.date.localeCompare(a.date))
    return items
  }, [filteredHistory, missedChallenges, statusFilter, searchQuery, formatDate])

  const initialLoading = loading && history.length === 0

  return (
    <div>
      {initialLoading && (
        <div aria-busy="true" className="space-y-4 sm:space-y-6">
          <span className="sr-only" role="status">{t('common.loading')}</span>
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-10 w-full" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>
      )}

      {!loading && failed && history.length === 0 && (
        <div role="alert" className="flex flex-col items-center gap-3 py-12 text-center">
          <CloudOff className="size-10 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm sm:text-base text-muted-foreground">{t('history.loadError')}</p>
          <Button variant="outline" onClick={fetchHistory}>
            <RefreshCw aria-hidden="true" />
            {t('common.retry')}
          </Button>
        </div>
      )}

      {!loading && !failed && history.length === 0 && (
        <Card variant="neon" className="bg-card/50 max-w-xl mx-auto text-center">
          <CardContent className="py-10 sm:py-12 flex flex-col items-center gap-4">
            <div
              className="size-16 sm:size-20 rounded-full flex items-center justify-center bg-linear-to-br from-neon-purple to-neon-pink"
              style={{ boxShadow: 'var(--glow-md)' }}
              aria-hidden="true"
            >
              <Sparkles className="size-8 sm:size-10 text-white" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-foreground">
              {t('history.empty.title')}
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground max-w-md">
              {t('history.empty.subtitle')}
            </p>
            <Button asChild variant="gaming" size="lg" className="mt-2 w-full sm:w-auto">
              <Link to={localizedPath('/play')}>
                <Play aria-hidden="true" />
                {t('history.empty.cta')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {history.length > 0 && (
        <div className="space-y-4 sm:space-y-6">
          <section
            aria-label={t('history.stats.label')}
            className="grid grid-cols-2 divide-x divide-border rounded-xl border border-border bg-card/50 py-4"
          >
            <div className="flex flex-col items-center gap-1 px-3 text-center">
              <span className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground">
                <Flame className="size-4 text-neon-pink" aria-hidden="true" />
                {t('history.stats.streak')}
              </span>
              <span className="text-xl sm:text-2xl font-bold text-foreground tabular-nums">
                {t('history.stats.streakUnit', { count: aggregates.streak })}
              </span>
            </div>
            <div className="flex flex-col items-center gap-1 px-3 text-center">
              <span className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground">
                <Gamepad2 className="size-4 text-neon-cyan" aria-hidden="true" />
                {t('history.stats.played')}
              </span>
              <span className="text-xl sm:text-2xl font-bold text-foreground tabular-nums">
                {t('history.stats.playedUnit', { count: aggregates.playedCount })}
              </span>
            </div>
          </section>

          <Card className="bg-card/50">
            <CardHeader>
              <CardTitle className="flex items-baseline justify-between gap-2">
                <span>{t('history.yourGames')}</span>
                <span className="text-sm font-normal text-muted-foreground tabular-nums">
                  {timeline.length} {timeline.length === 1 ? t('history.game') : t('history.games')}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <HistoryFilters
                statusFilter={statusFilter}
                searchQuery={searchQuery}
                loading={loading}
                onRefresh={fetchHistory}
                onStatusChange={setStatusFilter}
                onSearchChange={setSearchQuery}
                onClear={() => {
                  setStatusFilter('all')
                  setSearchQuery('')
                }}
              />
              <HistoryTimeline
                timeline={timeline}
                reducedMotion={reducedMotion}
                formatDate={formatDate}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
