import { useEffect, useMemo, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { m } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { History, Trophy, Loader2, ChevronRight, CheckCircle2, Clock, RefreshCw, Calendar, Play, Flame, Gamepad2, Sparkles, Target } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { useAuth } from '@/hooks/useAuth'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { gameApi } from '@/lib/api/game'
import { useReducedMotionSafe } from '@/hooks/useReducedMotionSafe'
import type { GameHistoryEntry, MissedChallenge } from '@/types'

type ScoreTier = 'mastered' | 'solid' | 'shaky'

function getScoreTier(score: number): ScoreTier {
  if (score >= 1200) return 'mastered'
  if (score >= 600) return 'solid'
  return 'shaky'
}

const tierBadgeVariant: Record<ScoreTier, 'success' | 'warning' | 'destructive'> = {
  mastered: 'success',
  solid: 'warning',
  shaky: 'destructive',
}

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Current streak = consecutive completed days ending today (or yesterday if today not yet played).
// Counts back from the most recent of {today, yesterday} that the user actually played.
function calculateStreak(entries: GameHistoryEntry[]): number {
  const playedDates = new Set(entries.filter(e => e.isCompleted).map(e => e.challengeDate))
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
  const [history, setHistory] = useState<GameHistoryEntry[]>([])
  const [missedChallenges, setMissedChallenges] = useState<MissedChallenge[]>([])
  const [loading, setLoading] = useState(true)
  const reducedMotion = useReducedMotionSafe()

  // Filter states
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'inProgress'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [scoreRange] = useState<[number, number]>([-1000, 2000])

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isPending && !session) {
      navigate(localizedPath('/login'))
    }
  }, [isPending, session, navigate, localizedPath])

  // Fetch history when session is available
  const fetchHistory = useCallback(() => {
    if (!session) return
    setLoading(true)
    gameApi.getGameHistory()
      .then(data => {
        setHistory(data.entries)
        setMissedChallenges(data.missedChallenges || [])
      })
      .catch(() => { })
      .finally(() => setLoading(false))
  }, [session])

  // Fetch on mount
  /* eslint-disable react-hooks/set-state-in-effect -- fetchHistory contains setState */
  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Refetch when page becomes visible (user returns from game)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && session) {
        fetchHistory()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [session, fetchHistory])

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString(i18n.language, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

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
  type TimelineItem =
    | { kind: 'played'; date: string; entry: GameHistoryEntry }
    | { kind: 'missed'; date: string; challenge: MissedChallenge }

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
    // formatDate depends on i18n.language; including it would re-run on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredHistory, missedChallenges, statusFilter, searchQuery, i18n.language])

  return (
    <PageHero icon={History} iconStyle="simple" title={t('history.title')} subtitle={t('history.subtitle')}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Loading State */}
        {loading && (
          <div className="flex justify-center py-8 sm:py-12" role="status" aria-live="polite">
            <Loader2 className="size-6 sm:size-8 animate-spin text-primary" aria-hidden="true" />
            <span className="sr-only">{t('common.loading')}</span>
          </div>
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
            <Card className="bg-card/50 border-border">
              <CardHeader className="p-4 sm:p-6 pb-3 sm:pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base sm:text-lg font-bold">
                    {t('common.filters')}
                  </CardTitle>
                  <button
                    type="button"
                    onClick={fetchHistory}
                    disabled={loading}
                    aria-label={t('history.refreshLabel')}
                    aria-busy={loading}
                    className="text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md p-1 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`size-4 sm:size-5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0">
                <div className="flex flex-col gap-3 sm:gap-4">
                  {/* Search Bar */}
                  <div className="flex-1">
                    <Label htmlFor="history-search" className="sr-only">
                      {t('history.searchLabel')}
                    </Label>
                    <Input
                      id="history-search"
                      type="search"
                      placeholder={t('history.searchPlaceholder')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  {/* Status Filter — Radix ToggleGroup gives aria-pressed + roving tabindex */}
                  <ToggleGroup
                    type="single"
                    value={statusFilter}
                    onValueChange={(value) => {
                      if (value === 'all' || value === 'completed' || value === 'inProgress') {
                        setStatusFilter(value)
                      }
                    }}
                    aria-label={t('common.filters')}
                  >
                    <ToggleGroupItem value="all" aria-label={t('common.all')}>
                      {t('common.all')}
                    </ToggleGroupItem>
                    <ToggleGroupItem value="completed" aria-label={t('history.completed')}>
                      <CheckCircle2 className="size-3 sm:size-4" aria-hidden="true" />
                      {t('history.completed')}
                    </ToggleGroupItem>
                    <ToggleGroupItem value="inProgress" aria-label={t('history.inProgress')}>
                      <Clock className="size-3 sm:size-4" aria-hidden="true" />
                      {t('history.inProgress')}
                    </ToggleGroupItem>
                  </ToggleGroup>

                  {/* Active Filters Display */}
                  {(statusFilter !== 'all' || searchQuery) && (
                    <div className="flex items-center gap-2 pt-2 border-t border-border">
                      <span className="text-xs sm:text-sm text-muted-foreground">
                        {t('common.activeFilters')}:
                      </span>
                      {statusFilter !== 'all' && (
                        <Badge variant="outline" className="text-xs">
                          {statusFilter === 'completed' ? t('history.completed') : t('history.inProgress')}
                        </Badge>
                      )}
                      {searchQuery && (
                        <Badge variant="outline" className="text-xs">
                          {searchQuery}
                        </Badge>
                      )}
                      <button
                        onClick={() => {
                          setStatusFilter('all')
                          setSearchQuery('')
                        }}
                        className="ml-auto text-xs sm:text-sm text-primary hover:underline"
                      >
                        {t('common.clearAll')}
                      </button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

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
                {timeline.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    {t('history.noMatchingResults')}
                  </div>
                ) : (
                  <ul className="space-y-2 sm:space-y-3 list-none">
                    {timeline.map((item, index) => {
                      if (item.kind === 'missed') {
                        const { challenge } = item
                        const dateLabel = formatDate(challenge.date)
                        return (
                          <m.li
                            key={`missed-${challenge.challengeId}`}
                            initial={reducedMotion ? false : { opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: reducedMotion ? 0 : 0.3, delay: reducedMotion ? 0 : index * 0.05 }}
                            className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg bg-warning/10 border border-warning/20"
                          >
                            <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                              <div className="size-10 sm:size-12 shrink-0 rounded-full flex items-center justify-center bg-linear-to-br from-warning to-score-low" aria-hidden="true">
                                <Calendar className="size-5 sm:size-6 text-white" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="text-sm sm:text-base font-semibold wrap-break-word">
                                  {dateLabel}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0">
                              <Badge variant="outline" className="text-xs border-warning/50 bg-warning/10 text-warning">
                                {t('history.catchUpBadge')}
                              </Badge>
                              <Button
                                size="sm"
                                onClick={() => navigate(`${localizedPath('/play')}?date=${encodeURIComponent(challenge.date)}`)}
                                aria-label={t('history.resumeGame', { date: dateLabel })}
                                className="bg-linear-to-r from-warning to-score-low hover:from-warning hover:to-score-low text-white"
                              >
                                <Play className="size-4 mr-1" aria-hidden="true" />
                                {t('history.playCatchUp')}
                              </Button>
                            </div>
                          </m.li>
                        )
                      }

                      const { entry } = item
                      const tier = getScoreTier(entry.totalScore)
                      const tierLabel = t(`game.scoreQuality.${tier}`)
                      const dateLabel = formatDate(entry.challengeDate)
                      const isCompleted = entry.isCompleted
                      const to = isCompleted
                        ? `${localizedPath('/history')}/${entry.sessionId}`
                        : `${localizedPath('/play')}?date=${encodeURIComponent(entry.challengeDate)}`
                      const ariaLabel = isCompleted
                        ? t('history.viewDetails', { date: dateLabel })
                        : t('history.resumeGame', { date: dateLabel })

                      return (
                        <m.li
                          key={entry.sessionId}
                          initial={reducedMotion ? false : { opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: reducedMotion ? 0 : 0.3, delay: reducedMotion ? 0 : index * 0.05 }}
                        >
                          <Link
                            to={to}
                            aria-label={ariaLabel}
                            className="group flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg bg-secondary/50 transition-all hover:bg-secondary/70 hover:ring-2 hover:ring-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:bg-secondary/70 no-underline"
                          >
                            {/* Left Section: Icon, Date, Status */}
                            <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                              {/* Dynamic icon — three-channel signal (icon + color + Badge label) */}
                              <div
                                className={`size-10 sm:size-12 shrink-0 rounded-full flex items-center justify-center ${isCompleted
                                  ? 'bg-linear-to-br from-success to-success/80'
                                  : 'bg-linear-to-br from-neon-blue to-neon-cyan'
                                  }`}
                                aria-hidden="true"
                              >
                                {isCompleted ? (
                                  <CheckCircle2 className="size-5 sm:size-6 text-white" />
                                ) : (
                                  <Clock className="size-5 sm:size-6 text-white" />
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex flex-col gap-1">
                                  <span className="text-sm sm:text-base font-semibold wrap-break-word text-foreground">
                                    {dateLabel}
                                  </span>
                                  {!isCompleted && (
                                    <Badge variant="info" className="w-fit text-xs">
                                      <Clock className="size-3 mr-1" aria-hidden="true" />
                                      {t('history.inProgress')}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Middle Section: X / N correct (primary) + tier label (secondary) */}
                            {isCompleted && (
                              <div className="flex flex-col items-start sm:items-end gap-0.5">
                                <div className="flex items-center gap-1.5 text-sm sm:text-base font-semibold text-foreground tabular-nums">
                                  <Target className="size-3.5 sm:size-4 text-muted-foreground" aria-hidden="true" />
                                  <span aria-label={t('game.correctOutOf', { correct: entry.roundsCorrect, total: entry.totalScreenshots })}>
                                    {t('game.correctOutOf', { correct: entry.roundsCorrect, total: entry.totalScreenshots })}
                                  </span>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  <span className="sr-only">{t('game.scoreQuality.label')}: </span>
                                  {tierLabel}
                                </span>
                              </div>
                            )}

                            {/* Right Section: Score & Chevron */}
                            <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0">
                              <div className="flex items-center gap-2">
                                <Trophy className="size-5 sm:size-6 text-primary" aria-hidden="true" />
                                <Badge
                                  variant={tierBadgeVariant[tier]}
                                  className="text-base sm:text-xl font-bold px-3 sm:px-4 py-1 sm:py-1.5"
                                  aria-label={`${entry.totalScore} ${t('game.totalScore')} — ${tierLabel}`}
                                >
                                  {entry.totalScore}
                                </Badge>
                              </div>
                              <ChevronRight className="size-5 sm:size-6 text-muted-foreground group-hover:text-primary group-focus-visible:text-primary group-hover:translate-x-1 group-focus-visible:translate-x-1 transition-all" aria-hidden="true" />
                            </div>
                          </Link>
                        </m.li>
                      )
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </PageHero>
  )
}
