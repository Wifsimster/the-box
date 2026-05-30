import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Crown, Lock, Sparkles } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useBillingStore } from '@/stores/billingStore'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'

interface PremiumGateProps {
  children: ReactNode
  // i18n key under `premiumGate.<feature>` for the locked-screen copy
  // (`title`, `description`, optionally `ctaLabel`). Falls back to the
  // generic `premiumGate.default` keys if the feature-specific block is
  // missing — translators can ship the generic copy on day one and add
  // bespoke wording later without breaking the build.
  feature: string
  // Optional alpha tag rendered in the locked card so callers don't have
  // to hand-roll their own banner. Pass `true` for in-alpha features
  // like Geo where users should see they're early.
  alpha?: boolean
}

// Generic premium-only wall. Renders `children` when the user has an
// active entitlement; otherwise shows an upsell card linking to /pricing.
// Loading state is handled by reading `isLoadingEntitlement` so the gate
// doesn't flash the upsell during the initial billing fetch.
export function PremiumGate({ children, feature, alpha = false }: PremiumGateProps) {
  const { t } = useTranslation()
  const { localizedPath } = useLocalizedPath()
  const entitlement = useBillingStore((state) => state.entitlement)
  const isLoading = useBillingStore((state) => state.isLoadingEntitlement)

  if (isLoading || entitlement === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="size-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (entitlement.isPremium) {
    return <>{children}</>
  }

  // The translator-provided copy. We probe for the feature-specific key
  // first (e.g. `premiumGate.geo.title`), fall back to the generic key
  // (`premiumGate.default.title`). t() returns the key itself on miss,
  // which we detect to drive the fallback.
  function copy(field: 'title' | 'description' | 'ctaLabel'): string {
    const specific = `premiumGate.${feature}.${field}`
    const fallback = `premiumGate.default.${field}`
    const candidate = t(specific)
    return candidate === specific ? t(fallback) : candidate
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <Card className="max-w-lg w-full border-2 border-primary/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="size-5 text-primary" />
            <CardTitle>{copy('title')}</CardTitle>
            {alpha && (
              <span className="ml-auto premium-badge inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide">
                <Sparkles className="size-3" />
                <span>{t('premium.alpha')}</span>
              </span>
            )}
          </div>
          <CardDescription>{copy('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link to={localizedPath('/pricing')}>
              <Crown className="size-4 mr-2" />
              {copy('ctaLabel')}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
