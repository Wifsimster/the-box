import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { History, Trophy, Loader2, ChevronRight, CheckCircle2, Clock, Gamepad2, Target, RefreshCw } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { useAuth } from '@/hooks/useAuth'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { gameApi } from '@/lib/api/game'
import type { GameHistoryEntry } from '@/types'

export default function HistoryPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { localizedPath } = useLocalizedPath()
  const { session, isPending } = useAuth()
  const [history, setHistory] = useState<GameHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)

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
      .then(data => setHistory(data.entries))
      .catch(() => { })
      .finally(() => setLoading(false))
  }, [session])

  // Fetch on mount
  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

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

  // Get score badge variant based on score
  const getScoreBadgeVariant = (score: number): 'success' | 'warning' | 'destructive' => {
    if (score >= 1200) return 'success'
    if (score >= 600) return 'warning'
    return 'destructive'
  }

  // Calculate accuracy percentage (approximate based on score)
  const calculateAccuracy = (score: number): number => {
    const maxScore = 1600
    return Math.round((score / maxScore) * 100)
  }

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

  return (
    <PageHero icon={History} iconStyle="simple" title={t('history.title')}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Loading State */}
        {loading && (
          <div className="flex justify-center py-8 sm:py-12">
            <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-primary" />
          </div>
        )}

        {/* Empty State */}
        {!loading && history.length === 0 && (
          <div className="text-center py-8 sm:py-12 text-sm sm:text-base text-muted-foreground">
            {t('history.noResults')}
          </div>
        )}

        {/* History List */}
        {!loading && history.length > 0 && (
          <div className="space-y-4 sm:space-y-6">
            {/* Filters Section */}
            <Card className="bg-card/50 border-border">
              <CardHeader className="p-4 sm:p-6 pb-3 sm:pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base sm:text-lg font-bold">
                    {t('common.filters')}
                  </CardTitle>
                  <button
                    onClick={fetchHistory}
                    disabled={loading}
                    className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    title={t('common.refresh')}
                  >
                    <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0">
                <div className="flex flex-col gap-3 sm:gap-4">
                  {/* Search Bar */}
                  <div className="flex-1">
                    <input
                      type="text"
                      placeholder={t('history.searchPlaceholder')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base bg-secondary/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                    />
                  </div>

                  {/* Status Filter Buttons */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setStatusFilter('all')}
                      className={`px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg transition-all ${statusFilter === 'all'
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'bg-secondary/50 hover:bg-secondary'
                        }`}
                    >
                      {t('common.all')}
                    </button>
                    <button
                      onClick={() => setStatusFilter('completed')}
                      className={`px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg transition-all ${statusFilter === 'completed'
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'bg-secondary/50 hover:bg-secondary'
                        }`}
                    >
                      <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4 inline mr-1" />
                      {t('history.completed')}
                    </button>
                    <button
                      onClick={() => setStatusFilter('inProgress')}
                      className={`px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg transition-all ${statusFilter === 'inProgress'
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'bg-secondary/50 hover:bg-secondary'
                        }`}
                    >
                      <Clock className="w-3 h-3 sm:w-4 sm:h-4 inline mr-1 animate-pulse" />
                      {t('history.inProgress')}
                    </button>
                  </div>

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

            {/* Games List */}
            <Card className="bg-card/50 border-border">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-lg sm:text-xl font-extrabold bg-linear-to-r from-neon-purple to-neon-pink bg-clip-text text-transparent drop-shadow-lg">
                  {t('history.yourGames')}
                </CardTitle>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                  {filteredHistory.length} {filteredHistory.length === 1 ? t('history.game') : t('history.games')}
                </p>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0">
                {filteredHistory.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    {t('history.noMatchingResults')}
                  </div>
                ) : (
                  <div className="space-y-2 sm:space-y-3">
                    {filteredHistory.map((entry, index) => (
                      <motion.div
                        key={entry.sessionId}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: index * 0.05 }}
                        onClick={() => {
                          if (entry.isCompleted) {
                            navigate(`${localizedPath('/history')}/${entry.sessionId}`)
                          } else {
                            navigate(`${localizedPath('/play')}?date=${encodeURIComponent(entry.challengeDate)}`)
                          }
                        }}
                        className={`group flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg bg-secondary/50 transition-all cursor-pointer hover:bg-secondary/70 hover:scale-[1.01] hover:shadow-lg hover:ring-2 hover:ring-primary/50`}
                      >
                        {/* Left Section: Icon, Date, Status */}
                        <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                          {/* Dynamic Icon based on completion status */}
                          <div className={`w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-full flex items-center justify-center ${entry.isCompleted
                            ? 'bg-linear-to-br from-green-500 to-emerald-600'
                            : 'bg-linear-to-br from-neon-purple to-neon-pink animate-pulse'
                            }`}>
                            {entry.isCompleted ? (
                              <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                            ) : (
                              <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex flex-col gap-1">
                              <span className="text-sm sm:text-base font-semibold wrap-break-word">
                                {formatDate(entry.challengeDate)}
                              </span>
                              {!entry.isCompleted && (
                                <Badge variant="outline" className="w-fit text-xs border-neon-purple/50 bg-neon-purple/10 text-neon-purple animate-pulse">
                                  <Clock className="w-3 h-3 mr-1" />
                                  {t('history.inProgress')}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Middle Section: Additional Stats */}
                        <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Target className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            <span>{calculateAccuracy(entry.totalScore)}%</span>
                          </div>
                          {entry.isCompleted && (
                            <div className="flex items-center gap-1.5">
                              <Gamepad2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                              <span>10</span>
                            </div>
                          )}
                        </div>

                        {/* Right Section: Score & Chevron */}
                        <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0">
                          <div className="flex items-center gap-2">
                            <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                            <Badge
                              variant={getScoreBadgeVariant(entry.totalScore)}
                              className="text-base sm:text-xl font-bold px-3 sm:px-4 py-1 sm:py-1.5"
                            >
                              {entry.totalScore}
                            </Badge>
                          </div>
                          <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </PageHero>
  )
}
