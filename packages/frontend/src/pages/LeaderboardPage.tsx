import { useEffect, useReducer, useState, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Trophy, Crown, Calendar, CalendarDays, Crosshair, Play, Users, Globe, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { GeoGamersSeasonPanel } from '@/components/leaderboard/GeoGamersSeasonPanel'
import { CountryLeaderboardPanel } from '@/components/leaderboard/CountryLeaderboardPanel'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
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
import { visibleLeaderboardTabs, type LeaderboardTab } from '@/lib/dailyFirst'

const formatDateForApi = (date: Date) => format(date, 'yyyy-MM-dd')

const TABS = ['daily', 'monthly', 'achievements', 'geogamers'] as const satisfies readonly LeaderboardTab[]
const TAB_TRIGGERS: Record<LeaderboardTab, { icon: LucideIcon; label: string }> = {
  daily: { icon: Calendar, label: 'leaderboard.daily' },
  monthly: { icon: CalendarDays, label: 'leaderboard.monthly' },
  achievements: { icon: Crown, label: 'profile.achievements' },
  geogamers: { icon: Crosshair, label: 'leaderboard.geogamers.tab' },
}
const parseTab = (value: string | null): LeaderboardTab =>
  (TABS as ReadonlyArray<string>).includes(value ?? '') ? (value as LeaderboardTab) : 'daily'

// The monthly tab ranks players or countries; `?view=countries` keeps the
// country view linkable (shares, marketing posts).
type MonthlyView = 'players' | 'countries'
const parseMonthlyView = (value: string | null): MonthlyView =>
  value === 'countries' ? 'countries' : 'players'

interface BoardsState {
  daily: LeaderboardEntry[]
  /** Guests who finished the selected day's box (never ranked). */
  dailyGuests: number
  monthly: MonthlyLeaderboardEntry[]
  achievements: AchievementLeaderboardEntry[]
  dailyLoading: boolean
  monthlyLoading: boolean
  achievementLoading: boolean
  // A failed request is not an empty board: the panel shows a retry instead
  // of "No results yet" + a play CTA (which read as "nobody played today").
  dailyFailed: boolean
  monthlyFailed: boolean
  achievementFailed: boolean
}

type BoardsAction =
  | { type: 'dailyStart' }
  | { type: 'dailyLoaded'; entries: LeaderboardEntry[]; guests: number }
  | { type: 'monthlyStart' }
  | { type: 'monthlyLoaded'; entries: MonthlyLeaderboardEntry[] }
  | { type: 'achievementsLoaded'; entries: AchievementLeaderboardEntry[] }
  | { type: 'achievementsStart' }
  | { type: 'failed'; board: 'daily' | 'monthly' | 'achievements' }

const initialBoards: BoardsState = {
  daily: [],
  dailyGuests: 0,
  monthly: [],
  achievements: [],
  dailyLoading: true,
  monthlyLoading: false,
  achievementLoading: true,
  dailyFailed: false,
  monthlyFailed: false,
  achievementFailed: false,
}

// HTTP errors reject like network errors, so both land in the panel's
// retry state rather than being read as an empty board.
const fetchBoard = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  })

