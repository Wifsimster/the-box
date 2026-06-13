import { useEffect, useEffectEvent, useMemo, useReducer, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { History, Loader2, Play, Flame, Gamepad2, Sparkles } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
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

// Current streak = consecutive completed days ending today (or yesterday if today not yet played).
// Counts back from the most recent of {today, yesterday} that the user actually played.
// Score-range bounds are fixed; kept at module scope so they don't occupy a
// useState slot or get reallocated each render.
const SCORE_RANGE: readonly [number, number] = [-1000, 2000]

interface HistoryDataState {
  history: GameHistoryEntry[]
  missedChallenges: MissedChallenge[]
  loading: boolean
}

type HistoryDataAction =
  | { type: 'loadStart' }
  | { type: 'loaded'; history: GameHistoryEntry[]; missedChallenges: MissedChallenge[] }
  | { type: 'loadFailed' }

const initialHistoryData: HistoryDataState = {
  history: [],
  missedChallenges: [],
  loading: true,
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
      }
    case 'loadFailed':
      return { ...state, loading: false }
    default:
      return state
  }
}

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

export default function HistoryPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { localizedPath } = useLocalizedPath()
  const { session, isPending } = useAuth()
  const [{ history, missedChallenges, loading }, dispatchData] = useReducer(
    historyDataReducer,
    initialHistoryData,
  )
  const reducedMotion = useReducedMotionSafe()

  // Filter states
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'inProgress'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const scoreRange = SCORE_RANGE

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isPending && !session) {
      navigate(localizedPath('/login'))
    }
  }, [isPending, session, navigate, localizedPath])

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

  // Aggregate stats — computed client-side from already-fetched entries (no extra API call).
  const aggregates = useMemo(() => {
    const playedCount = history.filter(e => e.isCompleted).length
    const streak = calculateStreak(history)
    return { playedCount, streak }
  }, [history])

  // Filter history entries
  const filteredHistory = history.filter(entry => {
    // Status filter
    if (statusFilter === 'completed' && !entry.isCompleted) return false
    if (statusFilter === 'inProgress' && entry.isCompleted) return false

    // Score range filter
    if (entry.totalScore < scoreRange[0] || entry.totalScore > scoreRange[1]) return false

    // Search query (matches date)
    if (searchQuery && !formatDate(entry.challengeDate).toLowerCase().includes(searchQuery.toLowerCase())) {
      return false
    }

    return true
  })

  // Unified chronological timeline — interleaves played sessions with missed
  // challenges so today's game appears at the top alongside older dates,
  // instead of being buried under a long "Défis Manqués" section.
  const timeline: TimelineItem[] = useMemo(() => {
    const items: TimelineItem[] = filteredHistory.map(entry => ({
      kind: 'played' as const,
      date: entry.challengeDate,
      entry,
    }))

    // Missed challenges only show under the "Tous" filter — they aren't
    // completed and aren't in-progress sessions.
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

  return (
    <PageHero icon={History} iconStyle="simple" title={t('history.title')} subtitle={t('history.subtitle')}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Loading State */}
        {loading && (
          <output className="flex justify-center py-8 sm:py-12" aria-live="polite">
            <Loader2 className="size-6 sm:size-8 animate-spin text-primary" aria-hidden="true" />
            <span className="sr-only">{t('common.loading')}</span>
          </output>
        )}

        {/* Empty State — sells today's challenge */}
        {!loading && history.length === 0 && (
          <Card variant="neon" className="bg-card/50 max-w-xl mx-auto text-center">
            <CardContent className="py-10 sm:py-12 px-6 sm:px-8 flex flex-col items-center gap-4">
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
              <Button asChild size="lg" className="mt-2">
                <Link to={localizedPath('/play')}>
                  <Play className="size-4 mr-2" aria-hidden="true" />
                  {t('history.empty.cta')}
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* History List */}
        {!loading && history.length > 0 && (
          <div className="space-y-4 sm:space-y-6">
            {/* Stats Strip — Série · Joué (computed client-side, no extra API call) */}
            <Card className="bg-card/50 border-border" aria-label={t('history.stats.label')}>
              <CardContent className="p-4 sm:p-5 flex flex-row items-stretch divide-x divide-border">
                <div className="flex-1 flex flex-col items-center gap-1 px-3">
                  <div className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground">
                    <Flame className="size-3.5 sm:size-4 text-neon-pink" aria-hidden="true" />
                    <span>{t('history.stats.streak')}</span>
                  </div>
                  <span className="text-xl sm:text-2xl font-bold text-foreground tabular-nums">
                    {t('history.stats.streakUnit', { count: aggregates.streak })}
                  </span>
                </div>
                <div className="flex-1 flex flex-col items-center gap-1 px-3">
                  <div className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground">
                    <Gamepad2 className="size-3.5 sm:size-4 text-neon-cyan" aria-hidden="true" />
                    <span>{t('history.stats.played')}</span>
                  </div>
                  <span className="text-xl sm:text-2xl font-bold text-foreground tabular-nums">
                    {t('history.stats.playedUnit', { count: aggregates.playedCount })}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Filters Section */}
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

            {/* Unified Timeline — played sessions and missed challenges
                interleaved by date, so today's game appears at the top. */}
            <Card className="bg-card/50 border-border">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg font-bold text-foreground">
                  {t('history.yourGames')}
                </CardTitle>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                  {timeline.length} {timeline.length === 1 ? t('history.game') : t('history.games')}
                </p>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0">
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
    </PageHero>
  )
}
