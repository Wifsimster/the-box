import { useEffect, useReducer } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { m } from 'framer-motion'
import { Trophy, Flame, Gamepad2, Calendar, Loader2, User as UserIcon, Award } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <UserIcon className="size-12 mx-auto mb-4 text-muted-foreground" />
        <h1 className="text-xl font-bold mb-2">{t('publicProfile.notFound')}</h1>
        <p className="text-muted-foreground mb-6">{error ?? t('publicProfile.notFoundDescription')}</p>
        <Button variant="gaming" asChild>
          <Link to={localizedPath('/')}>{t('common.home')}</Link>
        </Button>
      </div>
    )
  }

  const dateLocale = i18n.language === 'en' ? 'en-US' : 'fr-FR'
  const joined = new Date(profile.createdAt).toLocaleDateString(dateLocale, {
    year: 'numeric',
    month: 'long',
  })

  return (
    <div className="container mx-auto px-4 py-8 md:py-12 max-w-3xl">
      <m.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Card className="backdrop-blur-xl bg-card/40 border-white/10">
          <CardContent className="p-6 md:p-8">
            <div className="flex items-center gap-4 mb-6">
              <Avatar className="size-20 border-2 border-neon-purple/40">
                <AvatarImage src={profile.avatarUrl} alt={profile.displayName} />
                <AvatarFallback className="text-2xl bg-card">
                  {profile.displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl font-bold bg-linear-to-r from-neon-purple to-neon-cyan bg-clip-text text-transparent">
                  {profile.displayName}
                </h1>
                <p className="text-sm text-muted-foreground">@{profile.username}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('publicProfile.memberSince', { date: joined })}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <StatTile icon={Trophy} label={t('publicProfile.totalScore')} value={profile.totalScore.toLocaleString(dateLocale)} />
              <StatTile icon={Flame} label={t('publicProfile.currentStreak')} value={profile.currentStreak} />
              <StatTile icon={Flame} label={t('publicProfile.longestStreak')} value={profile.longestStreak} />
              <StatTile icon={Gamepad2} label={t('publicProfile.gamesPlayed')} value={profile.gamesPlayed} />
            </div>

            {profile.badges.length > 0 && (
              <div className="mb-6">
                <h2 className="text-sm font-semibold text-foreground/80 mb-3 flex items-center gap-2">
                  <Award className="size-4" />
                  {t('publicProfile.badges')}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {profile.badges.map((b) => (
                    <span
                      key={b.key}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-linear-to-r from-neon-purple/20 to-neon-pink/20 border border-neon-purple/30 text-xs font-semibold text-foreground"
                    >
                      <Award className="size-3" />
                      {t(`publicProfile.badgeLabels.${b.key}`, { defaultValue: b.key })}
                      {b.quantity > 1 && <span className="opacity-60">×{b.quantity}</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {profile.recentSessions.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-foreground/80 mb-3 flex items-center gap-2">
                  <Calendar className="size-4" />
                  {t('publicProfile.recentGames')}
                </h2>
                <ul className="space-y-2">
                  {profile.recentSessions.map((s) => (
                    <li
                      key={s.challengeDate}
                      className="flex items-center justify-between p-3 rounded-lg bg-card/40 border border-white/5"
                    >
                      <span className="text-sm text-foreground/90">
                        {s.challengeDate
                          ? new Date(`${s.challengeDate}T00:00:00Z`).toLocaleDateString(dateLocale, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              timeZone: 'UTC',
                            })
                          : '—'}
                      </span>
                      <span className="text-sm font-bold text-neon-cyan">
                        {s.totalScore.toLocaleString(dateLocale)} pts
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </m.div>
    </div>
  )
}

interface StatTileProps {
  icon: typeof Trophy
  label: string
  value: number | string
}

function StatTile({ icon: Icon, label, value }: StatTileProps) {
  return (
    <div className="p-3 rounded-lg bg-card/40 border border-white/5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <Icon className="size-3.5" />
        <span>{label}</span>
      </div>
      <p className="text-lg font-bold text-foreground">{value}</p>
    </div>
  )
}
