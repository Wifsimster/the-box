import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Trophy, Medal, Award, Loader2, Crown, Calendar, CalendarDays, Check, X, Eye, Minus, Clock } from 'lucide-react'
import { formatDiscoveryTime } from '@/lib/utils'
import { PageHero } from '@/components/layout/PageHero'
import { DatePicker } from '@/components/ui/date-picker'
import { MonthPicker } from '@/components/ui/month-picker'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { GuessAttemptsList } from '@/components/game/GuessAttemptsList'
import type { GameSessionDetailsResponse } from '@the-box/types'

interface LeaderboardEntry {
  rank: number
  userId: string
  sessionId?: string
  username: string
  displayName: string
  avatarUrl?: string
  totalScore: number
  completedAt?: string
}

interface MonthlyLeaderboardEntry {
  rank: number
  userId: string
  username: string
  displayName: string
  avatarUrl?: string
  totalScore: number
  gamesPlayed: number
}

interface AchievementLeaderboardEntry {
  userId: string
  username: string
  displayName: string
  avatarUrl: string | null
  totalPoints: number
  achievementCount: number
}

export default function LeaderboardPage() {
  const { t, i18n } = useTranslation()
  const [searchParams] = useSearchParams()
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [monthlyLeaderboard, setMonthlyLeaderboard] = useState<MonthlyLeaderboardEntry[]>([])
  const [achievementLeaderboard, setAchievementLeaderboard] = useState<AchievementLeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [monthlyLoading, setMonthlyLoading] = useState(false)
  const [achievementLoading, setAchievementLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('daily')
  const [selectedPlayer, setSelectedPlayer] = useState<LeaderboardEntry | null>(null)
  const [playerSession, setPlayerSession] = useState<GameSessionDetailsResponse | null>(null)
  const [sessionLoading, setSessionLoading] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Parse date from URL query param if present
  const getInitialDate = (): Date => {
    const dateParam = searchParams.get('date')
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      const parsed = new Date(dateParam + 'T00:00:00')
      if (!isNaN(parsed.getTime()) && parsed <= today) {
        return parsed
      }
    }
    return today
  }

  const [selectedDate, setSelectedDate] = useState<Date>(getInitialDate)
  const [selectedMonth, setSelectedMonth] = useState<Date>(today)

  const formatDateForApi = (date: Date) => {
    return format(date, 'yyyy-MM-dd')
  }

  const getDateLocale = () => {
    return i18n.language === 'fr' ? fr : enUS
  }

  const isToday = (date: Date) => {
    const todayStr = formatDateForApi(today)
    const dateStr = formatDateForApi(date)
    return todayStr === dateStr
  }

  useEffect(() => {
    setLoading(true)
    const dateStr = formatDateForApi(selectedDate)
    fetch(`/api/leaderboard/${dateStr}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data?.entries) {
          setLeaderboard(data.data.entries)
        } else {
          setLeaderboard([])
        }
      })
      .catch(() => {
        setLeaderboard([])
      })
      .finally(() => {
        setLoading(false)
      })
  }, [selectedDate])

  // Fetch achievement leaderboard (once, not date-dependent)
  useEffect(() => {
    setAchievementLoading(true)
    fetch('/api/achievements/leaderboard')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          setAchievementLeaderboard(data.data)
        } else {
          setAchievementLeaderboard([])
        }
      })
      .catch(() => {
        setAchievementLeaderboard([])
      })
      .finally(() => {
        setAchievementLoading(false)
      })
  }, [])

  // Fetch monthly leaderboard when monthly tab is active or month changes
  useEffect(() => {
    if (activeTab !== 'monthly') return

    setMonthlyLoading(true)
    const year = selectedMonth.getFullYear()
    const month = selectedMonth.getMonth() + 1 // getMonth() returns 0-11, API expects 1-12

    fetch(`/api/leaderboard/monthly/${year}/${month}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data?.entries) {
          setMonthlyLeaderboard(data.data.entries)
        } else {
          setMonthlyLeaderboard([])
        }
      })
      .catch(() => {
        setMonthlyLeaderboard([])
      })
      .finally(() => {
        setMonthlyLoading(false)
      })
  }, [activeTab, selectedMonth])

  const handleDateChange = (date: Date) => {
    setSelectedDate(date)
  }

  const handleMonthChange = (date: Date) => {
    setSelectedMonth(date)
  }

  const handlePlayerClick = useCallback(async (entry: LeaderboardEntry) => {
    if (!entry.sessionId) return

    setSelectedPlayer(entry)
    setSessionLoading(true)
    setSessionError(null)
    setPlayerSession(null)

    try {
      const res = await fetch(`/api/leaderboard/session/${entry.sessionId}`)
      const data = await res.json()
      if (data.success && data.data) {
        setPlayerSession(data.data)
      } else if (data.error?.code === 'TODAY_CHALLENGE_NOT_COMPLETED') {
        setSessionError(t('leaderboard.todayLocked'))
      } else {
        setSessionError(t('leaderboard.errorLoading'))
      }
    } catch {
      setSessionError(t('leaderboard.errorLoading'))
    } finally {
      setSessionLoading(false)
    }
  }, [t])

  const handleCloseDialog = useCallback(() => {
    setSelectedPlayer(null)
    setPlayerSession(null)
    setSessionError(null)
  }, [])

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="w-5 h-5 text-warning" />
      case 2:
        return <Medal className="w-5 h-5 text-muted-foreground" />
      case 3:
        return <Award className="w-5 h-5 text-warning" />
      default:
        return <span className="text-muted-foreground font-bold">{rank}</span>
    }
  }

  const getCardTitle = () => {
    if (isToday(selectedDate)) {
      return t('leaderboard.today')
    }
    return format(selectedDate, 'PPP', { locale: getDateLocale() })
  }

  const getMonthlyCardTitle = () => {
    return format(selectedMonth, 'MMMM yyyy', { locale: getDateLocale() })
  }

  return (
    <PageHero icon={Trophy} iconStyle="simple" title={t('leaderboard.title')}>
      <div className="max-w-4xl mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6 h-auto sm:h-10 p-1 gap-1">
            <TabsTrigger
              value="daily"
              className="flex-col sm:flex-row gap-1 sm:gap-0 px-1.5 sm:px-3 py-2 sm:py-1.5 text-[11px] sm:text-sm h-auto"
            >
              <Calendar className="w-4 h-4 sm:mr-2 shrink-0" />
              <span className="truncate max-w-full">{t('leaderboard.dailyScores')}</span>
            </TabsTrigger>
            <TabsTrigger
              value="monthly"
              className="flex-col sm:flex-row gap-1 sm:gap-0 px-1.5 sm:px-3 py-2 sm:py-1.5 text-[11px] sm:text-sm h-auto"
            >
              <CalendarDays className="w-4 h-4 sm:mr-2 shrink-0" />
              <span className="truncate max-w-full">{t('leaderboard.monthlyScores')}</span>
            </TabsTrigger>
            <TabsTrigger
              value="achievements"
              className="flex-col sm:flex-row gap-1 sm:gap-0 px-1.5 sm:px-3 py-2 sm:py-1.5 text-[11px] sm:text-sm h-auto"
            >
              <Crown className="w-4 h-4 sm:mr-2 shrink-0" />
              <span className="truncate max-w-full">{t('leaderboard.achievementPoints')}</span>
            </TabsTrigger>
          </TabsList>

          {/* Daily Score Leaderboard */}
          <TabsContent value="daily">
            {/* Date Picker */}
            <div className="flex justify-center mb-8">
              <DatePicker
                value={selectedDate}
                onChange={handleDateChange}
                maxDate={today}
                formatStr="PPP"
                locale={getDateLocale()}
              />
            </div>

            {/* Loading State */}
            {loading && (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}

            {/* Empty State */}
            {!loading && leaderboard.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                {isToday(selectedDate)
                  ? t('leaderboard.noResults')
                  : t('leaderboard.noDataForDate')
                }
              </div>
            )}

            {/* Top 3 Podium */}
            {!loading && leaderboard.length >= 3 && (
              <div className="flex justify-center gap-2 sm:gap-4 mb-8">
                {[leaderboard[1], leaderboard[0], leaderboard[2]].map((entry, displayIndex) => {
                  // Reorder: 2nd, 1st, 3rd for visual podium effect
                  const heights = ['h-24', 'h-32', 'h-20']
                  const colors = ['from-medal-silver to-medal-silver/80', 'from-medal-gold to-medal-gold/80', 'from-medal-bronze to-medal-bronze/80']

                  return (
                    <motion.div
                      key={entry.rank}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: displayIndex * 0.1 }}
                      className="flex flex-col items-center"
                    >
                      <Avatar className="w-16 h-16 mb-2">
                        <AvatarImage src={entry.avatarUrl} alt={entry.displayName} />
                        <AvatarFallback className="bg-linear-to-br from-neon-purple to-neon-pink text-xl font-bold">
                          {entry.displayName[0]}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-semibold mb-1">{entry.displayName}</span>
                      <span className="text-primary font-bold">{entry.totalScore}</span>
                      <div className={`w-20 ${heights[displayIndex]} bg-linear-to-t ${colors[displayIndex]} rounded-t-lg mt-2 flex items-start justify-center pt-2`}>
                        <span className="text-2xl font-bold text-white">{entry.rank}</span>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}

            {/* Full Leaderboard Table */}
            {!loading && leaderboard.length > 0 && (
              <Card className="bg-card/50 border-border">
                <CardHeader>
                  <CardTitle>{getCardTitle()}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {leaderboard.map((entry, index) => (
                      <motion.div
                        key={entry.rank}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: index * 0.05 }}
                        className={`flex items-center gap-3 sm:gap-4 p-3 rounded-lg bg-secondary/50 transition-colors ${
                          entry.sessionId ? 'hover:bg-secondary cursor-pointer' : 'hover:bg-secondary/70'
                        }`}
                        onClick={() => entry.sessionId && handlePlayerClick(entry)}
                        title={entry.sessionId ? t('leaderboard.clickToView') : undefined}
                      >
                        <div className="w-8 shrink-0 flex justify-center">
                          {getRankIcon(entry.rank)}
                        </div>
                        <Avatar className="w-10 h-10 shrink-0">
                          <AvatarImage src={entry.avatarUrl} alt={entry.displayName} />
                          <AvatarFallback className="bg-linear-to-br from-neon-purple to-neon-pink font-bold">
                            {entry.displayName[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold truncate">{entry.displayName}</div>
                          <div className="text-xs text-muted-foreground truncate">@{entry.username}</div>
                        </div>
                        <div className="text-right flex items-center gap-2 shrink-0">
                          <div className="font-bold text-primary">{entry.totalScore}</div>
                          {entry.sessionId && (
                            <Eye className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Monthly Score Leaderboard */}
          <TabsContent value="monthly">
            {/* Month Picker */}
            <div className="flex justify-center mb-8">
              <MonthPicker
                value={selectedMonth}
                onChange={handleMonthChange}
                maxDate={today}
                locale={getDateLocale()}
              />
            </div>

            {/* Loading State */}
            {monthlyLoading && (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}

            {/* Empty State */}
            {!monthlyLoading && monthlyLeaderboard.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                {t('leaderboard.noMonthlyData')}
              </div>
            )}

            {/* Top 3 Podium */}
            {!monthlyLoading && monthlyLeaderboard.length >= 3 && (
              <div className="flex justify-center gap-2 sm:gap-4 mb-8">
                {[monthlyLeaderboard[1], monthlyLeaderboard[0], monthlyLeaderboard[2]].map((entry, displayIndex) => {
                  // Reorder: 2nd, 1st, 3rd for visual podium effect
                  const heights = ['h-24', 'h-32', 'h-20']
                  const colors = ['from-medal-silver to-medal-silver/80', 'from-medal-gold to-medal-gold/80', 'from-medal-bronze to-medal-bronze/80']

                  return (
                    <motion.div
                      key={entry.rank}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: displayIndex * 0.1 }}
                      className="flex flex-col items-center"
                    >
                      <Avatar className="w-16 h-16 mb-2">
                        <AvatarImage src={entry.avatarUrl} alt={entry.displayName} />
                        <AvatarFallback className="bg-linear-to-br from-neon-purple to-neon-pink text-xl font-bold">
                          {entry.displayName[0]}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-semibold mb-1">{entry.displayName}</span>
                      <Badge variant="secondary" className="mb-1">
                        {entry.gamesPlayed} {t('leaderboard.gamesPlayed')}
                      </Badge>
                      <span className="text-primary font-bold">{entry.totalScore}</span>
                      <div className={`w-20 ${heights[displayIndex]} bg-linear-to-t ${colors[displayIndex]} rounded-t-lg mt-2 flex items-start justify-center pt-2`}>
                        <span className="text-2xl font-bold text-white">{entry.rank}</span>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}

            {/* Full Monthly Leaderboard Table */}
            {!monthlyLoading && monthlyLeaderboard.length > 0 && (
              <Card className="bg-card/50 border-border">
                <CardHeader>
                  <CardTitle>{getMonthlyCardTitle()}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {monthlyLeaderboard.map((entry, index) => (
                      <motion.div
                        key={entry.rank}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: index * 0.05 }}
                        className="flex items-center gap-3 sm:gap-4 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                      >
                        <div className="w-8 shrink-0 flex justify-center">
                          {getRankIcon(entry.rank)}
                        </div>
                        <Avatar className="w-10 h-10 shrink-0">
                          <AvatarImage src={entry.avatarUrl} alt={entry.displayName} />
                          <AvatarFallback className="bg-linear-to-br from-neon-purple to-neon-pink font-bold">
                            {entry.displayName[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-semibold truncate">{entry.displayName}</span>
                            <Badge variant="outline" className="text-xs shrink-0 hidden sm:inline-flex">
                              {entry.gamesPlayed} {t('leaderboard.gamesPlayed')}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            <span>@{entry.username}</span>
                            <span className="sm:hidden"> · {entry.gamesPlayed} {t('leaderboard.gamesPlayed')}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-primary">{entry.totalScore}</div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Achievement Points Leaderboard */}
          <TabsContent value="achievements">
            {/* Loading State */}
            {achievementLoading && (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}

            {/* Empty State */}
            {!achievementLoading && achievementLeaderboard.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                {t('leaderboard.noAchievementData')}
              </div>
            )}

            {/* Top 3 Podium */}
            {!achievementLoading && achievementLeaderboard.length >= 3 && (
              <div className="flex justify-center gap-2 sm:gap-4 mb-8">
                {[achievementLeaderboard[1], achievementLeaderboard[0], achievementLeaderboard[2]].map((entry, displayIndex) => {
                  // Reorder: 2nd, 1st, 3rd for visual podium effect
                  const heights = ['h-24', 'h-32', 'h-20']
                  const colors = ['from-medal-silver to-medal-silver/80', 'from-medal-gold to-medal-gold/80', 'from-medal-bronze to-medal-bronze/80']
                  const rank = displayIndex === 0 ? 2 : displayIndex === 1 ? 1 : 3

                  return (
                    <motion.div
                      key={entry.userId}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: displayIndex * 0.1 }}
                      className="flex flex-col items-center"
                    >
                      <Avatar className="w-16 h-16 mb-2">
                        <AvatarImage src={entry.avatarUrl ?? undefined} alt={entry.displayName} />
                        <AvatarFallback className="bg-linear-to-br from-neon-purple to-neon-pink text-xl font-bold">
                          {entry.displayName[0]}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-semibold mb-1">{entry.displayName}</span>
                      <Badge variant="secondary" className="mb-1">
                        {entry.achievementCount} {t('leaderboard.achievements')}
                      </Badge>
                      <span className="text-primary font-bold">{entry.totalPoints} {t('leaderboard.points')}</span>
                      <div className={`w-20 ${heights[displayIndex]} bg-linear-to-t ${colors[displayIndex]} rounded-t-lg mt-2 flex items-start justify-center pt-2`}>
                        <span className="text-2xl font-bold text-white">{rank}</span>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}

            {/* Full Achievement Leaderboard */}
            {!achievementLoading && achievementLeaderboard.length > 0 && (
              <Card className="bg-card/50 border-border">
                <CardHeader>
                  <CardTitle>{t('leaderboard.topAchievementHunters')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {achievementLeaderboard.map((entry, index) => {
                      const rank = index + 1
                      return (
                        <motion.div
                          key={entry.userId}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.3, delay: index * 0.05 }}
                          className="flex items-center gap-3 sm:gap-4 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                        >
                          <div className="w-8 shrink-0 flex justify-center">
                            {getRankIcon(rank)}
                          </div>
                          <Avatar className="w-10 h-10 shrink-0">
                            <AvatarImage src={entry.avatarUrl ?? undefined} alt={entry.displayName} />
                            <AvatarFallback className="bg-linear-to-br from-neon-purple to-neon-pink font-bold">
                              {entry.displayName[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-semibold truncate">{entry.displayName}</span>
                              <Badge variant="outline" className="text-xs shrink-0">
                                <Trophy className="w-3 h-3 mr-1" />
                                {entry.achievementCount}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground truncate">@{entry.username}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-bold text-primary">{entry.totalPoints}</div>
                            <div className="text-xs text-muted-foreground">{t('leaderboard.points')}</div>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Player Answers Dialog */}
        <ResponsiveDialog open={!!selectedPlayer} onOpenChange={(open) => !open && handleCloseDialog()}>
          <ResponsiveDialogContent className="sm:max-w-2xl">
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle className="flex items-center gap-3 min-w-0 pr-8">
                {selectedPlayer && (
                  <>
                    <Avatar className="w-8 h-8 shrink-0">
                      <AvatarImage src={selectedPlayer.avatarUrl} alt={selectedPlayer.displayName} />
                      <AvatarFallback className="bg-linear-to-br from-neon-purple to-neon-pink text-sm font-bold">
                        {selectedPlayer.displayName[0]}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">
                      {t('leaderboard.playerAnswers', { name: selectedPlayer.displayName })}
                    </span>
                  </>
                )}
              </ResponsiveDialogTitle>
            </ResponsiveDialogHeader>

            {sessionLoading && (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}

            {sessionError && (
              <div className="text-center py-8 text-destructive">
                {sessionError}
              </div>
            )}

            {playerSession && !sessionLoading && (
              <div className="space-y-4 min-w-0">
                {/* Summary */}
                <div className="flex justify-between items-center gap-3 p-3 bg-secondary/50 rounded-lg">
                  <span className="text-muted-foreground truncate">{t('game.totalScore')}</span>
                  <span className="font-bold text-primary text-xl shrink-0">{playerSession.totalScore}</span>
                </div>

                {/* Guesses List — merged and sorted by position ascending */}
                <div className="space-y-2">
                  {[
                    ...playerSession.guesses.map((guess) => ({ kind: 'guess' as const, position: guess.position, guess })),
                    ...playerSession.unfoundGames.map((unfound) => ({ kind: 'unfound' as const, position: unfound.position, unfound })),
                  ]
                    .sort((a, b) => a.position - b.position)
                    .map((item) =>
                      item.kind === 'guess' ? (
                        <div
                          key={`guess-${item.position}`}
                          className={`flex items-center gap-3 p-3 rounded-lg ${
                            item.guess.isCorrect ? 'bg-success/10 border border-success/20' : 'bg-error/10 border border-error/20'
                          }`}
                        >
                          <div className="w-8 h-8 shrink-0 rounded-full bg-secondary flex items-center justify-center text-sm font-bold">
                            {item.position}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{item.guess.correctGame.name}</div>
                            {item.guess.attempts && item.guess.attempts.length > 0 ? (
                              <>
                                <span className="text-xs text-muted-foreground block mt-0.5">
                                  {t('game.attempts.count', { count: item.guess.attempts.length })}
                                </span>
                                <GuessAttemptsList attempts={item.guess.attempts} compact />
                              </>
                            ) : item.guess.userGuess ? (
                              <div className="text-sm text-muted-foreground truncate">
                                {t('game.yourGuess')}: {item.guess.userGuess}
                              </div>
                            ) : null}
                            {item.guess.isCorrect && item.guess.timeTakenMs > 0 && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />
                                <span>{t('game.discoveryTime', { time: formatDiscoveryTime(item.guess.timeTakenMs) })}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {item.guess.isCorrect ? (
                              <>
                                <span className="text-success font-bold">+{item.guess.scoreEarned}</span>
                                <Check className="w-5 h-5 text-success" />
                              </>
                            ) : (
                              <X className="w-5 h-5 text-error" />
                            )}
                          </div>
                        </div>
                      ) : (
                        <div
                          key={`unfound-${item.position}`}
                          className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border"
                        >
                          <div className="w-8 h-8 shrink-0 rounded-full bg-secondary flex items-center justify-center text-sm font-bold">
                            {item.position}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate text-muted-foreground">{item.unfound.game.name}</div>
                            <div className="text-sm text-muted-foreground">{t('leaderboard.skipped')}</div>
                          </div>
                          <Minus className="w-5 h-5 shrink-0 text-muted-foreground" />
                        </div>
                      )
                    )}
                </div>
              </div>
            )}
          </ResponsiveDialogContent>
        </ResponsiveDialog>
      </div>
    </PageHero>
  )
}
