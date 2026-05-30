import { useTranslation } from 'react-i18next'
import type { BillingEntitlement } from '@/types'
import { Crown } from 'lucide-react'

export function PremiumBadge({ entitlement }: { entitlement: BillingEntitlement | undefined }) {
  const { t } = useTranslation()
  if (!entitlement) {
    return <span className="text-xs text-muted-foreground">-</span>
  }
  if (!entitlement.isPremium) {
    return <span className="text-xs text-muted-foreground">{t('admin.users.premium.free')}</span>
  }

  const tierLabel =
    entitlement.tier === 'supporter_lifetime'
      ? t('admin.users.premium.tier.supporterLifetime')
      : entitlement.tier === 'premium_annual'
        ? t('admin.users.premium.tier.premiumAnnual')
        : entitlement.tier === 'premium_monthly'
          ? t('admin.users.premium.tier.premiumMonthly')
          : t('admin.users.premium.tier.unknown')

  // supporter (free grant) is bright, paid sub is the same neon-purple/pink
  // we use elsewhere for the gaming accent - the source dot below carries
  // the distinction.
  const sourceDotClass =
    entitlement.source === 'supporter' ? 'bg-neon-cyan' : 'bg-neon-purple'

  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-neon-purple/40 bg-neon-purple/10 px-2 py-0.5 text-xs">
      <Crown className="size-3 text-neon-pink" aria-hidden />
      <span className="font-medium text-neon-pink">{tierLabel}</span>
      <span
        className={`ml-0.5 inline-block size-1.5 rounded-full ${sourceDotClass}`}
        aria-hidden
      />
      {entitlement.cancelAtPeriodEnd && (
        <span className="ml-1 text-[10px] uppercase tracking-wide text-warning">
          {t('admin.users.premium.cancelling')}
        </span>
      )}
    </div>
  )
}
