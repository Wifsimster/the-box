import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import type { BillingTier } from '@the-box/types'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
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
      </CardContent>
      <CardFooter>
        <Skeleton className="h-10 w-full" />
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

  useEffect(() => {
    void fetchPrices()
  }, [fetchPrices])

  useEffect(() => {
    void fetchEntitlement()
  }, [fetchEntitlement, isAuthenticated])

  const handleSelect = async (tier: BillingTier) => {
    if (!isAuthenticated) {
      navigate(localizedPath('/login'), {
        state: { redirectTo: localizedPath('/premium') },
      })
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
    navigate(localizedPath('/register'))
  }

  const onFreePlan = isAuthenticated && !entitlement?.isPremium

  // Card grid: Free (anchor) → Monthly → Annual (highlighted) → Lifetime.
  // Two columns on tablet, four on desktop; on mobile each card stacks.
  // The max-w cap keeps cards from stretching too wide on big screens.
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 max-w-6xl mx-auto">
      {!pricesLoaded ? (
        <>
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
  )
}
