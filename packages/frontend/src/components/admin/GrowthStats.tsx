import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { adminApi, type GrowthStats as GrowthStatsData } from '@/lib/api/admin'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TrendingUp, UserPlus, Mail, AlertTriangle, RefreshCw } from 'lucide-react'

export function GrowthStats() {
  const { t, i18n } = useTranslation()
  const [stats, setStats] = useState<GrowthStatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const retry = () => {
    setLoading(true)
    setError(null)
    setReloadKey((k) => k + 1)
  }

  useEffect(() => {
    let cancelled = false
    adminApi.getGrowthStats()
      .then((data) => {
        if (!cancelled) setStats(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message ?? null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [reloadKey])

  if (loading) {
    return (
      <div className="space-y-4 sm:space-y-6" aria-busy="true">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-32" variant="text" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-3 w-40" variant="text" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" variant="text" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-6 w-full" variant="text" />
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error || !stats) {
    return (
      <Card variant="error">
        <CardContent role="alert" className="flex flex-col items-center gap-3 pt-(--card-padding) text-center text-sm">
          <AlertTriangle className="size-6 text-destructive" aria-hidden="true" />
          <p className="text-destructive">{error ?? t('admin.growth.loadError')}</p>
          <Button variant="outline" onClick={retry}>
            <RefreshCw className="size-4" />
            {t('common.retry')}
          </Button>
        </CardContent>
      </Card>
    )
  }

  const formattedLastSent = stats.streakRiskEmail.lastSentAt
    ? new Date(stats.streakRiskEmail.lastSentAt).toLocaleString(i18n.language, {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : t('admin.growth.never')

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <UserPlus className="size-4" aria-hidden="true" />
              {t('admin.growth.referralsClaimed')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold gradient-gaming bg-clip-text text-transparent">
              {stats.referrals.claimedTotal}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('admin.growth.referralsClaimedHint')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <TrendingUp className="size-4" aria-hidden="true" />
              {t('admin.growth.consentRate')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold text-neon-cyan">
              {stats.consent.ratePercent}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('admin.growth.consentHint', {
                consented: stats.consent.consentedUsers,
                total: stats.consent.totalNonGuestUsers,
              })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Mail className="size-4" aria-hidden="true" />
              {t('admin.growth.streakEmails')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold text-neon-pink">
              {stats.streakRiskEmail.sentLast24h}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('admin.growth.streakEmailsHint', {
                week: stats.streakRiskEmail.sentLast7d,
                last: formattedLastSent,
              })}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">{t('admin.growth.topReferrers')}</CardTitle>
          <CardDescription className="text-xs sm:text-sm">{t('admin.growth.topReferrersHint')}</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.referrals.topReferrers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t('admin.growth.noReferrers')}
            </p>
          ) : (
            <ol className="divide-y divide-border">
              {stats.referrals.topReferrers.map((row, index) => (
                <li key={row.userId} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="text-muted-foreground font-mono w-6 shrink-0 text-center">#{index + 1}</span>
                    <span className="truncate font-medium">{row.displayName}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-neon-cyan">{row.count}</span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
