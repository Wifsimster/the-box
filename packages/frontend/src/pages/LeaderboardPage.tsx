import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Trophy, Medal, Award, Loader2, Crown, Calendar, CalendarDays } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { DatePicker } from '@/components/ui/date-picker'
import { MonthPicker } from '@/components/ui/month-picker'

interface LeaderboardEntry {
  rank: number
  username: string
  displayName: string
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

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="w-5 h-5 text-yellow-500" />
      case 2:
        return <Medal className="w-5 h-5 text-zinc-400" />
      case 3:
        return <Award className="w-5 h-5 text-amber-600" />
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
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="daily">
              <Calendar className="w-4 h-4 mr-2" />
              {t('leaderboard.dailyScores')}
            </TabsTrigger>
            <TabsTrigger value="monthly">
              <CalendarDays className="w-4 h-4 mr-2" />
              {t('leaderboard.monthlyScores')}
            </TabsTrigger>
            <TabsTrigger value="achievements">
              <Crown className="w-4 h-4 mr-2" />
              {t('leaderboard.achievementPoints')}
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
              <div className="flex justify-center gap-4 mb-8">
                {[leaderboard[1], leaderboard[0], leaderboard[2]].map((entry, displayIndex) => {
                  // Reorder: 2nd, 1st, 3rd for visual podium effect
                  const heights = ['h-24', 'h-32', 'h-20']
                  const colors = ['from-zinc-400 to-zinc-500', 'from-yellow-400 to-yellow-600', 'from-amber-600 to-amber-700']

                  return (
                    <motion.div
                      key={entry.rank}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: displayIndex * 0.1 }}
                      className="flex flex-col items-center"
                    >
                      <div className="w-16 h-16 rounded-full bg-linear-to-br from-neon-purple to-neon-pink flex items-center justify-center text-xl font-bold mb-2">
                        {entry.displayName[0]}
                      </div>
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
                        className="flex items-center gap-4 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                      >
                        <div className="w-8 flex justify-center">
                          {getRankIcon(entry.rank)}
                        </div>
                        <div className="w-10 h-10 rounded-full bg-linear-to-br from-neon-purple to-neon-pink flex items-center justify-center font-bold">
                          {entry.displayName[0]}
                        </div>
                        <div className="flex-1">
                          <span className="font-semibold">{entry.displayName}</span>
                          <span className="text-xs text-muted-foreground ml-2">@{entry.username}</span>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-primary">{entry.totalScore}</div>
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
              <div className="flex justify-center gap-4 mb-8">
                {[monthlyLeaderboard[1], monthlyLeaderboard[0], monthlyLeaderboard[2]].map((entry, displayIndex) => {
                  // Reorder: 2nd, 1st, 3rd for visual podium effect
                  const heights = ['h-24', 'h-32', 'h-20']
                  const colors = ['from-zinc-400 to-zinc-500', 'from-yellow-400 to-yellow-600', 'from-amber-600 to-amber-700']

                  return (
                    <motion.div
                      key={entry.rank}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: displayIndex * 0.1 }}
                      className="flex flex-col items-center"
                    >
                      <div className="w-16 h-16 rounded-full bg-linear-to-br from-neon-purple to-neon-pink flex items-center justify-center text-xl font-bold mb-2">
                        {entry.displayName[0]}
                      </div>
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
                        className="flex items-center gap-4 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                      >
                        <div className="w-8 flex justify-center">
                          {getRankIcon(entry.rank)}
                        </div>
                        <div className="w-10 h-10 rounded-full bg-linear-to-br from-neon-purple to-neon-pink flex items-center justify-center font-bold">
                          {entry.displayName[0]}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{entry.displayName}</span>
                            <Badge variant="outline" className="text-xs">
                              {entry.gamesPlayed} {t('leaderboard.gamesPlayed')}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">@{entry.username}</span>
                        </div>
                        <div className="text-right">
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
              <div className="flex justify-center gap-4 mb-8">
                {[achievementLeaderboard[1], achievementLeaderboard[0], achievementLeaderboard[2]].map((entry, displayIndex) => {
                  // Reorder: 2nd, 1st, 3rd for visual podium effect
                  const heights = ['h-24', 'h-32', 'h-20']
                  const colors = ['from-zinc-400 to-zinc-500', 'from-yellow-400 to-yellow-600', 'from-amber-600 to-amber-700']
                  const rank = displayIndex === 0 ? 2 : displayIndex === 1 ? 1 : 3

                  return (
                    <motion.div
                      key={entry.userId}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: displayIndex * 0.1 }}
                      className="flex flex-col items-center"
                    >
                      <div className="w-16 h-16 rounded-full bg-linear-to-br from-neon-purple to-neon-pink flex items-center justify-center text-xl font-bold mb-2">
                        {entry.displayName[0]}
                      </div>
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
                          className="flex items-center gap-4 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                        >
                          <div className="w-8 flex justify-center">
                            {getRankIcon(rank)}
                          </div>
                          <div className="w-10 h-10 rounded-full bg-linear-to-br from-neon-purple to-neon-pink flex items-center justify-center font-bold">
                            {entry.displayName[0]}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{entry.displayName}</span>
                              <Badge variant="outline" className="text-xs">
                                <Trophy className="w-3 h-3 mr-1" />
                                {entry.achievementCount}
                              </Badge>
                            </div>
                            <span className="text-xs text-muted-foreground">@{entry.username}</span>
                          </div>
                          <div className="text-right">
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
      </div>
    </PageHero>
  )
}
