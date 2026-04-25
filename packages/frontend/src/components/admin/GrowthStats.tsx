import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { adminApi, type GrowthStats as GrowthStatsData } from '@/lib/api/admin'
import { TrendingUp, UserPlus, Mail, Loader2 } from 'lucide-react'

export function GrowthStats() {
  const { t, i18n } = useTranslation()
  const [stats, setStats] = useState<GrowthStatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect -- Necessary pattern for data fetching */
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    adminApi.getGrowthStats()
      .then((data) => {
        if (!cancelled) setStats(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message ?? 'Failed to load growth stats')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !stats) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-destructive">
          {error ?? t('admin.growth.loadError')}
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
          <CardHeader className="pb-2 p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <UserPlus className="h-4 w-4" />
              {t('admin.growth.referralsClaimed')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
            <div className="text-2xl sm:text-3xl font-bold gradient-gaming bg-clip-text text-transparent">
              {stats.referrals.claimedTotal}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('admin.growth.referralsClaimedHint')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              {t('admin.growth.consentRate')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
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
          <CardHeader className="pb-2 p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Mail className="h-4 w-4" />
              {t('admin.growth.streakEmails')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
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
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">{t('admin.growth.topReferrers')}</CardTitle>
          <CardDescription className="text-xs sm:text-sm">{t('admin.growth.topReferrersHint')}</CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
          {stats.referrals.topReferrers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t('admin.growth.noReferrers')}
            </p>
          ) : (
            <ol className="divide-y divide-border">
              {stats.referrals.topReferrers.map((row, index) => (
                <li key={row.userId} className="flex items-center justify-between py-2 text-sm">
                  <span className="flex items-center gap-3">
                    <span className="text-muted-foreground font-mono w-6 text-center">#{index + 1}</span>
                    <span className="font-medium">{row.displayName}</span>
                  </span>
                  <span className="font-semibold text-neon-cyan">{row.count}</span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
