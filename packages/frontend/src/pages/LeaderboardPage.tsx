import { useEffect, useReducer, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Trophy, Crown, Calendar, CalendarDays } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import {
  DailyLeaderboardPanel,
  MonthlyLeaderboardPanel,
  AchievementLeaderboardPanel,
  type LeaderboardEntry,
  type MonthlyLeaderboardEntry,
  type AchievementLeaderboardEntry,
} from '@/components/leaderboard/LeaderboardPanels'
import { PlayerAnswersDialog } from '@/components/leaderboard/PlayerAnswersDialog'
import { useSession } from '@/lib/auth-client'
import type { GameSessionDetailsResponse } from '@the-box/types'

const formatDateForApi = (date: Date) => format(date, 'yyyy-MM-dd')

interface BoardsState {
  daily: LeaderboardEntry[]
  monthly: MonthlyLeaderboardEntry[]
  achievements: AchievementLeaderboardEntry[]
  dailyLoading: boolean
  monthlyLoading: boolean
  achievementLoading: boolean
}

type BoardsAction =
  | { type: 'dailyStart' }
  | { type: 'dailyLoaded'; entries: LeaderboardEntry[] }
  | { type: 'monthlyStart' }
  | { type: 'monthlyLoaded'; entries: MonthlyLeaderboardEntry[] }
  | { type: 'achievementsLoaded'; entries: AchievementLeaderboardEntry[] }

const initialBoards: BoardsState = {
  daily: [],
  monthly: [],
  achievements: [],
  dailyLoading: true,
  monthlyLoading: false,
  achievementLoading: true,
}

function boardsReducer(state: BoardsState, action: BoardsAction): BoardsState {
  switch (action.type) {
    case 'dailyStart':
      return { ...state, dailyLoading: true }
    case 'dailyLoaded':
      return { ...state, daily: action.entries, dailyLoading: false }
    case 'monthlyStart':
      return { ...state, monthlyLoading: true }
    case 'monthlyLoaded':
      return { ...state, monthly: action.entries, monthlyLoading: false }
    case 'achievementsLoaded':
      return { ...state, achievements: action.entries, achievementLoading: false }
    default:
      return state
  }
}

interface SessionDialogState {
  selectedPlayer: LeaderboardEntry | null
  playerSession: GameSessionDetailsResponse | null
  sessionLoading: boolean
  sessionError: string | null
}

type SessionDialogAction =
  | { type: 'open'; player: LeaderboardEntry }
  | { type: 'loaded'; session: GameSessionDetailsResponse }
  | { type: 'failed'; error: string }
  | { type: 'close' }

const initialSessionDialog: SessionDialogState = {
  selectedPlayer: null,
  playerSession: null,
  sessionLoading: false,
  sessionError: null,
}

function sessionDialogReducer(
  state: SessionDialogState,
  action: SessionDialogAction,
): SessionDialogState {
  switch (action.type) {
    case 'open':
      return {
        selectedPlayer: action.player,
        playerSession: null,
        sessionLoading: true,
        sessionError: null,
      }
    case 'loaded':
      return { ...state, playerSession: action.session, sessionLoading: false }
    case 'failed':
      return { ...state, sessionError: action.error, sessionLoading: false }
    case 'close':
      return initialSessionDialog
    default:
      return state
  }
}

