import { useTranslation } from 'react-i18next'
import { m } from 'framer-motion'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { PlanFeatureList } from './PlanFeatureList'
import { FREE_FEATURE_KEYS } from './planFeatures'

interface FreePricingCardProps {
  isCurrentPlan: boolean
  isLoggedIn: boolean
  onSignUp: () => void
}

export function FreePricingCard({ isCurrentPlan, isLoggedIn, onSignUp }: FreePricingCardProps) {
  const { t } = useTranslation()
  // The Free card never goes through Stripe — for guests it nudges toward
  // signup, for free-tier players it's a "you're here" pin, and premium
  // players have nothing to do here so the CTA is dropped.
  const showCta = isCurrentPlan || !isLoggedIn

  return (
    <m.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="h-full"
    >
      <Card className={cn('h-full flex flex-col', isCurrentPlan && 'border-success/50')}>
        <CardHeader>
          <CardTitle className="text-xl">{t('pricing.tiers.free.name')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('pricing.tiers.free.description')}</p>
        </CardHeader>

        <CardContent className="flex-1 space-y-4">
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold">{t('pricing.tiers.free.price')}</span>
          </div>
          <PlanFeatureList featureKeys={FREE_FEATURE_KEYS} />
        </CardContent>

        {showCta && (
          <CardFooter>
            <Button
              size="lg"
              className="h-auto min-h-12 w-full whitespace-normal px-4 py-2"
              disabled={isCurrentPlan}
              onClick={onSignUp}
              variant="outline"
            >
              {isCurrentPlan && <Check className="size-4" aria-hidden="true" />}
              {t(isCurrentPlan ? 'pricing.tiers.free.ctaCurrent' : 'pricing.tiers.free.ctaSignUp')}
            </Button>
          </CardFooter>
        )}
      </Card>
    </m.div>
  )
}
