import { useTranslation } from 'react-i18next'
import { m } from 'framer-motion'
import type { Locale } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trophy, Medal, Award, Loader2, Eye, Images, Timer } from 'lucide-react'
import { DatePicker } from '@/components/ui/date-picker'
import { MonthPicker } from '@/components/ui/month-picker'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'

export interface LeaderboardEntry {
  rank: number
  userId: string
  sessionId?: string
  username: string
  displayName: string
  avatarUrl?: string
  totalScore: number
  correctAnswers?: number
  avgCaptureTimeMs?: number
  completedAt?: string
}

export interface MonthlyLeaderboardEntry {
  rank: number
  userId: string
  username: string
  displayName: string
  avatarUrl?: string
  totalScore: number
  gamesPlayed: number
  correctAnswers?: number
  avgCaptureTimeMs?: number
}

export interface AchievementLeaderboardEntry {
  userId: string
  username: string
  displayName: string
  avatarUrl: string | null
  totalPoints: number
  achievementCount: number
}

const PODIUM_HEIGHTS = ['h-24', 'h-32', 'h-20']
const PODIUM_COLORS = [
  'from-medal-silver to-medal-silver/80',
  'from-medal-gold to-medal-gold/80',
  'from-medal-bronze to-medal-bronze/80',
]

function getRankIcon(rank: number) {
  switch (rank) {
    case 1:
      return <Trophy className="size-5 text-warning" />
    case 2:
      return <Medal className="size-5 text-muted-foreground" />
    case 3:
      return <Award className="size-5 text-warning" />
    default:
      return <span className="text-muted-foreground font-bold">{rank}</span>
  }
}

function LoadingState() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 className="size-8 animate-spin text-primary" />
    </div>
  )
}

function formatAvgTime(ms: number) {
  const seconds = ms / 1000
  return seconds >= 10 ? `${Math.round(seconds)}s` : `${seconds.toFixed(1)}s`
}

// Captures found + average time to find one. Hidden on mobile — the row
// variant lives in the @username subtitle line instead.
function CaptureStats({ entry }: { entry: { correctAnswers?: number; avgCaptureTimeMs?: number } }) {
  const { t } = useTranslation()
  if (entry.correctAnswers === undefined) return null
  return (
    <div className="hidden sm:flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
      <span className="flex items-center gap-1" title={t('leaderboard.capturesFound')}>
        <Images className="size-3.5" />
        {entry.correctAnswers}
      </span>
      {entry.avgCaptureTimeMs !== undefined && (
        <span className="flex items-center gap-1" title={t('leaderboard.avgCaptureTime')}>
          <Timer className="size-3.5" />
          {formatAvgTime(entry.avgCaptureTimeMs)}
        </span>
      )}
    </div>
  )
}

// Mobile fallback: same stats appended to the @username line.
function CaptureStatsInline({ entry }: { entry: { correctAnswers?: number; avgCaptureTimeMs?: number } }) {
  if (entry.correctAnswers === undefined) return null
  return (
    <span className="sm:hidden">
      {' '}· {entry.correctAnswers} <Images className="inline size-3" aria-hidden />
      {entry.avgCaptureTimeMs !== undefined && (
        <> · {formatAvgTime(entry.avgCaptureTimeMs)} <Timer className="inline size-3" aria-hidden /></>
      )}
    </span>
  )
}