function boardsReducer(state: BoardsState, action: BoardsAction): BoardsState {
  switch (action.type) {
    case 'dailyStart':
      return { ...state, dailyLoading: true, dailyFailed: false }
    case 'dailyLoaded':
      return { ...state, daily: action.entries, dailyGuests: action.guests, dailyLoading: false }
    case 'monthlyStart':
      return { ...state, monthlyLoading: true, monthlyFailed: false }
    case 'monthlyLoaded':
      return { ...state, monthly: action.entries, monthlyLoading: false }
    case 'achievementsStart':
      return { ...state, achievementLoading: true, achievementFailed: false }
    case 'achievementsLoaded':
      return { ...state, achievements: action.entries, achievementLoading: false }
    case 'failed':
      if (action.board === 'daily') return { ...state, daily: [], dailyGuests: 0, dailyLoading: false, dailyFailed: true }
      if (action.board === 'monthly') return { ...state, monthly: [], monthlyLoading: false, monthlyFailed: true }
      return { ...state, achievements: [], achievementLoading: false, achievementFailed: true }
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
  const { localizedPath } = useLocalizedPath()
  const [searchParams, setSearchParams] = useSearchParams()
  const [boards, dispatchBoards] = useReducer(boardsReducer, initialBoards)
  const {
    daily: leaderboard,
    dailyGuests,
    monthly: monthlyLeaderboard,
    achievements: achievementLeaderboard,
    dailyLoading: loading,
    monthlyLoading,
    achievementLoading,
    dailyFailed,
    monthlyFailed,
    achievementFailed,
  } = boards
  // Bumped by a panel's Retry button to re-run that board's fetch effect.
  const [reload, setReload] = useState({ daily: 0, monthly: 0, achievements: 0 })
  const retryDaily = useCallback(() => setReload((r) => ({ ...r, daily: r.daily + 1 })), [])
  const retryMonthly = useCallback(() => setReload((r) => ({ ...r, monthly: r.monthly + 1 })), [])
  const retryAchievements = useCallback(
    () => setReload((r) => ({ ...r, achievements: r.achievements + 1 })),
    [],
  )
  const activeTab = parseTab(searchParams.get('tab'))
  const monthlyView = parseMonthlyView(searchParams.get('view'))
  const setMonthlyView = useCallback(
    (value: string) => {
      if (!value) return
      const next = parseMonthlyView(value)
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev)
          if (next === 'players') sp.delete('view')
          else sp.set('view', next)
          return sp
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )
  const setActiveTab = useCallback(
    (value: string) => {
      const next = parseTab(value)
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev)
          if (next === 'daily') sp.delete('tab')
          else sp.set('tab', next)
          if (next !== 'monthly') sp.delete('view')
          return sp
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )
  const [sessionDialog, dispatchSessionDialog] = useReducer(
    sessionDialogReducer,
    initialSessionDialog,
  )
  const { selectedPlayer, playerSession, sessionLoading, sessionError } = sessionDialog

  // Midnight today, read once per mount (lazy initializer) so the clock stays
  // out of the render path and `today` keeps a stable identity across renders.
  const [today] = useState(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  })

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
    fetchBoard(`/api/leaderboard/${dateStr}`)
      .then(data => {
        dispatchBoards({
          type: 'dailyLoaded',
          entries: data.success && data.data?.entries ? data.data.entries : [],
          guests: data.success && typeof data.data?.guestPlayers === 'number' ? data.data.guestPlayers : 0,
        })
      })
      .catch(() => {
        dispatchBoards({ type: 'failed', board: 'daily' })
      })
  }, [selectedDate, reload.daily])

  // Fetch achievement leaderboard (once, not date-dependent). The loading
  // flag starts `true` in the reducer, so no setState-on-mount is needed.
  // oxlint-disable-next-line react-doctor/no-fetch-in-effect
  useEffect(() => {
    if (reload.achievements > 0) dispatchBoards({ type: 'achievementsStart' })
    fetchBoard('/api/achievements/leaderboard')
      .then(data => {
        dispatchBoards({
          type: 'achievementsLoaded',
          entries: data.success && data.data ? data.data : [],
        })
      })
      .catch(() => {
        dispatchBoards({ type: 'failed', board: 'achievements' })
      })
  }, [reload.achievements])

  // Fetch monthly leaderboard when monthly tab is active or month changes
  // oxlint-disable-next-line react-doctor/no-fetch-in-effect
  useEffect(() => {
    if (activeTab !== 'monthly' || monthlyView !== 'players') return

    dispatchBoards({ type: 'monthlyStart' })
    const year = selectedMonth.getFullYear()
    const month = selectedMonth.getMonth() + 1 // getMonth() returns 0-11, API expects 1-12

    fetchBoard(`/api/leaderboard/monthly/${year}/${month}`)
      .then(data => {
        dispatchBoards({
          type: 'monthlyLoaded',
          entries: data.success && data.data?.entries ? data.data.entries : [],
        })
      })
      .catch(() => {
        dispatchBoards({ type: 'failed', board: 'monthly' })
      })
  }, [activeTab, monthlyView, selectedMonth, reload.monthly])

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
    <PageHero
      icon={Trophy}
      iconStyle="simple"
      title={t('leaderboard.title')}
      subtitle={t('leaderboard.subtitle')}
    >
      <div className="max-w-4xl mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full mb-6">
            {/* "Results" (D9) ranks today's box and the month. The achievements
                and Panorama boards leave the tab bar but stay deep-linkable
                (?tab=achievements / ?tab=geogamers): their trigger only shows
                while one of them is the active tab. */}
            {visibleLeaderboardTabs(activeTab).map((tab) => {
              const { icon: Icon, label } = TAB_TRIGGERS[tab]
              return (
                <TabsTrigger key={tab} value={tab} className="gap-2">
                  <Icon className="hidden size-4 sm:block" aria-hidden="true" />
                  {t(label)}
                </TabsTrigger>
              )
            })}
          </TabsList>

          <TabsContent value="daily">
            <DailyLeaderboardPanel
              entries={leaderboard}
              guestPlayers={dailyGuests}
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
              emptyAction={
                isToday(selectedDate) ? (
                  <Button asChild variant="gaming" size="lg" className="w-full sm:w-auto">
                    <Link to={localizedPath('/')}>
                      <Play aria-hidden="true" />
                      {t('history.empty.cta')}
                    </Link>
                  </Button>
                ) : undefined
              }
              failed={dailyFailed}
              onRetry={retryDaily}
              currentUserId={currentUserId}
              onDateChange={handleDateChange}
              onPlayerClick={handlePlayerClick}
            />
          </TabsContent>

          <TabsContent value="monthly">
            <div className="flex justify-center mb-4">
              <ToggleGroup
                type="single"
                value={monthlyView}
                onValueChange={setMonthlyView}
                aria-label={t('leaderboard.countries.viewLabel')}
              >
                <ToggleGroupItem value="players">
                  <Users className="size-4" aria-hidden="true" />
                  {t('leaderboard.countries.viewPlayers')}
                </ToggleGroupItem>
                <ToggleGroupItem value="countries">
                  <Globe className="size-4" aria-hidden="true" />
                  {t('leaderboard.countries.viewCountries')}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            {monthlyView === 'players' ? (
              <MonthlyLeaderboardPanel
                entries={monthlyLeaderboard}
                loading={monthlyLoading}
                selectedMonth={selectedMonth}
                maxDate={today}
                locale={getDateLocale()}
                cardTitle={getMonthlyCardTitle()}
                failed={monthlyFailed}
                onRetry={retryMonthly}
                currentUserId={currentUserId}
                onMonthChange={handleMonthChange}
              />
            ) : (
              <CountryLeaderboardPanel
                selectedMonth={selectedMonth}
                maxDate={today}
                locale={getDateLocale()}
                cardTitle={getMonthlyCardTitle()}
                onMonthChange={handleMonthChange}
              />
            )}
          </TabsContent>

          <TabsContent value="achievements">
            <AchievementLeaderboardPanel
              entries={achievementLeaderboard}
              loading={achievementLoading}
              failed={achievementFailed}
              onRetry={retryAchievements}
              currentUserId={currentUserId}
            />
          </TabsContent>

          <TabsContent value="geogamers">
            <GeoGamersSeasonPanel currentUserId={currentUserId} />
          </TabsContent>
        </Tabs>

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
