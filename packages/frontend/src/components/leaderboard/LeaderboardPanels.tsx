import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { m } from 'framer-motion'
import type { Locale } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Trophy, Medal, Award, Images, Timer, ChevronRight, Users, type LucideIcon } from 'lucide-react'
import { DatePicker } from '@/components/ui/date-picker'
import { MonthPicker } from '@/components/ui/month-picker'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { useReducedMotionSafe } from '@/hooks/useReducedMotionSafe'
import { cn } from '@/lib/utils'

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

const PODIUM_HEIGHTS = ['h-16 sm:h-24', 'h-24 sm:h-32', 'h-12 sm:h-20']
const PODIUM_COLORS = [
  'from-medal-silver to-medal-silver/80',
  'from-medal-gold to-medal-gold/80',
  'from-medal-bronze to-medal-bronze/80',
]

const rowDomId = (userId: string) => `leaderboard-row-${userId}`

function RankCell({ rank }: { rank: number }) {
  let icon: ReactNode = null
  if (rank === 1) icon = <Trophy className="size-5 text-medal-gold" aria-hidden="true" />
  else if (rank === 2) icon = <Medal className="size-5 text-medal-silver" aria-hidden="true" />
  else if (rank === 3) icon = <Award className="size-5 text-medal-bronze" aria-hidden="true" />

  return (
    <div className="w-7 shrink-0 flex justify-center tabular-nums">
      {icon ? (
        <>
          {icon}
          <span className="sr-only">#{rank}</span>
        </>
      ) : (
        <span className="text-sm font-bold text-muted-foreground">{rank}</span>
      )}
    </div>
  )
}

function PlayerAvatar({
  src,
  name,
  className,
}: {
  src?: string | null
  name: string
  className?: string
}) {
  return (
    <Avatar className={cn('size-10 shrink-0', className)}>
      <AvatarImage src={src ?? undefined} alt="" />
      <AvatarFallback className="bg-linear-to-br from-neon-purple to-neon-pink font-bold text-white">
        {name[0]?.toUpperCase()}
      </AvatarFallback>
    </Avatar>
  )
}

function formatAvgTime(ms: number) {
  const seconds = ms / 1000
  return seconds >= 10 ? `${Math.round(seconds)}s` : `${seconds.toFixed(1)}s`
}

function CaptureStats({ entry }: { entry: { correctAnswers?: number; avgCaptureTimeMs?: number } }) {
  const { t } = useTranslation()
  if (entry.correctAnswers === undefined) return null
  return (
    <>
      <span aria-hidden="true"> · </span>
      <span className="inline-flex items-center gap-0.5">
        <Images className="size-3" aria-hidden="true" />
        <span className="sr-only">{t('leaderboard.capturesFound')}:</span>
        {entry.correctAnswers}
      </span>
      {entry.avgCaptureTimeMs !== undefined && (
        <>
          <span aria-hidden="true"> · </span>
          <span className="inline-flex items-center gap-0.5">
            <Timer className="size-3" aria-hidden="true" />
            <span className="sr-only">{t('leaderboard.avgCaptureTime')}:</span>
            {formatAvgTime(entry.avgCaptureTimeMs)}
          </span>
        </>
      )}
    </>
  )
}

interface RowData {
  key: string
  userId: string
  rank: number
  displayName: string
  username: string
  avatarUrl?: string | null
  score: number
  meta?: ReactNode
  scoreSuffix?: string
  actionLabel?: string
}

