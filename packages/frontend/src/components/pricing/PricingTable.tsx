import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import type { BillingTier } from '@the-box/types'
import { useAuth } from '@/hooks/useAuth'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useBillingStore } from '@/stores/billingStore'
import { PricingCard } from './PricingCard'

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
    const result = await startCheckout(tier)
    if ('url' in result) {
      window.location.href = result.url
    } else {
      toast.error(t('pricing.errorCheckout'))
    }
  }

  if (!pricesLoaded) {
    return <p className="text-center text-muted-foreground">{t('pricing.loading')}</p>
  }

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {prices.map((price) => (
        <PricingCard
          key={price.tier}
          price={price}
          isCurrentPlan={entitlement?.tier === price.tier && entitlement.isPremium}
          isLoggedIn={isAuthenticated}
          isWorking={isStartingCheckout}
          highlight={price.tier === 'premium_annual'}
          onSelect={handleSelect}
        />
      ))}
    </div>
  )
}
