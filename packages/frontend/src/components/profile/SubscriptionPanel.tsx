import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useBillingStore } from '@/stores/billingStore'

/**
 * SubscriptionPanel — the account-side view of the user's plan, shown in the
 * profile hub's "Subscription" tab. Premium members manage their plan via the
 * Stripe Billing Portal here; free members get a compact upsell that links to
 * the public `/premium` page (which stays the canonical marketing surface).
 */
export function SubscriptionPanel() {
  const { t, i18n } = useTranslation()
  const { localizedPath } = useLocalizedPath()
  const { entitlement, fetchEntitlement, openPortal, isOpeningPortal } = useBillingStore()

  useEffect(() => {
    void fetchEntitlement()
  }, [fetchEntitlement])

  const handlePortal = async () => {
    const result = await openPortal()
    if ('url' in result) {
      window.location.href = result.url
    } else {
      toast.error(t('pricing.errorPortal'))
    }
  }

  const isPremium = !!entitlement?.isPremium
  const validUntil = entitlement?.validUntil
    ? new Date(entitlement.validUntil).toLocaleDateString(
        i18n.language === 'fr' ? 'fr-FR' : 'en-US',
        { year: 'numeric', month: 'long', day: 'numeric' },
      )
    : null

  if (isPremium) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Sparkles className="size-5 text-neon-pink" />
              {t('profile.subscription.title')}
            </span>
            <Badge className="bg-success/15 text-success border-success/30">
              {t('profile.subscription.premiumBadge')}
            </Badge>
          </CardTitle>
          <CardDescription>
            {validUntil
              ? entitlement?.cancelAtPeriodEnd
                ? t('pricing.cancelScheduled', { date: validUntil })
                : t('pricing.premiumUntil', { date: validUntil })
              : t('profile.subscription.premiumDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handlePortal} disabled={isOpeningPortal} variant="secondary">
            {isOpeningPortal ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
            {t('pricing.ctaManage')}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Sparkles className="size-5 text-neon-pink" />
            {t('profile.subscription.title')}
          </span>
          <Badge variant="outline" className="text-muted-foreground">
            {t('profile.subscription.freeBadge')}
          </Badge>
        </CardTitle>
        <CardDescription>{t('profile.subscription.freeDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="gaming">
          <Link to={localizedPath('/premium')}>
            <Sparkles className="size-4" />
            {t('profile.subscription.upgradeCta')}
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