function LeaderboardList({
  rows,
  currentUserId,
  onRowClick,
}: {
  rows: RowData[]
  currentUserId?: string | null
  onRowClick?: (index: number) => void
}) {
  const { t } = useTranslation()
  const reducedMotion = useReducedMotionSafe()

  return (
    <ol className="space-y-2 list-none">
      {rows.map((row, index) => {
        const isMe = !!currentUserId && row.userId === currentUserId
        const actionLabel = row.actionLabel
        const interactive = !!onRowClick && !!actionLabel
        const content = (
          <>
            <RankCell rank={row.rank} />
            <PlayerAvatar src={row.avatarUrl} name={row.displayName} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-semibold truncate">{row.displayName}</span>
                {isMe && (
                  <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                    {t('leaderboard.you')}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                <span>@{row.username}</span>
                {row.meta}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-bold text-primary tabular-nums">{row.score.toLocaleString()}</div>
              {row.scoreSuffix && (
                <div className="text-xs text-muted-foreground">{row.scoreSuffix}</div>
              )}
            </div>
            {interactive && (
              <>
                <span className="sr-only">{actionLabel}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </>
            )}
          </>
        )
        const rowClass = cn(
          'flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors',
          isMe ? 'bg-primary/10 ring-1 ring-primary/40' : 'bg-secondary/50',
        )

        return (
          <m.li
            key={row.key}
            id={rowDomId(row.userId)}
            initial={reducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: Math.min(index, 10) * 0.03 }}
            aria-current={isMe ? 'true' : undefined}
            className="scroll-mt-24"
          >
            {interactive ? (
              <button
                type="button"
                onClick={() => onRowClick(index)}
                className={cn(
                  rowClass,
                  'min-h-14 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                {content}
              </button>
            ) : (
              <div className={rowClass}>{content}</div>
            )}
          </m.li>
        )
      })}
    </ol>
  )
}

interface PodiumData {
  key: string
  rank: number
  displayName: string
  avatarUrl?: string | null
  scoreText: string
}

// Purely decorative recap of the top three — the ranked list below carries
// the same data for assistive tech, so the podium is hidden from it.
function Podium({ entries }: { entries: PodiumData[] }) {
  const reducedMotion = useReducedMotionSafe()
  if (entries.length < 3) return null
  return (
    <div className="flex items-end justify-center gap-2 sm:gap-4 mb-6 sm:mb-8" aria-hidden="true">
      {[entries[1], entries[0], entries[2]].map((entry, displayIndex) => (
        <m.div
          key={entry.key}
          initial={reducedMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: displayIndex * 0.1 }}
          className="flex w-24 sm:w-28 min-w-0 flex-col items-center"
        >
          <PlayerAvatar
            src={entry.avatarUrl}
            name={entry.displayName}
            className="size-12 sm:size-16 mb-1.5 text-lg sm:text-xl"
          />
          <span className="w-full truncate text-center text-sm font-semibold">{entry.displayName}</span>
          <span className="text-sm font-bold text-primary tabular-nums">{entry.scoreText}</span>
          <div
            className={cn(
              'mt-1.5 flex w-full items-start justify-center rounded-t-lg bg-linear-to-t pt-1.5',
              PODIUM_HEIGHTS[displayIndex],
              PODIUM_COLORS[displayIndex],
            )}
          >
            <span className="text-xl sm:text-2xl font-bold text-white">{entry.rank}</span>
          </div>
        </m.div>
      ))}
    </div>
  )
}

function ListSkeleton() {
  const { t } = useTranslation()
  return (
    <div aria-busy="true" className="space-y-2">
      <span className="sr-only" role="status">{t('leaderboard.loading')}</span>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg bg-secondary/30 p-3">
          <Skeleton className="size-5" variant="circular" />
          <Skeleton className="size-10" variant="circular" />
          <div className="flex-1 space-y-1.5">
            <Skeleton variant="text" className="h-4 w-32" />
            <Skeleton variant="text" className="h-3 w-20" />
          </div>
          <Skeleton className="h-5 w-12" />
        </div>
      ))}
    </div>
  )
}

function EmptyState({ icon: Icon = Users, message, action }: { icon?: LucideIcon; message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <Icon className="size-10 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm sm:text-base text-muted-foreground max-w-xs">{message}</p>
      {action}
    </div>
  )
}

function YourRank({ rank, total, userId }: { rank: number; total: number; userId: string }) {
  const { t } = useTranslation()
  const reducedMotion = useReducedMotionSafe()
  const jump = () => {
    const el = document.getElementById(rowDomId(userId))
    el?.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' })
    el?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true })
  }
  return (
    <button
      type="button"
      onClick={jump}
      className="mb-4 flex w-full min-h-11 items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-left text-sm transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="font-semibold text-foreground">
        {t('leaderboard.yourRank', { rank, total })}
      </span>
      <span className="flex items-center gap-1 text-primary">
        {t('leaderboard.seeMyRow')}
        <ChevronRight className="size-4" aria-hidden="true" />
      </span>
    </button>
  )
}

