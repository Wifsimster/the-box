import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { PageHero } from '@/components/layout/PageHero'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { useBillingStore } from '@/stores/billingStore'
import { PricingTable } from '@/components/pricing/PricingTable'
import { FeatureMatrix } from '@/components/pricing/FeatureMatrix'

export default function PricingPage() {
  const { t, i18n } = useTranslation()
  const { isAuthenticated } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const { entitlement, fetchEntitlement, openPortal, isOpeningPortal } = useBillingStore()

  // Surface the result of a Stripe-hosted checkout redirect, then strip the
  // query param so a refresh doesn't re-toast.
  useEffect(() => {
    const checkout = searchParams.get('checkout')
    if (!checkout) return
    if (checkout === 'success') {
      toast.success(t('pricing.checkoutSuccess'))
      // Refetch entitlement; the webhook may have already arrived.
      void fetchEntitlement()
    } else if (checkout === 'cancel') {
      toast.info(t('pricing.checkoutCancel'))
    }
    const next = new URLSearchParams(searchParams)
    next.delete('checkout')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams, t, fetchEntitlement])

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
    ? new Date(entitlement.validUntil).toLocaleDateString(i18n.language === 'fr' ? 'fr-FR' : 'en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null

  return (
    <PageHero icon={Sparkles} title={t('pricing.title')} subtitle={t('pricing.subtitle')}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        {isAuthenticated && isPremium && (
          <Card className="border-success/40 bg-success/5">
            <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="font-medium">{t('pricing.alreadyPremium')}</p>
                {validUntil && (
                  <p className="text-sm text-muted-foreground">
                    {entitlement?.cancelAtPeriodEnd
                      ? t('pricing.cancelScheduled', { date: validUntil })
                      : t('pricing.premiumUntil', { date: validUntil })}
                  </p>
                )}
              </div>
              <Button onClick={handlePortal} disabled={isOpeningPortal} variant="secondary">
                {t('pricing.ctaManage')}
              </Button>
            </CardContent>
          </Card>
        )}

        <PricingTable />

        <FeatureMatrix />

        <p className="text-center text-xs text-muted-foreground max-w-2xl mx-auto">
          {t('pricing.footnote')}
        </p>
      </div>
    </PageHero>
  )
}