export function DailyLeaderboardPanel({
  entries,
  loading,
  selectedDate,
  maxDate,
  locale,
  cardTitle,
  emptyMessage,
  onDateChange,
  onPlayerClick,
}: {
  entries: LeaderboardEntry[]
  loading: boolean
  selectedDate: Date
  maxDate: Date
  locale: Locale
  cardTitle: string
  emptyMessage: string
  onDateChange: (date: Date) => void
  onPlayerClick: (entry: LeaderboardEntry) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <div className="flex justify-center mb-8">
        <DatePicker
          value={selectedDate}
          onChange={onDateChange}
          maxDate={maxDate}
          formatStr="PPP"
          locale={locale}
        />
      </div>

      {loading && <LoadingState />}

      {!loading && entries.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">{emptyMessage}</div>
      )}

      {!loading && entries.length >= 3 && (
        <div className="flex items-end justify-center gap-2 sm:gap-4 mb-8">
          {[entries[1], entries[0], entries[2]].map((entry, displayIndex) => (
            <m.div
              key={entry.rank}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: displayIndex * 0.1 }}
              className="flex flex-col items-center"
            >
              <Avatar className="size-16 mb-2">
                <AvatarImage src={entry.avatarUrl} alt={entry.displayName} />
                <AvatarFallback className="bg-linear-to-br from-neon-purple to-neon-pink text-xl font-bold">
                  {entry.displayName[0]}
                </AvatarFallback>
              </Avatar>
              <span className="font-semibold mb-1">{entry.displayName}</span>
              <span className="text-primary font-bold">{entry.totalScore}</span>
              <div className={`w-20 ${PODIUM_HEIGHTS[displayIndex]} bg-linear-to-t ${PODIUM_COLORS[displayIndex]} rounded-t-lg mt-2 flex items-start justify-center pt-2`}>
                <span className="text-2xl font-bold text-white">{entry.rank}</span>
              </div>
            </m.div>
          ))}
        </div>
      )}

      {!loading && entries.length > 0 && (
        <Card className="bg-card/50 border-border">
          <CardHeader>
            <CardTitle>{cardTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {entries.map((entry, index) => (
                <m.div
                  key={entry.rank}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className={`flex items-center gap-3 sm:gap-4 p-3 rounded-lg bg-secondary/50 transition-colors ${
                    entry.sessionId ? 'hover:bg-secondary cursor-pointer' : 'hover:bg-secondary/70'
                  }`}
                  onClick={() => entry.sessionId && onPlayerClick(entry)}
                  title={entry.sessionId ? t('leaderboard.clickToView') : undefined}
                >
                  <div className="w-8 shrink-0 flex justify-center">{getRankIcon(entry.rank)}</div>
                  <Avatar className="size-10 shrink-0">
                    <AvatarImage src={entry.avatarUrl} alt={entry.displayName} />
                    <AvatarFallback className="bg-linear-to-br from-neon-purple to-neon-pink font-bold">
                      {entry.displayName[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{entry.displayName}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      <span>@{entry.username}</span>
                      <CaptureStatsInline entry={entry} />
                    </div>
                  </div>
                  <CaptureStats entry={entry} />
                  <div className="text-right flex items-center gap-2 shrink-0">
                    <div className="font-bold text-primary">{entry.totalScore}</div>
                    {entry.sessionId && <Eye className="size-4 text-muted-foreground" />}
                  </div>
                </m.div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}

export function MonthlyLeaderboardPanel({
  entries,
  loading,
  selectedMonth,
  maxDate,
  locale,
  cardTitle,
  onMonthChange,
}: {
  entries: MonthlyLeaderboardEntry[]
  loading: boolean
  selectedMonth: Date
  maxDate: Date
  locale: Locale
  cardTitle: string
  onMonthChange: (date: Date) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <div className="flex justify-center mb-8">
        <MonthPicker value={selectedMonth} onChange={onMonthChange} maxDate={maxDate} locale={locale} />
      </div>

      {loading && <LoadingState />}

      {!loading && entries.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">{t('leaderboard.noMonthlyData')}</div>
      )}

      {!loading && entries.length >= 3 && (
        <div className="flex items-end justify-center gap-2 sm:gap-4 mb-8">
          {[entries[1], entries[0], entries[2]].map((entry, displayIndex) => (
            <m.div
              key={entry.rank}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: displayIndex * 0.1 }}
              className="flex flex-col items-center"
            >
              <Avatar className="size-16 mb-2">
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
              <div className={`w-20 ${PODIUM_HEIGHTS[displayIndex]} bg-linear-to-t ${PODIUM_COLORS[displayIndex]} rounded-t-lg mt-2 flex items-start justify-center pt-2`}>
                <span className="text-2xl font-bold text-white">{entry.rank}</span>
              </div>
            </m.div>
          ))}
        </div>
      )}

      {!loading && entries.length > 0 && (
        <Card className="bg-card/50 border-border">
          <CardHeader>
            <CardTitle>{cardTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {entries.map((entry, index) => (
                <m.div
                  key={entry.rank}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className="flex items-center gap-3 sm:gap-4 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                >
                  <div className="w-8 shrink-0 flex justify-center">{getRankIcon(entry.rank)}</div>
                  <Avatar className="size-10 shrink-0">
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
                      <CaptureStatsInline entry={entry} />
                    </div>
                  </div>
                  <CaptureStats entry={entry} />
                  <div className="text-right shrink-0">
                    <div className="font-bold text-primary">{entry.totalScore}</div>
                  </div>
                </m.div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}

export function AchievementLeaderboardPanel({
  entries,
  loading,
}: {
  entries: AchievementLeaderboardEntry[]
  loading: boolean
}) {
  const { t } = useTranslation()
  return (
    <>
      {loading && <LoadingState />}

      {!loading && entries.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          {t('leaderboard.noAchievementData')}
        </div>
      )}

      {!loading && entries.length >= 3 && (
        <div className="flex items-end justify-center gap-2 sm:gap-4 mb-8">
          {[entries[1], entries[0], entries[2]].map((entry, displayIndex) => {
            const rank = displayIndex === 0 ? 2 : displayIndex === 1 ? 1 : 3
            return (
              <m.div
                key={entry.userId}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: displayIndex * 0.1 }}
                className="flex flex-col items-center"
              >
                <Avatar className="size-16 mb-2">
                  <AvatarImage src={entry.avatarUrl ?? undefined} alt={entry.displayName} />
                  <AvatarFallback className="bg-linear-to-br from-neon-purple to-neon-pink text-xl font-bold">
                    {entry.displayName[0]}
                  </AvatarFallback>
                </Avatar>
                <span className="font-semibold mb-1">{entry.displayName}</span>
                <Badge variant="secondary" className="mb-1">
                  {entry.achievementCount} {t('leaderboard.achievements')}
                </Badge>
                <span className="text-primary font-bold">
                  {entry.totalPoints} {t('leaderboard.points')}
                </span>
                <div className={`w-20 ${PODIUM_HEIGHTS[displayIndex]} bg-linear-to-t ${PODIUM_COLORS[displayIndex]} rounded-t-lg mt-2 flex items-start justify-center pt-2`}>
                  <span className="text-2xl font-bold text-white">{rank}</span>
                </div>
              </m.div>
            )
          })}
        </div>
      )}

      {!loading && entries.length > 0 && (
        <Card className="bg-card/50 border-border">
          <CardHeader>
            <CardTitle>{t('leaderboard.topAchievementHunters')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {entries.map((entry, index) => {
                const rank = index + 1
                return (
                  <m.div
                    key={entry.userId}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    className="flex items-center gap-3 sm:gap-4 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                  >
                    <div className="w-8 shrink-0 flex justify-center">{getRankIcon(rank)}</div>
                    <Avatar className="size-10 shrink-0">
                      <AvatarImage src={entry.avatarUrl ?? undefined} alt={entry.displayName} />
                      <AvatarFallback className="bg-linear-to-br from-neon-purple to-neon-pink font-bold">
                        {entry.displayName[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold truncate">{entry.displayName}</span>
                        <Badge variant="outline" className="text-xs shrink-0">
                          <Trophy className="size-3 mr-1" />
                          {entry.achievementCount}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">@{entry.username}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-primary">{entry.totalPoints}</div>
                      <div className="text-xs text-muted-foreground">{t('leaderboard.points')}</div>
                    </div>
                  </m.div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}