function Board({
  title,
  rows,
  podium,
  currentUserId,
  onRowClick,
}: {
  title: string
  rows: RowData[]
  podium: PodiumData[]
  currentUserId?: string | null
  onRowClick?: (index: number) => void
}) {
  const me = currentUserId ? rows.find((r) => r.userId === currentUserId) : undefined
  return (
    <>
      <Podium entries={podium} />
      {me && <YourRank rank={me.rank} total={rows.length} userId={me.userId} />}
      <Card className="bg-card/50">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="px-2 sm:px-(--card-padding)">
          <LeaderboardList
            rows={rows}
            currentUserId={currentUserId}
            onRowClick={onRowClick}
          />
        </CardContent>
      </Card>
    </>
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
  emptyAction,
  currentUserId,
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
  emptyAction?: ReactNode
  currentUserId?: string | null
  onDateChange: (date: Date) => void
  onPlayerClick: (entry: LeaderboardEntry) => void
}) {
  const { t } = useTranslation()
  const rows: RowData[] = entries.map((e) => ({
    key: `${e.rank}-${e.userId}`,
    userId: e.userId,
    rank: e.rank,
    displayName: e.displayName,
    username: e.username,
    avatarUrl: e.avatarUrl,
    score: e.totalScore,
    meta: <CaptureStats entry={e} />,
    actionLabel: e.sessionId ? t('leaderboard.playerAnswers', { name: e.displayName }) : undefined,
  }))
  return (
    <>
      <div className="flex justify-center mb-6">
        <DatePicker
          value={selectedDate}
          onChange={onDateChange}
          maxDate={maxDate}
          formatStr="PPP"
          locale={locale}
          className="w-full sm:w-auto"
        />
      </div>

      {loading && <ListSkeleton />}

      {!loading && entries.length === 0 && (
        <EmptyState icon={Trophy} message={emptyMessage} action={emptyAction} />
      )}

      {!loading && entries.length > 0 && (
        <Board
          title={cardTitle}
          rows={rows}
          podium={entries.slice(0, 3).map((e) => ({
            key: e.userId,
            rank: e.rank,
            displayName: e.displayName,
            avatarUrl: e.avatarUrl,
            scoreText: e.totalScore.toLocaleString(),
          }))}
          currentUserId={currentUserId}
          onRowClick={(index) => onPlayerClick(entries[index])}
        />
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
  currentUserId,
  onMonthChange,
}: {
  entries: MonthlyLeaderboardEntry[]
  loading: boolean
  selectedMonth: Date
  maxDate: Date
  locale: Locale
  cardTitle: string
  currentUserId?: string | null
  onMonthChange: (date: Date) => void
}) {
  const { t } = useTranslation()
  const rows: RowData[] = entries.map((e) => ({
    key: `${e.rank}-${e.userId}`,
    userId: e.userId,
    rank: e.rank,
    displayName: e.displayName,
    username: e.username,
    avatarUrl: e.avatarUrl,
    score: e.totalScore,
    meta: (
      <>
        <span aria-hidden="true"> · </span>
        {e.gamesPlayed} {t('leaderboard.gamesPlayed')}
        <CaptureStats entry={e} />
      </>
    ),
  }))
  return (
    <>
      <div className="flex justify-center mb-6">
        <MonthPicker value={selectedMonth} onChange={onMonthChange} maxDate={maxDate} locale={locale} />
      </div>

      {loading && <ListSkeleton />}

      {!loading && entries.length === 0 && (
        <EmptyState icon={Trophy} message={t('leaderboard.noMonthlyData')} />
      )}

      {!loading && entries.length > 0 && (
        <Board
          title={cardTitle}
          rows={rows}
          podium={entries.slice(0, 3).map((e) => ({
            key: e.userId,
            rank: e.rank,
            displayName: e.displayName,
            avatarUrl: e.avatarUrl,
            scoreText: e.totalScore.toLocaleString(),
          }))}
          currentUserId={currentUserId}
        />
      )}
    </>
  )
}

export function AchievementLeaderboardPanel({
  entries,
  loading,
  currentUserId,
}: {
  entries: AchievementLeaderboardEntry[]
  loading: boolean
  currentUserId?: string | null
}) {
  const { t } = useTranslation()
  const rows: RowData[] = entries.map((e, index) => ({
    key: e.userId,
    userId: e.userId,
    rank: index + 1,
    displayName: e.displayName,
    username: e.username,
    avatarUrl: e.avatarUrl,
    score: e.totalPoints,
    scoreSuffix: t('leaderboard.points'),
    meta: (
      <>
        <span aria-hidden="true"> · </span>
        {e.achievementCount} {t('leaderboard.achievements')}
      </>
    ),
  }))
  return (
    <>
      {loading && <ListSkeleton />}

      {!loading && entries.length === 0 && (
        <EmptyState icon={Award} message={t('leaderboard.noAchievementData')} />
      )}

      {!loading && entries.length > 0 && (
        <Board
          title={t('leaderboard.topAchievementHunters')}
          rows={rows}
          podium={entries.slice(0, 3).map((e, index) => ({
            key: e.userId,
            rank: index + 1,
            displayName: e.displayName,
            avatarUrl: e.avatarUrl,
            scoreText: `${e.totalPoints.toLocaleString()} ${t('leaderboard.points')}`,
          }))}
          currentUserId={currentUserId}
        />
      )}
    </>
  )
}
