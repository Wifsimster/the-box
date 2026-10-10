import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Locale } from 'date-fns'
import { Globe, MapPin, RefreshCw, Trophy, Medal, Award } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { MonthPicker } from '@/components/ui/month-picker'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { countryName } from '@/lib/countries'
import { cn } from '@/lib/utils'
import type { CountryLeaderboardResponse } from '@the-box/types'

type LoadState =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'loaded'; data: CountryLeaderboardResponse }

function RankCell({ rank }: { rank: number }) {
  let icon = null
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

/**
 * Monthly country ranking: each country's average score this month, for
 * countries with at least `minPlayers` players. Countries are self-declared
 * on the profile, so the panel also nudges a signed-in player without one.
 */
export function CountryLeaderboardPanel({
  selectedMonth,
  maxDate,
  locale,
  cardTitle,
  onMonthChange,
}: {
  selectedMonth: Date
  maxDate: Date
  locale: Locale
  cardTitle: string
  onMonthChange: (date: Date) => void
}) {
  const { t, i18n } = useTranslation()
  const { localizedPath } = useLocalizedPath()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const year = selectedMonth.getFullYear()
  const month = selectedMonth.getMonth() + 1

  // Intentional fetch-in-effect, same as LeaderboardPage: no query library here.
  // oxlint-disable-next-line react-doctor/no-fetch-in-effect
  useEffect(() => {
    let alive = true
    fetch(`/api/leaderboard/monthly/${year}/${month}/countries`, { credentials: 'include' })
      .then((res) => res.json())
      .then((body: { success?: boolean; data?: CountryLeaderboardResponse }) => {
        if (!alive) return
        setState(body.success && body.data ? { status: 'loaded', data: body.data } : { status: 'failed' })
      })
      .catch(() => alive && setState({ status: 'failed' }))
    return () => {
      alive = false
    }
  }, [year, month, attempt])

  const changeMonth = (date: Date) => {
    setState({ status: 'loading' })
    onMonthChange(date)
  }

  const retry = () => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }

  const lang = i18n.language

  return (
    <>
      <div className="flex justify-center mb-6">
        <MonthPicker value={selectedMonth} onChange={changeMonth} maxDate={maxDate} locale={locale} />
      </div>

      {state.status === 'loading' && (
        <div aria-busy="true" className="space-y-2">
          <span className="sr-only" role="status">{t('leaderboard.loading')}</span>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg bg-secondary/30 p-3">
              <Skeleton className="size-5" variant="circular" />
              <Skeleton className="h-6 w-9" />
              <div className="flex-1 space-y-1.5">
                <Skeleton variant="text" className="h-4 w-32" />
                <Skeleton variant="text" className="h-3 w-20" />
              </div>
              <Skeleton className="h-5 w-12" />
            </div>
          ))}
        </div>
      )}

      {state.status === 'failed' && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Globe className="size-10 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm sm:text-base text-muted-foreground max-w-xs">
            {t('leaderboard.countries.unavailable')}
          </p>
          <Button variant="outline" onClick={retry}>
            <RefreshCw aria-hidden="true" />
            {t('common.retry')}
          </Button>
        </div>
      )}

      {state.status === 'loaded' && (
        <CountryBoard data={state.data} lang={lang} cardTitle={cardTitle} profilePath={localizedPath('/profile?tab=account')} />
      )}
    </>
  )
}

function CountryBoard({
  data,
  lang,
  cardTitle,
  profilePath,
}: {
  data: CountryLeaderboardResponse
  lang: string
  cardTitle: string
  profilePath: string
}) {
  const { t } = useTranslation()
  const { entries, minPlayers, viewer } = data
  const viewerCountry = viewer?.countryCode ?? null
  const viewerEntry = viewerCountry ? entries.find((e) => e.countryCode === viewerCountry) : undefined

  return (
    <div className="space-y-4">
      <p className="text-center text-sm text-muted-foreground">
        {t('leaderboard.countries.explainer', { min: minPlayers })}
      </p>

      {viewer && (
        <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2 font-semibold text-foreground">
            <MapPin className="size-4 shrink-0 text-primary" aria-hidden="true" />
            {viewerCountry
              ? viewerEntry
                ? t('leaderboard.countries.yourCountryRanked', {
                    country: countryName(viewerCountry, lang),
                    rank: viewerEntry.rank,
                  })
                : t('leaderboard.countries.yourCountryPending', {
                    country: countryName(viewerCountry, lang),
                    count: viewer.playerCount,
                    min: minPlayers,
                  })
              : t('leaderboard.countries.noCountry')}
          </span>
          {!viewerCountry && (
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link to={profilePath}>{t('leaderboard.countries.setCountry')}</Link>
            </Button>
          )}
        </div>
      )}

      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Globe className="size-10 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm sm:text-base text-muted-foreground max-w-xs">
            {t('leaderboard.countries.empty', { min: minPlayers })}
          </p>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg capitalize">{cardTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 list-none">
              {entries.map((entry) => {
                const isMine = entry.countryCode === viewerCountry
                return (
                  <li
                    key={entry.countryCode}
                    aria-current={isMine ? 'true' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-lg p-3',
                      isMine ? 'bg-primary/10 ring-1 ring-primary/40' : 'bg-secondary/50',
                    )}
                  >
                    <RankCell rank={entry.rank} />
                    <span
                      className="w-9 shrink-0 rounded-md bg-secondary px-1.5 py-1 text-center font-mono text-xs font-bold text-foreground"
                      aria-hidden="true"
                    >
                      {entry.countryCode}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold truncate">{countryName(entry.countryCode, lang)}</span>
                        {isMine && (
                          <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                            {t('leaderboard.countries.yours')}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t('leaderboard.countries.players', { count: entry.playerCount })}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-bold text-primary tabular-nums">{entry.averageScore.toLocaleString(lang)}</div>
                      <div className="text-xs text-muted-foreground">{t('leaderboard.countries.average')}</div>
                    </div>
                  </li>
                )
              })}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
