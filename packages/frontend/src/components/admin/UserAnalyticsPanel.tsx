import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { adminApi, type UserAnalytics } from '@/lib/api/admin'
import {
  Users,
  UserPlus,
  Activity,
  Gamepad2,
  Trophy,
  Flame,
  Loader2,
  ShieldAlert,
  CalendarClock,
  UserMinus,
  Zap,
  TrendingDown,
  AlertTriangle,
} from 'lucide-react'

const numberFormat = (n: number, lang: string) =>
  new Intl.NumberFormat(lang).format(n)

const percentFormat = (n: number, lang: string) =>
  `${new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(n)}%`

const formatDateTime = (iso: string | null, lang: string, fallback: string) => {
  if (!iso) return fallback
  return new Date(iso).toLocaleString(lang, {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

const formatRelative = (iso: string | null, lang: string, fallback: string) => {
  if (!iso) return fallback
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return formatDateTime(iso, lang, fallback)
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h`
  const days = Math.round(hours / 24)
  return `${days} j`
}

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  accent?: 'gradient' | 'cyan' | 'pink' | 'purple'
}

function StatCard({ icon, label, value, hint, accent = 'gradient' }: StatCardProps) {
  const accentClass =
    accent === 'gradient'
      ? 'gradient-gaming bg-clip-text text-transparent'
      : accent === 'cyan'
        ? 'text-neon-cyan'
        : accent === 'pink'
          ? 'text-neon-pink'
          : 'text-neon-purple'

  return (
    <Card>
      <CardHeader className="pb-2 p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
        <div className={`text-2xl sm:text-3xl font-bold ${accentClass}`}>{value}</div>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  )
}

interface MiniBarChartProps {
  data: Array<{ label: string; primary: number; secondary: number }>
  primaryLabel: string
  secondaryLabel: string
}

// Pure-CSS dual bar chart. Avoids pulling a charting lib for what is
// essentially a 14-point sparkline; primary (active users) renders on
// top in the gaming purple, secondary (signups) in cyan underneath so
// both stay readable when one dwarfs the other.
function MiniBarChart({ data, primaryLabel, secondaryLabel }: MiniBarChartProps) {
  const max = Math.max(1, ...data.flatMap((d) => [d.primary, d.secondary]))
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-neon-purple" />
          {primaryLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-neon-cyan" />
          {secondaryLabel}
        </span>
      </div>
      <div className="flex items-end gap-1 sm:gap-2 h-32">
        {data.map((d) => (
          <div key={d.label} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full flex flex-col-reverse items-stretch gap-px"
              style={{ height: '100%' }}
            >
              <div
                className="bg-neon-purple/80 rounded-t-sm min-h-[1px]"
                style={{ height: `${(d.primary / max) * 100}%` }}
                title={`${primaryLabel}: ${d.primary}`}
              />
              <div
                className="bg-neon-cyan/60 rounded-t-sm min-h-[1px]"
                style={{ height: `${(d.secondary / max) * 100}%` }}
                title={`${secondaryLabel}: ${d.secondary}`}
              />
            </div>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {d.label.slice(5)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

interface DistributionBarProps {
  segments: Array<{ label: string; value: number; colorClass: string }>
}

function DistributionBar({ segments }: DistributionBarProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  if (total === 0) {
    return null
  }
  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {segments.map((s) => {
          const pct = (s.value / total) * 100
          if (pct === 0) return null
          return (
            <div
              key={s.label}
              className={s.colorClass}
              style={{ width: `${pct}%` }}
              title={`${s.label}: ${s.value}`}
            />
          )
        })}
      </div>
      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        {segments.map((s) => {
          const pct = total === 0 ? 0 : Math.round((s.value / total) * 1000) / 10
          return (
            <li key={s.label} className="flex items-center gap-2">
              <span className={`inline-block h-2.5 w-2.5 rounded-sm ${s.colorClass}`} />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="ml-auto font-semibold tabular-nums">
                {s.value} ({pct}%)
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

interface FunnelStepsProps {
  steps: Array<{ label: string; value: number; percent: number; colorClass: string }>
  lang: string
}

// Vertical funnel: each row is a horizontal bar sized to that step's
// share of the first step. Lets the admin see drop-off between signup,
// first play, and week-1 retention in one glance without a charting lib.
function FunnelSteps({ steps, lang }: FunnelStepsProps) {
  return (
    <div className="space-y-2">
      {steps.map((step) => (
        <div key={step.label} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{step.label}</span>
            <span className="tabular-nums">
              <span className="font-semibold">
                {new Intl.NumberFormat(lang).format(step.value)}
              </span>
              <span className="text-muted-foreground ml-2">
                ({percentFormat(step.percent, lang)})
              </span>
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full ${step.colorClass} transition-[width] duration-300`}
              style={{ width: `${Math.min(100, Math.max(0, step.percent))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function UserAnalyticsPanel() {
  const { t, i18n } = useTranslation()
  const [data, setData] = useState<UserAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect -- Necessary pattern for data fetching */
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    adminApi
      .getUserAnalytics()
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message ?? 'Failed to load analytics')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-destructive">
          {error ?? t('admin.analytics.loadError')}
        </CardContent>
      </Card>
    )
  }

  const lang = i18n.language
  const never = t('admin.analytics.never')

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Headline metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label={t('admin.analytics.totalUsers')}
          value={numberFormat(data.users.total, lang)}
          hint={t('admin.analytics.totalUsersHint', {
            verified: data.users.verified,
            banned: data.users.banned,
          })}
          accent="gradient"
        />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label={t('admin.analytics.active30d')}
          value={numberFormat(data.active.last30d, lang)}
          hint={t('admin.analytics.activeBreakdown', {
            d1: data.active.last24h,
            d7: data.active.last7d,
          })}
          accent="cyan"
        />
        <StatCard
          icon={<UserPlus className="h-4 w-4" />}
          label={t('admin.analytics.newSignups30d')}
          value={numberFormat(data.signups.last30d, lang)}
          hint={t('admin.analytics.signupsBreakdown', {
            d1: data.signups.last24h,
            d7: data.signups.last7d,
          })}
          accent="pink"
        />
        <StatCard
          icon={<Gamepad2 className="h-4 w-4" />}
          label={t('admin.analytics.totalSessions')}
          value={numberFormat(data.sessions.total, lang)}
          hint={t('admin.analytics.sessionsHint', {
            completed: data.sessions.completed,
            avg: data.sessions.avgPerPlayer,
          })}
          accent="purple"
        />
      </div>

      {/* Retention + streak metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatCard
          icon={<CalendarClock className="h-4 w-4" />}
          label={t('admin.analytics.retention30d')}
          value={percentFormat(data.users.retentionRate30dPercent, lang)}
          hint={t('admin.analytics.retentionHint', {
            active: data.active.last30d,
            total: data.users.total,
          })}
          accent="cyan"
        />
        <StatCard
          icon={<Flame className="h-4 w-4" />}
          label={t('admin.analytics.activeStreaks')}
          value={numberFormat(data.loginStreak.usersWithActiveStreak, lang)}
          hint={t('admin.analytics.activeStreaksHint', {
            avg: data.loginStreak.averageCurrent,
            max: data.loginStreak.longestEver,
          })}
          accent="pink"
        />
        <StatCard
          icon={<ShieldAlert className="h-4 w-4" />}
          label={t('admin.analytics.neverPlayed')}
          value={numberFormat(data.users.neverPlayed, lang)}
          hint={t('admin.analytics.neverPlayedHint', {
            ever: data.users.everPlayed,
          })}
          accent="purple"
        />
      </div>

      {/* 14-day timeline */}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">
            {t('admin.analytics.timelineTitle')}
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            {t('admin.analytics.timelineHint')}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
          {data.timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t('admin.analytics.empty')}
            </p>
          ) : (
            <MiniBarChart
              data={data.timeline.map((row) => ({
                label: row.day,
                primary: row.activeUsers,
                secondary: row.newSignups,
              }))}
              primaryLabel={t('admin.analytics.activeUsersLabel')}
              secondaryLabel={t('admin.analytics.newSignupsLabel')}
            />
          )}
        </CardContent>
      </Card>

      {/* Engagement distribution */}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">
            {t('admin.analytics.engagementTitle')}
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            {t('admin.analytics.engagementHint')}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
          <DistributionBar
            segments={[
              {
                label: t('admin.analytics.bucketNever'),
                value: data.engagement.neverPlayed,
                colorClass: 'bg-muted-foreground/40',
              },
              {
                label: t('admin.analytics.bucketOnce'),
                value: data.engagement.onceOnly,
                colorClass: 'bg-neon-cyan/60',
              },
              {
                label: t('admin.analytics.bucketLight'),
                value: data.engagement.lightPlayers,
                colorClass: 'bg-neon-cyan',
              },
              {
                label: t('admin.analytics.bucketRegular'),
                value: data.engagement.regularPlayers,
                colorClass: 'bg-neon-purple',
              },
              {
                label: t('admin.analytics.bucketPower'),
                value: data.engagement.powerPlayers,
                colorClass: 'bg-neon-pink',
              },
            ]}
          />
        </CardContent>
      </Card>

      {/* === Churn metrics === */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          icon={<TrendingDown className="h-4 w-4" />}
          label={t('admin.analytics.churn30d')}
          value={percentFormat(data.churn.churnRate30dPercent, lang)}
          hint={t('admin.analytics.churnHint', {
            count: data.churn.inactive30d,
            total: data.churn.everActive,
          })}
          accent="pink"
        />
        <StatCard
          icon={<UserMinus className="h-4 w-4" />}
          label={t('admin.analytics.churn60d')}
          value={percentFormat(data.churn.churnRate60dPercent, lang)}
          hint={t('admin.analytics.churnHint', {
            count: data.churn.inactive60d,
            total: data.churn.everActive,
          })}
          accent="purple"
        />
        <StatCard
          icon={<UserMinus className="h-4 w-4" />}
          label={t('admin.analytics.churn90d')}
          value={percentFormat(data.churn.churnRate90dPercent, lang)}
          hint={t('admin.analytics.churnHint', {
            count: data.churn.inactive90d,
            total: data.churn.everActive,
          })}
          accent="purple"
        />
        <StatCard
          icon={<Zap className="h-4 w-4" />}
          label={t('admin.analytics.stickiness')}
          value={percentFormat(data.churn.stickinessPercent, lang)}
          hint={t('admin.analytics.stickinessHint', {
            dau: data.churn.activeDaily,
            mau: data.churn.activeMonthly,
          })}
          accent="cyan"
        />
      </div>

      {/* Dormancy lifecycle distribution */}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">
            {t('admin.analytics.dormancyTitle')}
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            {t('admin.analytics.dormancyHint')}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
          <DistributionBar
            segments={[
              {
                label: t('admin.analytics.dormancyActive'),
                value: data.dormancy.active,
                colorClass: 'bg-neon-cyan',
              },
              {
                label: t('admin.analytics.dormancyWarm'),
                value: data.dormancy.warm,
                colorClass: 'bg-neon-purple',
              },
              {
                label: t('admin.analytics.dormancyAtRisk'),
                value: data.dormancy.atRisk,
                colorClass: 'bg-warning/80',
              },
              {
                label: t('admin.analytics.dormancyDormant'),
                value: data.dormancy.dormant,
                colorClass: 'bg-score-low/80',
              },
              {
                label: t('admin.analytics.dormancyLost'),
                value: data.dormancy.lost,
                colorClass: 'bg-destructive/80',
              },
              {
                label: t('admin.analytics.dormancyNever'),
                value: data.dormancy.neverLoggedIn,
                colorClass: 'bg-muted-foreground/40',
              },
            ]}
          />
        </CardContent>
      </Card>

      {/* Signup → first-play funnel */}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">
            {t('admin.analytics.funnelTitle')}
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            {t('admin.analytics.funnelHint')}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-3">
          {data.funnel.signups30d === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t('admin.analytics.empty')}
            </p>
          ) : (
            <FunnelSteps
              steps={[
                {
                  label: t('admin.analytics.funnelStepSignup'),
                  value: data.funnel.signups30d,
                  percent: 100,
                  colorClass: 'bg-neon-purple',
                },
                {
                  label: t('admin.analytics.funnelStepPlayed'),
                  value: data.funnel.playedAtLeastOnce,
                  percent: data.funnel.activationRatePercent,
                  colorClass: 'bg-neon-cyan',
                },
                {
                  label: t('admin.analytics.funnelStepRetained'),
                  value: data.funnel.stillActiveAfter7d,
                  percent: data.funnel.week1RetentionPercent,
                  colorClass: 'bg-neon-pink',
                },
              ]}
              lang={lang}
            />
          )}
        </CardContent>
      </Card>

      {/* At-risk power users (streak ≥3, idle 36h–7d) */}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <AlertTriangle className="h-4 w-4 text-warning" />
            {t('admin.analytics.atRiskTitle')}
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            {t('admin.analytics.atRiskHint')}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
          {data.atRiskStreaks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t('admin.analytics.atRiskEmpty')}
            </p>
          ) : (
            <ol className="divide-y divide-border">
              {data.atRiskStreaks.map((row) => (
                <li
                  key={row.userId}
                  className="flex items-center justify-between py-2 gap-2 text-sm"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <span className="flex items-center gap-1 text-neon-pink tabular-nums font-semibold">
                      <Flame className="h-3 w-3" />
                      {row.currentStreak}
                    </span>
                    <span className="min-w-0">
                      <span className="font-medium truncate block">
                        {row.displayName}
                      </span>
                      <span className="text-xs text-muted-foreground truncate block">
                        {row.email}
                      </span>
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                    {t('admin.analytics.atRiskIdle', {
                      time: formatRelative(row.lastLoginAt, lang, never),
                    })}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Top players + recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Gamepad2 className="h-4 w-4" />
              {t('admin.analytics.topBySessionsTitle')}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              {t('admin.analytics.topBySessionsHint')}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
            {data.topBySessions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {t('admin.analytics.empty')}
              </p>
            ) : (
              <ol className="divide-y divide-border">
                {data.topBySessions.map((row, index) => (
                  <li
                    key={row.userId}
                    className="flex items-center justify-between py-2 gap-2 text-sm"
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <span className="text-muted-foreground font-mono w-6 text-center">
                        #{index + 1}
                      </span>
                      <span className="font-medium truncate">{row.displayName}</span>
                    </span>
                    <span className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground">
                        {t('admin.analytics.completedSessions', {
                          completed: row.completed,
                        })}
                      </span>
                      <span className="font-semibold text-neon-cyan tabular-nums">
                        {row.sessions}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Trophy className="h-4 w-4" />
              {t('admin.analytics.topByScoreTitle')}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              {t('admin.analytics.topByScoreHint')}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
            {data.topByScore.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {t('admin.analytics.empty')}
              </p>
            ) : (
              <ol className="divide-y divide-border">
                {data.topByScore.map((row, index) => (
                  <li
                    key={row.userId}
                    className="flex items-center justify-between py-2 gap-2 text-sm"
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <span className="text-muted-foreground font-mono w-6 text-center">
                        #{index + 1}
                      </span>
                      <span className="font-medium truncate">{row.displayName}</span>
                    </span>
                    <span className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground">
                        🔥 {row.currentStreak}
                      </span>
                      <span className="font-semibold text-neon-pink tabular-nums">
                        {numberFormat(row.totalScore, lang)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recently active users */}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">
            {t('admin.analytics.recentlyActiveTitle')}
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            {t('admin.analytics.recentlyActiveHint')}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
          {data.recentlyActive.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t('admin.analytics.empty')}
            </p>
          ) : (
            <div className="overflow-x-auto -mx-2 sm:mx-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="pb-2 px-2 font-medium">{t('admin.analytics.colUser')}</th>
                    <th className="pb-2 px-2 font-medium">{t('admin.analytics.colJoined')}</th>
                    <th className="pb-2 px-2 font-medium">{t('admin.analytics.colLastLogin')}</th>
                    <th className="pb-2 px-2 font-medium">{t('admin.analytics.colLastPlayed')}</th>
                    <th className="pb-2 px-2 font-medium text-right">
                      {t('admin.analytics.colScore')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.recentlyActive.map((row) => (
                    <tr key={row.userId}>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium truncate">{row.displayName}</span>
                          {row.banned && (
                            <span className="text-[10px] uppercase tracking-wide text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
                              {t('admin.analytics.banned')}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {row.email}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-xs text-muted-foreground tabular-nums">
                        {formatDateTime(row.createdAt, lang, never)}
                      </td>
                      <td className="py-2 px-2 text-xs text-muted-foreground tabular-nums">
                        {formatRelative(row.lastLoginAt, lang, never)}
                      </td>
                      <td className="py-2 px-2 text-xs text-muted-foreground tabular-nums">
                        {formatRelative(row.lastPlayedAt, lang, never)}
                      </td>
                      <td className="py-2 px-2 text-right text-xs tabular-nums font-semibold text-neon-cyan">
                        {numberFormat(row.totalScore, lang)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
