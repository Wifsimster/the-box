import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Check, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { BillingPrice, BillingTier } from '@the-box/types'

interface PricingCardProps {
  price: BillingPrice
  isCurrentPlan: boolean
  isLoggedIn: boolean
  isWorking: boolean
  isPending: boolean
  highlight?: boolean
  onSelect: (tier: BillingTier) => void
}

function formatAmount(unitAmountCents: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(unitAmountCents / 100)
}

export function PricingCard({
  price,
  isCurrentPlan,
  isLoggedIn,
  isWorking,
  isPending,
  highlight,
  onSelect,
}: PricingCardProps) {
  const { t, i18n } = useTranslation()
  const tierKey = `pricing.tiers.${price.tier}`
  const ctaKey = isCurrentPlan
    ? 'pricing.ctaCurrent'
    : !isLoggedIn
      ? 'pricing.ctaLogin'
      : 'pricing.ctaSubscribe'

  const intervalKey = price.interval === 'month' ? 'pricing.billingMonthly' : 'pricing.billingAnnual'

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn('h-full', highlight && 'md:scale-[1.03]')}
    >
      <Card
        className={cn(
          'h-full flex flex-col relative overflow-hidden',
          highlight && 'border-neon-pink/60 shadow-[0_0_40px_-12px_rgba(244,114,182,0.45)]',
        )}
      >
        {highlight && (
          <Badge
            variant="outline"
            className="absolute top-4 right-4 border-neon-pink/60 text-neon-pink uppercase tracking-wide text-[10px] px-2 py-0.5"
          >
            <Sparkles className="size-3 mr-1" />
            {t(`${tierKey}.highlight`, '')}
          </Badge>
        )}
        <CardHeader className={cn(highlight && 'pr-32')}>
          <CardTitle className="text-xl">{t(`${tierKey}.name`)}</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">{t(`${tierKey}.description`)}</p>
        </CardHeader>

        <CardContent className="flex-1 space-y-4">
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold">{formatAmount(price.unitAmount, i18n.language)}</span>
            <span className="text-muted-foreground text-sm">{t(intervalKey)}</span>
          </div>
          {price.tier === 'premium_annual' && (
            <p className="text-xs text-neon-pink/80 font-medium">{t('pricing.savingsAnnual')}</p>
          )}
        </CardContent>

        <CardFooter>
          <Button
            className="w-full"
            disabled={isCurrentPlan || isWorking}
            aria-busy={isPending}
            onClick={() => onSelect(price.tier)}
            variant={highlight ? 'default' : 'outline'}
          >
            {isPending ? (
              <Loader2 className="size-4 mr-2 animate-spin" aria-hidden="true" />
            ) : isCurrentPlan ? (
              <Check className="size-4 mr-2" aria-hidden="true" />
            ) : null}
            {isPending ? t('pricing.redirecting') : t(ctaKey)}
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  )
}
