import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

interface FreePricingCardProps {
  isCurrentPlan: boolean
  isLoggedIn: boolean
  onSignUp: () => void
}

export function FreePricingCard({ isCurrentPlan, isLoggedIn, onSignUp }: FreePricingCardProps) {
  const { t } = useTranslation()
  // The Free card never goes through Stripe — for unauth users it nudges
  // toward signup, for free-tier signed-in users it's a "you're here" pin.
  const ctaKey = isCurrentPlan
    ? 'pricing.tiers.free.ctaCurrent'
    : isLoggedIn
      ? 'pricing.tiers.free.ctaCurrent'
      : 'pricing.tiers.free.ctaSignUp'

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="h-full"
    >
      <Card className="h-full flex flex-col relative overflow-hidden">
        <CardHeader>
          <CardTitle className="text-xl">{t('pricing.tiers.free.name')}</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">{t('pricing.tiers.free.description')}</p>
        </CardHeader>

        <CardContent className="flex-1 space-y-4">
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold">{t('pricing.tiers.free.price')}</span>
          </div>
        </CardContent>

        <CardFooter>
          <Button
            className="w-full"
            disabled={isCurrentPlan || isLoggedIn}
            onClick={onSignUp}
            variant="outline"
          >
            {isCurrentPlan && <Check className="w-4 h-4 mr-2" aria-hidden="true" />}
            {t(ctaKey)}
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  )
}
