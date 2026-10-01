import { useEffect, useReducer } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { m } from 'framer-motion'
import { Trophy, Flame, Gamepad2, Calendar, User as UserIcon, Award, TrendingUp, Share2, Play } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useReducedMotionSafe } from '@/hooks/useReducedMotionSafe'
import { toast } from '@/lib/toast'
import type { PublicProfile } from '@the-box/types'

interface PublicProfileState {
  profile: PublicProfile | null
  error: string | null
  loading: boolean
}

type PublicProfileAction =
  | { type: 'loaded'; profile: PublicProfile }
  | { type: 'failed'; error: string }

const initialPublicProfileState: PublicProfileState = {
  profile: null,
  error: null,
  loading: true,
}

function publicProfileReducer(
  _state: PublicProfileState,
  action: PublicProfileAction,
): PublicProfileState {
  switch (action.type) {
    case 'loaded':
      return { profile: action.profile, error: null, loading: false }
    case 'failed':
      return { profile: null, error: action.error, loading: false }
    default:
      return _state
  }
}

export default function PublicProfilePage() {
  const { username } = useParams<{ username: string }>()
  const { t, i18n } = useTranslation()
  const { localizedPath } = useLocalizedPath()
  const [{ profile, error, loading }, dispatch] = useReducer(
    publicProfileReducer,
    initialPublicProfileState,
  )
  const reducedMotion = useReducedMotionSafe()

  // Intentional fetch-in-effect (no react-query/SWR in this stack); aborts via
  // AbortController on unmount / username change.
  // oxlint-disable-next-line react-doctor/no-fetch-in-effect
  useEffect(() => {
    if (!username) return
    const controller = new AbortController()
    fetch(`/api/user/public/${encodeURIComponent(username)}`, {
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((json: { success: boolean; data?: PublicProfile; error?: { message: string } }) => {
        if (controller.signal.aborted) return
        if (json.success && json.data) {
          dispatch({ type: 'loaded', profile: json.data })
        } else {
          dispatch({ type: 'failed', error: json.error?.message ?? t('publicProfile.notFound') })
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        dispatch({
          type: 'failed',
          error: err instanceof Error ? err.message : t('publicProfile.error'),
        })
      })
    return () => {
      controller.abort()
    }
  }, [username, t])

  const containerClass = 'container mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8 md:py-12'

  if (loading) {
    return (
      <div className={containerClass} aria-busy="true">
        <span className="sr-only" role="status">{t('common.loading')}</span>
        <div className="space-y-6 rounded-xl border border-border bg-card p-(--card-padding)">
          <div className="flex items-center gap-4">
            <Skeleton className="size-20 sm:size-24" variant="circular" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className={containerClass}>
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <UserIcon className="size-12 text-muted-foreground" aria-hidden="true" />
          <h1 className="text-xl sm:text-2xl font-bold">{t('publicProfile.notFound')}</h1>
          <p className="max-w-sm text-sm sm:text-base text-muted-foreground">
            {error ?? t('publicProfile.notFoundDescription')}
          </p>
          <Button variant="gaming" size="lg" asChild className="mt-2 w-full sm:w-auto">
            <Link to={localizedPath('/')}>{t('common.home')}</Link>
          </Button>
        </div>
      </div>
    )
  }

  const dateLocale = i18n.language === 'en' ? 'en-US' : 'fr-FR'
  const joined = new Date(profile.createdAt).toLocaleDateString(dateLocale, {
    year: 'numeric',
    month: 'long',
  })

  const handleShare = async () => {
    const url = window.location.href
    const title = t('publicProfile.shareTitle', { name: profile.displayName })
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url })
        return
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('publicProfile.linkCopied'))
    } catch {
      toast.error(t('share.copyError'))
    }
  }

  return (
    <div className={containerClass}>
      <m.div
        initial={reducedMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Card variant="neon" className="bg-card/80 backdrop-blur-sm">
          <CardContent className="space-y-6 pt-(--card-padding)">
            <header className="flex items-center gap-4">
              <Avatar className="size-20 sm:size-24 shrink-0 border-2 border-primary/40">
                <AvatarImage src={profile.avatarUrl} alt="" />
                <AvatarFallback className="text-2xl bg-card">
                  {profile.displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <h1 className="gradient-gaming-title wrap-break-word text-2xl sm:text-3xl font-bold">
                  {profile.displayName}
                </h1>
                <p className="truncate text-sm text-muted-foreground">@{profile.username}</p>
                <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                  {t('publicProfile.memberSince', { date: joined })}
                </p>
              </div>
            </header>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="gaming" size="lg" asChild className="w-full sm:w-auto">
                <Link to={localizedPath('/play')}>
                  <Play aria-hidden="true" />
                  {t('history.empty.cta')}
                </Link>
              </Button>
              <Button variant="outline" size="lg" onClick={handleShare} className="w-full sm:w-auto">
                <Share2 aria-hidden="true" />
                {t('common.share')}
              </Button>
            </div>

            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatTile icon={Trophy} iconClass="text-warning" label={t('publicProfile.totalScore')} value={profile.totalScore.toLocaleString(dateLocale)} />
              <StatTile icon={Flame} iconClass="text-score-low" label={t('publicProfile.currentStreak')} value={profile.currentStreak} />
              <StatTile icon={TrendingUp} iconClass="text-success" label={t('publicProfile.longestStreak')} value={profile.longestStreak} />
              <StatTile icon={Gamepad2} iconClass="text-neon-cyan" label={t('publicProfile.gamesPlayed')} value={profile.gamesPlayed} />
            </dl>

            {profile.badges.length > 0 && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Award className="size-4 text-primary" aria-hidden="true" />
                  {t('publicProfile.badges')}
                </h2>
                <ul className="flex flex-wrap gap-2 list-none">
                  {profile.badges.map((b) => (
                    <li key={b.key}>
                      <Badge variant="outline" className="gap-1.5 border-primary/40 bg-primary/10 px-3 py-1">
                        <Award className="size-3" aria-hidden="true" />
                        {t(`publicProfile.badgeLabels.${b.key}`, { defaultValue: b.key })}
                        {b.quantity > 1 && <span className="text-muted-foreground">×{b.quantity}</span>}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {profile.recentSessions.length > 0 && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Calendar className="size-4 text-primary" aria-hidden="true" />
                  {t('publicProfile.recentGames')}
                </h2>
                <ul className="space-y-2 list-none">
                  {profile.recentSessions.map((s) => (
                    <li
                      key={s.challengeDate}
                      className="flex items-center justify-between gap-3 rounded-lg bg-secondary/50 p-3"
                    >
                      <span className="text-sm text-foreground">
                        {s.challengeDate
                          ? new Date(`${s.challengeDate}T00:00:00Z`).toLocaleDateString(dateLocale, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              timeZone: 'UTC',
                            })
                          : '—'}
                      </span>
                      <span className="shrink-0 text-sm font-bold text-primary tabular-nums">
                        {s.totalScore.toLocaleString(dateLocale)} {t('leaderboard.points')}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </CardContent>
        </Card>
      </m.div>
    </div>
  )
}

interface StatTileProps {
  icon: typeof Trophy
  iconClass: string
  label: string
  value: number | string
}

function StatTile({ icon: Icon, iconClass, label, value }: StatTileProps) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-secondary/30 p-3">
      <dt className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className={`size-3.5 shrink-0 ${iconClass}`} aria-hidden="true" />
        <span className="truncate">{label}</span>
      </dt>
      <dd className="text-lg sm:text-xl font-bold text-foreground tabular-nums">{value}</dd>
    </div>
  )
}
