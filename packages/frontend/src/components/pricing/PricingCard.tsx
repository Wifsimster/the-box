import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { m } from 'framer-motion'
import { Check, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { BillingPrice, BillingTier } from '@the-box/types'
import { PlanFeatureList } from './PlanFeatureList'
import { PREMIUM_TIER_FEATURE_KEYS } from './planFeatures'

/** Per-card status flags, grouped so the component takes a single object prop
 *  instead of a wide row of booleans. */
export interface PricingCardStatus {
  isCurrentPlan: boolean
  isLoggedIn: boolean
  isWorking: boolean
  isPending: boolean
}

interface PricingCardProps {
  price: BillingPrice
  status: PricingCardStatus
  highlight?: boolean
  onSelect: (tier: BillingTier) => void
}

export function PricingCard({
  price,
  status: { isCurrentPlan, isLoggedIn, isWorking, isPending },
  highlight,
  onSelect,
}: PricingCardProps) {
  const { t, i18n } = useTranslation()
  // Hoist the currency formatter out of per-call construction; rebuild only
  // when the active locale changes.
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [i18n.language],
  )
  const tierKey = `pricing.tiers.${price.tier}`
  // One-time tiers (interval === null, e.g. supporter_lifetime) aren't a
  // "subscription" — use patronage wording and a one-time price label.
  const isOneTime = price.interval === null
  const ctaKey = isCurrentPlan
    ? 'pricing.ctaCurrent'
    : !isLoggedIn
      ? 'pricing.ctaLogin'
      : isOneTime
        ? 'pricing.ctaSupporter'
        : 'pricing.ctaSubscribe'

  const intervalKey = isOneTime
    ? 'pricing.billingLifetime'
    : price.interval === 'month'
      ? 'pricing.billingMonthly'
      : 'pricing.billingAnnual'

  const isAnnual = price.tier === 'premium_annual'

  return (
    <m.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn('h-full', highlight && 'max-md:order-first md:scale-[1.03]')}
    >
      <Card
        className={cn(
          'h-full flex flex-col',
          highlight && 'border-neon-pink/60 shadow-[var(--glow-pink-lg)]',
          isCurrentPlan && 'border-success/50',
        )}
      >
        <CardHeader>
          {highlight && (
            <Badge
              variant="outline"
              className="mb-1 w-fit gap-1 border-neon-pink/60 text-xs text-neon-pink"
            >
              <Sparkles className="size-3" aria-hidden="true" />
              {t(`${tierKey}.highlight`, '')}
            </Badge>
          )}
          <CardTitle className="text-xl">{t(`${tierKey}.name`)}</CardTitle>
          <p className="text-sm text-muted-foreground">{t(`${tierKey}.description`)}</p>
        </CardHeader>

        <CardContent className="flex-1 space-y-4">
          <div>
            <div className="flex flex-wrap items-baseline gap-x-1">
              <span className="text-4xl font-bold">{currencyFormatter.format(price.unitAmount / 100)}</span>
              <span className="text-sm text-muted-foreground">{t(intervalKey)}</span>
            </div>
            {isAnnual && (
              <p className="mt-1 text-sm text-muted-foreground">
                {t('pricing.annualEquivalent', { price: currencyFormatter.format(price.unitAmount / 100 / 12) })}
              </p>
            )}
            {isAnnual && (
              <p className="mt-1 text-sm font-medium text-neon-pink">{t('pricing.savingsAnnual')}</p>
            )}
            {isOneTime && (
              <p className="mt-1 text-sm font-medium text-neon-pink">{t('pricing.supporterNote')}</p>
            )}
          </div>
          <PlanFeatureList
            featureKeys={PREMIUM_TIER_FEATURE_KEYS[price.tier]}
            leadKey="pricing.features.everythingInFree"
          />
        </CardContent>

        <CardFooter>
          <Button
            size="lg"
            className="h-auto min-h-12 w-full whitespace-normal px-4 py-2"
            disabled={isCurrentPlan || isWorking}
            aria-busy={isPending}
            onClick={() => onSelect(price.tier)}
            variant={highlight && !isCurrentPlan ? 'gaming' : 'outline'}
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : isCurrentPlan ? (
              <Check className="size-4" aria-hidden="true" />
            ) : null}
            {isPending ? t('pricing.redirecting') : t(ctaKey)}
          </Button>
        </CardFooter>
      </Card>
    </m.div>
  )
}
