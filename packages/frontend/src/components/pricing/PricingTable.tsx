import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import type { BillingTier } from '@the-box/types'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { withRedirect } from '@/components/security/authRedirect'
import { useAuth } from '@/hooks/useAuth'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useBillingStore } from '@/stores/billingStore'
import { FreePricingCard } from './FreePricingCard'
import { PricingCard } from './PricingCard'

function PricingCardSkeleton() {
  // Mirrors PricingCard's vertical rhythm so swapping in the real card
  // doesn't shift layout once /api/billing/prices resolves.
  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-48 mt-2" />
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        <Skeleton className="h-10 w-24" />
        <div className="space-y-2 pt-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-44" />
        </div>
      </CardContent>
      <CardFooter>
        <Skeleton className="h-12 w-full" />
      </CardFooter>
    </Card>
  )
}

export function PricingTable() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { localizedPath } = useLocalizedPath()
  const { isAuthenticated } = useAuth()
  const {
    prices,
    pricesLoaded,
    entitlement,
    isStartingCheckout,
    fetchPrices,
    fetchEntitlement,
    startCheckout,
  } = useBillingStore()

  // Local mirror of which tier the user just clicked, so the spinner lives
  // on the right card. Cleared in finally even if the store throws so the
  // button doesn't get stuck mid-animation.
  const [pendingTier, setPendingTier] = useState<BillingTier | null>(null)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    void fetchPrices()
  }, [fetchPrices])

  useEffect(() => {
    void fetchEntitlement()
  }, [fetchEntitlement, isAuthenticated])

  const handleSelect = async (tier: BillingTier) => {
    if (!isAuthenticated) {
      navigate(withRedirect(localizedPath('/login'), localizedPath('/premium')))
      return
    }
    setPendingTier(tier)
    try {
      const result = await startCheckout(tier)
      if ('url' in result) {
        window.location.href = result.url
      } else {
        toast.error(t('pricing.errorCheckout'))
      }
    } finally {
      setPendingTier(null)
    }
  }

  const handleSignUp = () => {
    navigate(withRedirect(localizedPath('/register'), localizedPath('/premium')))
  }

  const retryPrices = async () => {
    setRetrying(true)
    try {
      await fetchPrices()
    } finally {
      setRetrying(false)
    }
  }

  const onFreePlan = isAuthenticated && !entitlement?.isPremium

  const pricesUnavailable = pricesLoaded && prices.length === 0

  // Card grid: Free (anchor) → Monthly → Annual (highlighted) → Lifetime.
  // Stacked on phones with the recommended plan pulled to the top, two
  // columns on tablet, four on desktop.
  return (
    <div className="space-y-4">
      <div
        className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-4"
        aria-busy={!pricesLoaded}
      >
        {!pricesLoaded ? (
          <>
            <span className="sr-only" role="status">{t('pricing.loading')}</span>
            <PricingCardSkeleton />
            <PricingCardSkeleton />
            <PricingCardSkeleton />
            <PricingCardSkeleton />
          </>
        ) : (
          <>
            <FreePricingCard
              isCurrentPlan={onFreePlan}
              isLoggedIn={isAuthenticated}
              onSignUp={handleSignUp}
            />
            {prices.map((price) => (
              <PricingCard
                key={price.tier}
                price={price}
                status={{
                  isCurrentPlan: entitlement?.tier === price.tier && entitlement.isPremium,
                  isLoggedIn: isAuthenticated,
                  isWorking: isStartingCheckout,
                  isPending: pendingTier === price.tier,
                }}
                highlight={price.tier === 'premium_annual'}
                onSelect={handleSelect}
              />
            ))}
          </>
        )}
      </div>

      {pricesUnavailable && (
        <Card variant="warning" role="alert" className="mx-auto max-w-2xl">
          <CardContent className="flex flex-col items-center gap-3 pt-(--card-padding) text-center sm:flex-row sm:text-left">
            <AlertTriangle className="size-5 shrink-0 text-warning" aria-hidden="true" />
            <p className="flex-1 text-sm">{t('pricing.errorPrices')}</p>
            <Button
              variant="outline"
              onClick={() => void retryPrices()}
              disabled={retrying}
              className="w-full sm:w-auto"
            >
              {retrying ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="size-4" aria-hidden="true" />
              )}
              {t('common.retry')}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
