import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BarChart3, Clock, Lightbulb, Sparkles, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { userApi } from '@/lib/api/user'
import type { AdvancedStats } from '@the-box/types'

function formatMs(ms: number): string {
  if (!ms || ms < 0) return '—'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

// Premium-only stats panel. The parent is responsible for not rendering
// this for free users; if it mounts and the server still 402s (race
// against entitlement change), the panel renders the empty state rather
// than crashing.
export function AdvancedStatsPanel() {
  const { t } = useTranslation()
  const [stats, setStats] = useState<AdvancedStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect -- Necessary pattern for data fetching */
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    userApi
      .getAdvancedStats()
      .then((data) => {
        if (!cancelled) setStats(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'load_failed')
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="size-5 text-primary" />
            {t('advancedStats.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
          <Skeleton className="h-32 mt-4" />
        </CardContent>
      </Card>
    )
  }

  if (error || !stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="size-5 text-primary" />
            {t('advancedStats.title')}
          </CardTitle>
          <CardDescription>{t('advancedStats.errorMessage')}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  // Empty-state: brand-new premium user with zero completed sessions yet.
  // Skip the percentile/time blocks they wouldn't make sense for and show
  // a single explanatory card instead.
  if (stats.totalCompletedSessions === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="size-5 text-primary" />
            {t('advancedStats.title')}
          </CardTitle>
          <CardDescription>{t('advancedStats.emptyState')}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const maxMonthly = Math.max(
    1,
    ...stats.monthlyScores.map((m) => m.totalScore),
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="size-5 text-primary" />
          {t('advancedStats.title')}
        </CardTitle>
        <CardDescription>{t('advancedStats.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Headline aggregates */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile
            icon={<Sparkles className="size-4 text-warning" />}
            label={t('advancedStats.bestScore')}
            value={stats.bestScore.toLocaleString()}
          />
          <StatTile
            icon={<TrendingUp className="size-4 text-success" />}
            label={t('advancedStats.averageScore')}
            value={stats.averageScore.toLocaleString()}
          />
          <StatTile
            icon={<BarChart3 className="size-4 text-primary" />}
            label={t('advancedStats.completedSessions')}
            value={stats.totalCompletedSessions.toLocaleString()}
          />
          <StatTile
            icon={<Sparkles className="size-4 text-neon-pink" />}
            label={t('advancedStats.perfectSessions')}
            value={stats.perfectSessions.toLocaleString()}
          />
        </div>

        {/* Solve-time percentiles */}
        <section>
          <h3 className="flex items-center gap-2 text-sm font-semibold mb-2">
            <Clock className="size-4 text-muted-foreground" />
            {t('advancedStats.solveTime')}
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile label={t('advancedStats.p25')} value={formatMs(stats.solveTimeMs.p25)} dim />
            <StatTile label={t('advancedStats.median')} value={formatMs(stats.solveTimeMs.median)} dim />
            <StatTile label={t('advancedStats.p75')} value={formatMs(stats.solveTimeMs.p75)} dim />
            <StatTile label={t('advancedStats.mean')} value={formatMs(stats.solveTimeMs.mean)} dim />
          </div>
        </section>

        {/* Hint usage */}
        <section>
          <h3 className="flex items-center gap-2 text-sm font-semibold mb-2">
            <Lightbulb className="size-4 text-muted-foreground" />
            {t('advancedStats.hintUsage')}
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile label={t('advancedStats.hintYear')} value={String(stats.hintUsage.hint_year)} dim />
            <StatTile label={t('advancedStats.hintPublisher')} value={String(stats.hintUsage.hint_publisher)} dim />
            <StatTile label={t('advancedStats.hintDeveloper')} value={String(stats.hintUsage.hint_developer)} dim />
            <StatTile label={t('advancedStats.hintGenre')} value={String(stats.hintUsage.hint_genre)} dim />
          </div>
        </section>

        {/* 6-month progression bar chart, inline SVG-free for portability */}
        {stats.monthlyScores.length > 0 && (
          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold mb-2">
              <TrendingUp className="size-4 text-muted-foreground" />
              {t('advancedStats.monthlyProgression')}
            </h3>
            <div className="flex items-end gap-2 h-32">
              {stats.monthlyScores.map((m) => {
                const ratio = m.totalScore / maxMonthly
                const heightPct = Math.max(8, Math.round(ratio * 100))
                return (
                  <div
                    key={m.month}
                    className="flex flex-col items-center gap-1 flex-1"
                    title={`${m.month} · ${m.totalScore.toLocaleString()} pts`}
                  >
                    <div className="w-full flex flex-col justify-end h-24">
                      <div
                        className="w-full rounded-t bg-linear-to-t from-primary to-neon-pink"
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{m.month.slice(5)}</span>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  )
}

interface StatTileProps {
  icon?: React.ReactNode
  label: string
  value: string
  dim?: boolean
}

function StatTile({ icon, label, value, dim }: StatTileProps) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-3 space-y-1">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
        {icon}
        <span>{label}</span>
      </div>
      <div className={dim ? 'text-lg font-semibold' : 'text-2xl font-bold text-foreground'}>{value}</div>
    </div>
  )
}
