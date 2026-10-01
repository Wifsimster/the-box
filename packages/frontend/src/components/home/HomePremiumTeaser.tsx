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
      className="max-w-2xl mx-auto"
    >
      <Link
        to={premiumHref}
        className="group relative block overflow-hidden rounded-xl border border-neon-pink/40 bg-linear-to-br from-neon-pink/20 via-background/60 to-neon-purple/20 backdrop-blur-sm transition-colors hover:border-neon-pink/70 active:border-neon-pink/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 -left-16 size-40 rounded-full bg-neon-pink/30 blur-3xl opacity-60 group-hover:opacity-80 transition-opacity"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-20 -right-10 size-40 rounded-full bg-neon-purple/30 blur-3xl opacity-60 group-hover:opacity-80 transition-opacity"
        />

        <div className="relative flex items-start gap-4 sm:gap-5 p-(--card-padding)">
          <GradientIcon
            icon={<Sparkles className="size-5 sm:size-7 text-white" aria-hidden="true" />}
            className="shrink-0 size-10 sm:size-14"
          />
          <div className="flex-1 min-w-0">
            <Badge
              variant="outline"
              className="mb-1.5 border-neon-pink/50 bg-neon-pink/15 text-neon-pink uppercase tracking-wider"
            >
              {t('home.premium.badge')}
            </Badge>
            <h2 className="text-xl sm:text-2xl font-semibold leading-tight text-foreground">
              {t('home.premium.title')}
            </h2>
            <p className="mt-1.5 hidden sm:block text-sm text-muted-foreground max-w-xl">
              {t('home.premium.subtitle')}
            </p>
            {monthlyPriceLabel && (
              <p className="mt-2 text-sm sm:text-base font-semibold text-neon-pink">
                {t('home.premium.priceFrom', { price: monthlyPriceLabel })}
              </p>
            )}
            <ul className="mt-3 grid gap-1.5 text-sm text-foreground">
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
              <ArrowRight className="size-4 transition-transform motion-safe:group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </div>
        </div>
      </Link>
    </m.div>
  )
}