export default function LeaderboardPage() {
  const { t, i18n } = useTranslation()
  const { data: session } = useSession()
  const currentUserId = session?.user?.id ?? null
  const [searchParams] = useSearchParams()
  const [boards, dispatchBoards] = useReducer(boardsReducer, initialBoards)
  const {
    daily: leaderboard,
    monthly: monthlyLeaderboard,
    achievements: achievementLeaderboard,
    dailyLoading: loading,
    monthlyLoading,
    achievementLoading,
  } = boards
  const [activeTab, setActiveTab] = useState('daily')
  const [sessionDialog, dispatchSessionDialog] = useReducer(
    sessionDialogReducer,
    initialSessionDialog,
  )
  const { selectedPlayer, playerSession, sessionLoading, sessionError } = sessionDialog

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

  const getDateLocale = () => {
    return i18n.language === 'fr' ? fr : enUS
  }

  const isToday = (date: Date) => {
    const todayStr = formatDateForApi(today)
    const dateStr = formatDateForApi(date)
    return todayStr === dateStr
  }

  // Intentional fetch-in-effect: this stack has no react-query/SWR; the boards
  // reducer owns loading/data. (Same rationale for the two effects below.)
  // oxlint-disable-next-line react-doctor/no-fetch-in-effect
  useEffect(() => {
    dispatchBoards({ type: 'dailyStart' })
    const dateStr = formatDateForApi(selectedDate)
    fetch(`/api/leaderboard/${dateStr}`)
      .then(res => res.json())
      .then(data => {
        dispatchBoards({
          type: 'dailyLoaded',
          entries: data.success && data.data?.entries ? data.data.entries : [],
        })
      })
      .catch(() => {
        dispatchBoards({ type: 'dailyLoaded', entries: [] })
      })
  }, [selectedDate])

  // Fetch achievement leaderboard (once, not date-dependent). The loading
  // flag starts `true` in the reducer, so no setState-on-mount is needed.
  // oxlint-disable-next-line react-doctor/no-fetch-in-effect
  useEffect(() => {
    fetch('/api/achievements/leaderboard')
      .then(res => res.json())
      .then(data => {
        dispatchBoards({
          type: 'achievementsLoaded',
          entries: data.success && data.data ? data.data : [],
        })
      })
      .catch(() => {
        dispatchBoards({ type: 'achievementsLoaded', entries: [] })
      })
  }, [])

  // Fetch monthly leaderboard when monthly tab is active or month changes
  // oxlint-disable-next-line react-doctor/no-fetch-in-effect
  useEffect(() => {
    if (activeTab !== 'monthly') return

    dispatchBoards({ type: 'monthlyStart' })
    const year = selectedMonth.getFullYear()
    const month = selectedMonth.getMonth() + 1 // getMonth() returns 0-11, API expects 1-12

    fetch(`/api/leaderboard/monthly/${year}/${month}`)
      .then(res => res.json())
      .then(data => {
        dispatchBoards({
          type: 'monthlyLoaded',
          entries: data.success && data.data?.entries ? data.data.entries : [],
        })
      })
      .catch(() => {
        dispatchBoards({ type: 'monthlyLoaded', entries: [] })
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

    dispatchSessionDialog({ type: 'open', player: entry })

    try {
      const res = await fetch(`/api/leaderboard/session/${entry.sessionId}`)
      const data = await res.json()
      if (data.success && data.data) {
        dispatchSessionDialog({ type: 'loaded', session: data.data })
      } else if (data.error?.code === 'TODAY_CHALLENGE_NOT_COMPLETED') {
        dispatchSessionDialog({ type: 'failed', error: t('leaderboard.todayLocked') })
      } else {
        dispatchSessionDialog({ type: 'failed', error: t('leaderboard.errorLoading') })
      }
    } catch {
      dispatchSessionDialog({ type: 'failed', error: t('leaderboard.errorLoading') })
    }
  }, [t])

  const handleCloseDialog = useCallback(() => {
    dispatchSessionDialog({ type: 'close' })
  }, [])

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
              <Calendar className="size-4 sm:mr-2 shrink-0" />
              <span className="truncate max-w-full">{t('leaderboard.dailyScores')}</span>
            </TabsTrigger>
            <TabsTrigger
              value="monthly"
              className="flex-col sm:flex-row gap-1 sm:gap-0 px-1.5 sm:px-3 py-2 sm:py-1.5 text-[11px] sm:text-sm h-auto"
            >
              <CalendarDays className="size-4 sm:mr-2 shrink-0" />
              <span className="truncate max-w-full">{t('leaderboard.monthlyScores')}</span>
            </TabsTrigger>
            <TabsTrigger
              value="achievements"
              className="flex-col sm:flex-row gap-1 sm:gap-0 px-1.5 sm:px-3 py-2 sm:py-1.5 text-[11px] sm:text-sm h-auto"
            >
              <Crown className="size-4 sm:mr-2 shrink-0" />
              <span className="truncate max-w-full">{t('leaderboard.achievementPoints')}</span>
            </TabsTrigger>
          </TabsList>

          {/* Daily Score Leaderboard */}
          <TabsContent value="daily">
            <DailyLeaderboardPanel
              entries={leaderboard}
              loading={loading}
              selectedDate={selectedDate}
              maxDate={today}
              locale={getDateLocale()}
              cardTitle={getCardTitle()}
              emptyMessage={
                isToday(selectedDate)
                  ? t('leaderboard.noResults')
                  : t('leaderboard.noDataForDate')
              }
              onDateChange={handleDateChange}
              onPlayerClick={handlePlayerClick}
            />
          </TabsContent>

          {/* Monthly Score Leaderboard */}
          <TabsContent value="monthly">
            <MonthlyLeaderboardPanel
              entries={monthlyLeaderboard}
              loading={monthlyLoading}
              selectedMonth={selectedMonth}
              maxDate={today}
              locale={getDateLocale()}
              cardTitle={getMonthlyCardTitle()}
              onMonthChange={handleMonthChange}
            />
          </TabsContent>

          {/* Achievement Points Leaderboard */}
          <TabsContent value="achievements">
            <AchievementLeaderboardPanel
              entries={achievementLeaderboard}
              loading={achievementLoading}
            />
          </TabsContent>
        </Tabs>

        {/* Player Answers Dialog */}
        <PlayerAnswersDialog
          selectedPlayer={selectedPlayer}
          playerSession={playerSession}
          sessionLoading={sessionLoading}
          sessionError={sessionError}
          currentUserId={currentUserId}
          totalPlayers={leaderboard.length}
          onClose={handleCloseDialog}
        />
      </div>
    </PageHero>
  )
}
