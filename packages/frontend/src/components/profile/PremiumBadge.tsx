import { Crown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface PremiumBadgeProps {
  className?: string
  // Compact: just the crown, no label. Used inline next to a name.
  compact?: boolean
}

// Entitlement-derived cosmetic. The component itself is dumb — render
// it conditionally on `billingEntitlement?.isPremium` from the store.
// Visual styling lives on `.premium-badge` in index.css so a future
// theme tweak doesn't require touching this file.
export function PremiumBadge({ className, compact = false }: PremiumBadgeProps) {
  const { t } = useTranslation()
  return (
    <span
      className={cn(
        'premium-badge inline-flex items-center gap-1 rounded-full text-[10px] uppercase tracking-wide',
        compact ? 'px-1.5 py-0.5' : 'px-2 py-0.5',
        className,
      )}
      aria-label={t('premium.badge')}
    >
      <Crown className="h-3 w-3" />
      {!compact && <span>{t('premium.badge')}</span>}
    </span>
  )
}
