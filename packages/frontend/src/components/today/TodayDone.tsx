import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CalendarDays, Clock, Crosshair, Flame, Gift, ListChecks, Sparkles, Trophy, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ShareCard } from '@/components/game/ShareCard'
import { gameApi } from '@/lib/api/game'
import { mergeSessionResults } from '@/lib/sessionResults'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useNextDailyCountdown } from '@/hooks/useNextDailyCountdown'
import { usePercentileRank } from '@/hooks/usePercentileRank'
import { useFeatures } from '@/hooks/useFeatures'
import { yesterdayAction } from '@/lib/dailyFirst'
import { useBillingStore } from '@/stores/billingStore'
import { useDailyLoginStore } from '@/stores/dailyLoginStore'
import type { GuessResult, TodayChallengeResponse } from '@/types'

const pad = (value: number) => String(value).padStart(2, '0')

interface TodayDoneProps {
  isGuest: boolean
  streak: number | null
}

/**
 * The daily loop once today's box is open: score, streak, countdown to the
 * next box, share, yesterday's box — and only then the secondary surfaces
 * (Panorama, Premium). This is where the home page's former teasers live now.
 */
export function TodayDone({ isGuest, streak }: TodayDoneProps) {
  const { t } = useTranslation()
  const { localizedPath } = useLocalizedPath()
  const time = useNextDailyCountdown()
  const [today, setToday] = useState<TodayChallengeResponse | null>(null)
  const [results, setResults] = useState<GuessResult[]>([])
  const isPremium = useBillingStore((s) => Boolean(s.entitlement?.isPremium))
  const canClaim = useDailyLoginStore((s) => Boolean(s.status?.canClaim))
  const openRewardModal = useDailyLoginStore((s) => s.openModal)
  const { geogamers: panoramaEnabled } = useFeatures()

  useEffect(() => {
    let cancelled = false
    gameApi
      .getTodayChallenge()
      .then(async (data) => {
        if (cancelled) return
        setToday(data)
        const sessionId = data.userSession?.sessionId
        if (!sessionId) return
        const details = await gameApi.getGameSessionDetails(sessionId)
        if (!cancelled) setResults(mergeSessionResults(details))
      })
      .catch(() => {
        /* the card falls back to the skeleton-free empty values */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const score = today?.userSession?.totalScore ?? 0
  const found = today?.userSession?.screenshotsFound ?? 0
  const total = today?.totalScreenshots ?? 10
  // Standing of the stored session (same source as /results, #412).
  const { percentile, rank, totalPlayers } = usePercentileRank({
    sessionId: today?.userSession?.sessionId ?? null,
    score,
    enabled: score > 0,
  })
  const countdown = `${pad(time.hours)}:${pad(time.minutes)}:${pad(time.seconds)}`
  const yesterday = today?.yesterdayChallenge ?? null
  const yesterdayNext = yesterday ? yesterdayAction(yesterday) : null
  const correct = useMemo(() => results.filter((r) => r.isCorrect).length, [results])

  return (
    <div className="container mx-auto flex max-w-xl flex-col gap-4 px-4 py-6 sm:py-10">
      <Card variant="neon" className="bg-card/80 text-center">
        <CardContent className="space-y-4 pt-(--card-padding)">
          <img src="/logo.svg" alt="" aria-hidden="true" className="mx-auto size-12" />
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-foreground">{t('today.doneTitle')}</h1>
            {today ? (
              <p className="flex items-center justify-center gap-2 text-base text-muted-foreground">
                <Trophy className="size-4 text-neon-cyan" aria-hidden="true" />
                <span className="font-semibold text-foreground">
                  {t('today.doneScore', { score, found, total })}
                </span>
              </p>
            ) : (
              <Skeleton className="mx-auto h-5 w-48" variant="text" />
            )}
          </div>

          {streak !== null && streak > 0 && (
            <p className="inline-flex items-center gap-2 rounded-full border border-neon-pink/40 px-3 py-1 text-sm font-semibold">
              <Flame className="size-4 text-neon-pink" aria-hidden="true" />
              {t('today.streak', { count: streak })}
            </p>
          )}

          <div
            role="timer"
            aria-label={`${t('today.nextIn')} ${countdown}`}
            className="flex items-center justify-center gap-2 border-t border-border pt-4"
          >
            <Clock className="size-4 text-neon-pink" aria-hidden="true" />
            <span className="text-sm text-muted-foreground">{t('today.nextIn')}</span>
            <span className="font-mono text-lg font-semibold tabular-nums" aria-hidden="true">
              {countdown}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ShareCard
              score={score}
              correctAnswers={correct || found}
              totalScreenshots={total}
              percentile={percentile ?? undefined}
              rank={rank ?? undefined}
              totalPlayers={totalPlayers ?? undefined}
              challengeDate={today?.date}
              guessResults={results}
              compact
            />
            <Button variant="outline" asChild className="w-full">
              <Link to={localizedPath('/leaderboard')}>
                <Trophy className="size-4" aria-hidden="true" />
                {t('today.seeRanking')}
              </Link>
            </Button>
          </div>
          {today?.userSession?.sessionId && (
            <Button variant="link" asChild className="h-auto p-0">
              <Link to={localizedPath(`/history/${today.userSession.sessionId}`)}>
                <ListChecks className="size-4" aria-hidden="true" />
                {t('today.seeResults')}
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>

      {isGuest && (
        <Card variant="warning">
          <CardContent className="flex flex-col gap-3 pt-(--card-padding) sm:flex-row sm:items-center">
            <UserPlus className="size-6 shrink-0 text-warning" aria-hidden="true" />
            <div className="flex-1 space-y-1">
              <h2 className="font-semibold text-foreground">{t('today.guestSaveTitle')}</h2>
              <p className="text-sm text-muted-foreground">{t('today.guestSaveBody')}</p>
            </div>
            <Button variant="gaming" asChild>
              <Link to={localizedPath('/register')}>{t('today.guestSaveCta')}</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {canClaim && !isGuest && (
        <Card>
          <CardContent className="flex items-center gap-3 pt-(--card-padding)">
            <Gift className="size-5 shrink-0 text-neon-purple" aria-hidden="true" />
            <p className="flex-1 text-sm">{t('today.rewardReady')}</p>
            <Button variant="outline" size="sm" onClick={openRewardModal}>
              {t('today.rewardCta')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Yesterday's box (D6): your answers if you finished it, otherwise a
          catch-up (off the leaderboard). Never the answers of a box you did
          not play: that would spoil the 7-day catch-up. */}
      {yesterdayNext && (
        <Card data-testid="today-yesterday">
          <CardContent className="flex items-center gap-3 pt-(--card-padding)">
            <CalendarDays className="size-5 shrink-0 text-neon-cyan" aria-hidden="true" />
            <div className="flex-1">
              <h2 className="text-sm font-semibold">{t('today.yesterdayTitle')}</h2>
              <p className="text-sm text-muted-foreground">
                {t(`today.yesterday.${yesterdayNext.kind}.body`)}
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to={localizedPath(yesterdayNext.path)}>
                {t(`today.yesterday.${yesterdayNext.kind}.cta`)}
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Secondary surfaces: only after the daily loop is done. */}
      {(panoramaEnabled || !isPremium) && (
        <section aria-labelledby="today-more" className="space-y-2 pt-2">
          <h2 id="today-more" className="text-sm font-semibold text-muted-foreground">
            {t('today.moreTitle')}
          </h2>
          {panoramaEnabled && (
            <Link
              to={localizedPath('/panorama')}
              className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Crosshair className="size-5 shrink-0 text-neon-purple" aria-hidden="true" />
              <span className="flex-1 text-muted-foreground">{t('today.panoramaLine')}</span>
            </Link>
          )}
          {!isPremium && (
            <Link
              to={localizedPath('/premium')}
              className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Sparkles className="size-5 shrink-0 text-neon-pink" aria-hidden="true" />
              <span className="flex-1 text-muted-foreground">{t('today.premiumLine')}</span>
            </Link>
          )}
        </section>
      )}
    </div>
  )
}
