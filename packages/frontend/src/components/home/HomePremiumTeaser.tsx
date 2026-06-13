import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { m, type MotionProps } from 'framer-motion'
import { ArrowRight, Check, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { GradientIcon } from '@/components/ui/gradient-icon'

/**
 * Premium upsell card on the home page. Extracted from HomePage so the
 * page component stays focused on daily-challenge orchestration.
 */
export function HomePremiumTeaser({
  premiumHref,
  monthlyPriceLabel,
  motionProps,
}: {
  premiumHref: string
  monthlyPriceLabel: string | null
  motionProps: (props: MotionProps) => MotionProps
}) {
  const { t } = useTranslation()
  return (
    <m.div
      {...motionProps({
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.5, delay: 0.5 },
      })}
      className="max-w-2xl mx-auto mb-8 sm:mb-10 md:mb-12"
    >
      <Link
        to={premiumHref}
        className="group relative block overflow-hidden rounded-2xl border border-neon-pink/40 bg-linear-to-br from-neon-pink/20 via-background/60 to-neon-purple/20 backdrop-blur-sm transition-colors hover:border-neon-pink/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 -left-16 size-40 rounded-full bg-neon-pink/30 blur-3xl opacity-60 group-hover:opacity-80 transition-opacity"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-20 -right-10 size-40 rounded-full bg-neon-purple/30 blur-3xl opacity-60 group-hover:opacity-80 transition-opacity"
        />

        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-5 p-5 sm:p-6">
          <GradientIcon
            icon={<Sparkles className="size-6 sm:size-7 text-white" />}
            className="shrink-0 size-12 sm:size-14"
          />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <Badge
                variant="outline"
                className="border-neon-pink/50 bg-neon-pink/15 text-neon-pink uppercase tracking-wider"
              >
                {t('home.premium.badge')}
              </Badge>
              <span className="text-[11px] sm:text-xs uppercase tracking-wide font-semibold text-muted-foreground">
                {t('home.premium.eyebrow')}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold leading-tight gradient-gaming bg-clip-text text-transparent">
              {t('home.premium.title')}
            </h2>
            <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground max-w-xl">
              {t('home.premium.subtitle')}
            </p>
            {monthlyPriceLabel && (
              <p className="mt-2 text-sm sm:text-base font-semibold text-neon-pink">
                {t('home.premium.priceFrom', { price: monthlyPriceLabel })}
              </p>
            )}
            <ul className="mt-3 grid gap-1.5 text-xs sm:text-sm text-foreground/90">
              {[
                t('home.premium.perkArchive'),
                t('home.premium.perkHints'),
                t('home.premium.perkCosmetics'),
              ].map((perk) => (
                <li key={perk} className="flex items-start gap-2">
                  <Check className="size-4 mt-0.5 shrink-0 text-neon-pink" aria-hidden="true" />
                  <span>{perk}</span>
                </li>
              ))}
            </ul>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground group-hover:text-neon-pink transition-colors">
              {t('home.premium.cta')}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </Link>
    </m.div>
  )
}
