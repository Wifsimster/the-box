import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { BadgeCheck, Loader2, ShieldCheck, Sparkles } from 'lucide-react'
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
    ? new Date(entitlement.validUntil).toLocaleDateString(i18n.language, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null

  return (
    <PageHero
      icon={Sparkles}
      background="none"
      title={t('pricing.title')}
      subtitle={t('pricing.subtitle')}
    >
      <div className="mx-auto max-w-6xl space-y-8 sm:space-y-10">
        {isAuthenticated && isPremium && (
          <Card variant="success" className="mx-auto max-w-2xl bg-success/5">
            <CardContent className="flex flex-col gap-3 pt-(--card-padding) sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <BadgeCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
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
              </div>
              <Button
                onClick={handlePortal}
                disabled={isOpeningPortal}
                variant="outline"
                className="w-full shrink-0 sm:w-auto"
              >
                {isOpeningPortal && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {t('pricing.ctaManage')}
              </Button>
            </CardContent>
          </Card>
        )}

        <PricingTable />

        <FeatureMatrix />

        <p className="mx-auto flex max-w-2xl items-start justify-center gap-2 text-center text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{t('pricing.footnote')}</span>
        </p>
      </div>
    </PageHero>
  )
}
