import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { m, type MotionProps } from 'framer-motion'
import { ArrowRight, Crosshair, Gamepad2, MapPin, type LucideProps } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { GradientIcon } from '@/components/ui/gradient-icon'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useReducedMotionSafe } from '@/hooks/useReducedMotionSafe'

interface ModeCard {
  key: string
  /** Unlocalized route the card links to. */
  path: string
  icon: ComponentType<LucideProps>
  /** i18n key for the visible mode title. */
  titleKey: string
  /** i18n key for the one-sentence description. */
  descriptionKey: string
  /** i18n key for the small status badge (alpha / new). */
  badgeKey: string
}

const MODES: ModeCard[] = [
  {
    key: 'geo',
    path: '/geo',
    icon: MapPin,
    titleKey: 'common.geo',
    descriptionKey: 'home.modes.geo.description',
    badgeKey: 'common.alpha',
  },
  {
    key: 'geogamers',
    path: '/geogamers',
    icon: Crosshair,
    titleKey: 'common.geogamers',
    descriptionKey: 'home.modes.geogamers.description',
    badgeKey: 'common.new',
  },
]

/**
 * Home-page showcase for the app's secondary game modes. The daily challenge
 * gets the loud hero CTA above; this section answers "what are Geo and
 * GeoGamers?" with a one-sentence pitch and an explicit link into each mode,
 * so visitors aren't left guessing what the nav badges mean.
 */
export function HomeModesShowcase() {
  const { t } = useTranslation()
  const { localizedPath } = useLocalizedPath()
  const reducedMotion = useReducedMotionSafe()
  const motionProps = (props: MotionProps): MotionProps =>
    reducedMotion ? {} : props

  return (
    <m.section
      {...motionProps({
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.5, delay: 0.45 },
      })}
      aria-labelledby="home-modes-heading"
      className="max-w-4xl mx-auto mb-8 sm:mb-10 md:mb-12 lg:mb-16"
    >
      <div className="flex items-center gap-3 mb-4 sm:mb-6">
        <GradientIcon
          size="sm"
          icon={<Gamepad2 className="size-4 text-white" />}
          className="shrink-0"
        />
        <div className="min-w-0">
          <h2
            id="home-modes-heading"
            className="text-lg sm:text-xl md:text-2xl font-bold leading-tight gradient-gaming-title"
          >
            {t('home.modes.heading')}
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            {t('home.modes.subheading')}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:gap-5 sm:grid-cols-2">
        {MODES.map((mode) => {
          const Icon = mode.icon
          return (
            <Link
              key={mode.key}
              to={localizedPath(mode.path)}
              className="group relative flex flex-col overflow-hidden rounded-xl border border-neon-purple/30 bg-card/60 backdrop-blur-sm p-5 sm:p-6 transition-colors hover:border-neon-pink/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-12 -right-12 size-32 rounded-full bg-neon-pink/20 blur-3xl opacity-50 group-hover:opacity-70 transition-opacity"
              />
              <div className="relative flex items-center gap-3 mb-3">
                <GradientIcon
                  icon={<Icon className="size-6 text-white" />}
                  className="shrink-0"
                />
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <h3 className="text-base sm:text-lg font-bold leading-tight text-foreground">
                    {t(mode.titleKey)}
                  </h3>
                  <Badge
                    variant="outline"
                    className="border-neon-pink/40 bg-neon-pink/10 text-[10px] uppercase tracking-wide text-neon-pink"
                  >
                    {t(mode.badgeKey)}
                  </Badge>
                </div>
              </div>
              <p className="relative text-sm text-muted-foreground flex-1">
                {t(mode.descriptionKey)}
              </p>
              <span className="relative mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground group-hover:text-neon-pink transition-colors">
                {t('home.modes.cta')}
                <ArrowRight
                  className="size-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </span>
            </Link>
          )
        })}
      </div>
    </m.section>
  )
}
