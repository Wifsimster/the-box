import { useEffect, useMemo, type ReactNode } from 'react'
import { motion, type MotionProps } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Lock, Trophy, ArrowRight } from 'lucide-react'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from '@/components/ui/carousel'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { GradientIcon } from '@/components/ui/gradient-icon'
import { useAchievementStore } from '@/stores/achievementStore'
import { useSession } from '@/lib/auth-client'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { prefersReducedMotion } from '@/lib/animations'
import { cn } from '@/lib/utils'
import type { Achievement, AchievementWithProgress } from '@the-box/types'

// Shape we render in the teaser. We coerce both `Achievement` (catalog,
// guests) and `AchievementWithProgress` (authenticated user view) to this.
interface TeaserAchievement {
  id: number
  key: string
  name: string
  description: string
  iconUrl: string | null
  points: number
  tier: number
}

const TEASER_COUNT = 3

// Match AchievementGrid's `sortByDifficulty`: tier ASC, then points ASC.
// "First N unearned" needs a deterministic order so re-renders don't shuffle.
function pickTeaserAchievements<T extends TeaserAchievement>(list: T[]): T[] {
  return [...list]
    .sort((a, b) => (a.tier !== b.tier ? a.tier - b.tier : a.points - b.points))
    .slice(0, TEASER_COUNT)
}

interface TeaserCardProps {
  achievement: TeaserAchievement
  lockedLabel: string
}

function TeaserCard({ achievement, lockedLabel }: TeaserCardProps) {
  return (
    <div
      className="group relative h-full overflow-hidden rounded-xl border border-neon-purple/30 bg-card/60 backdrop-blur-sm transition-colors hover:border-neon-pink/60"
      aria-label={`${achievement.name} — ${lockedLabel}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-neon-pink/20 blur-3xl opacity-50 group-hover:opacity-70 transition-opacity"
      />
      <div className="relative flex flex-col items-center text-center p-5 sm:p-6 gap-3">
        <div className="relative">
          <GradientIcon
            icon={
              <span className="text-2xl leading-none" aria-hidden="true">
                {achievement.iconUrl ?? '🏆'}
              </span>
            }
            className="opacity-90 grayscale-[0.3] group-hover:grayscale-0 group-hover:opacity-100 transition"
          />
          <span
            className="absolute -bottom-1.5 -right-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-background/90 border border-neon-purple/40 text-foreground"
            role="img"
            aria-label={lockedLabel}
          >
            <Lock className="h-3 w-3" aria-hidden="true" />
          </span>
        </div>
        <h3 className="text-sm sm:text-base font-semibold leading-tight text-foreground">
          {achievement.name}
        </h3>
        <p className="text-xs sm:text-sm text-muted-foreground line-clamp-3">
          {achievement.description}
        </p>
        <Badge
          variant="outline"
          className="border-neon-purple/40 bg-neon-purple/10 text-[11px] uppercase tracking-wide text-neon-purple"
        >
          {achievement.points} pts
        </Badge>
      </div>
    </div>
  )
}

function TeaserSkeleton() {
  return (
    <div className="rounded-xl border border-white/10 bg-card/40 p-5 sm:p-6 flex flex-col items-center gap-3">
      <Skeleton className="h-12 w-12 rounded-xl" />
      <Skeleton className="h-4 w-3/4" variant="text" />
      <Skeleton className="h-3 w-full" variant="text" />
      <Skeleton className="h-3 w-5/6" variant="text" />
      <Skeleton className="h-5 w-16" />
    </div>
  )
}

export function HomeAchievementTeaser() {
  const { t } = useTranslation()
  const { data: session } = useSession()
  const { localizedPath } = useLocalizedPath()
  const userId = session?.user?.id

  const reducedMotion = useMemo(() => prefersReducedMotion(), [])
  const motionProps = (props: MotionProps): MotionProps =>
    reducedMotion ? {} : props

  const {
    achievements,
    userAchievements,
    isLoading,
    isLoadingUserAchievements,
    fetchAchievements,
    fetchUserAchievements,
  } = useAchievementStore()

  // Authenticated → fetch progress so we can prefer locked/unearned items.
  // Guest → fetch the public catalog and treat all as locked.
  useEffect(() => {
    if (userId) {
      if (userAchievements.length === 0 && !isLoadingUserAchievements) {
        fetchUserAchievements().catch(() => {})
      }
    } else if (achievements.length === 0 && !isLoading) {
      fetchAchievements().catch(() => {})
    }
    // We intentionally only re-run on auth changes: the store already
    // guards against parallel fetches and we don't want to refetch on
    // every render of the home page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const loading = userId ? isLoadingUserAchievements : isLoading

  // Stable per-render-session pick. `useMemo` keyed on the underlying
  // arrays; since the store caches results, this is a single computation
  // unless the user logs in/out mid-session.
  const teaser = useMemo<TeaserAchievement[]>(() => {
    if (userId) {
      const unearned = userAchievements.filter(
        (a: AchievementWithProgress) =>
          !a.isHidden &&
          !a.earned &&
          !(a.progressMax != null && a.progress >= a.progressMax),
      )
      // If somehow the user has earned everything, fall back to the full
      // catalog so the teaser still renders (slim chance, but harmless).
      const pool = unearned.length >= TEASER_COUNT
        ? unearned
        : userAchievements.filter((a) => !a.isHidden)
      return pickTeaserAchievements(pool).map((a) => ({
        id: a.id,
        key: a.key,
        name: a.name,
        description: a.description,
        iconUrl: a.iconUrl,
        points: a.points,
        tier: a.tier,
      }))
    }
    const pool = achievements.filter((a: Achievement) => !a.isHidden)
    return pickTeaserAchievements(pool).map((a) => ({
      id: a.id,
      key: a.key,
      name: a.name,
      description: a.description,
      iconUrl: a.iconUrl,
      points: a.points,
      tier: a.tier,
    }))
  }, [userId, userAchievements, achievements])

  // Fail soft: if the API errored or returned nothing, render nothing.
  // Loading state still shows skeletons (so the section doesn't pop in).
  if (!loading && teaser.length === 0) {
    return null
  }

  const lockedLabel = t('achievements.filters.locked')

  // Render either skeletons or real cards through the same layout shells
  // so mobile/desktop parity is identical between states.
  const items: ReactNode[] = loading
    ? Array.from({ length: TEASER_COUNT }).map((_, i) => (
        <TeaserSkeleton key={`sk-${i}`} />
      ))
    : teaser.map((a) => (
        <TeaserCard key={a.id} achievement={a} lockedLabel={lockedLabel} />
      ))

  return (
    <motion.section
      {...motionProps({
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.5, delay: 0.5 },
      })}
      aria-labelledby="home-achievements-heading"
      className="max-w-4xl mx-auto mb-8 sm:mb-10 md:mb-12 lg:mb-16"
    >
      <div className="flex items-end justify-between gap-4 mb-4 sm:mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <GradientIcon
            size="sm"
            icon={<Trophy className="h-4 w-4 text-white" />}
            className="shrink-0"
          />
          <div className="min-w-0">
            <h2
              id="home-achievements-heading"
              className="text-lg sm:text-xl md:text-2xl font-bold leading-tight gradient-gaming-title"
            >
              {t('home.achievements.heading')}
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              {t('home.achievements.subheading')}
            </p>
          </div>
        </div>
        <Link
          to={localizedPath('/profile')}
          className="hidden sm:inline-flex items-center gap-1.5 min-h-[44px] px-3 py-2 -mx-3 rounded-md text-sm font-semibold text-foreground hover:text-neon-pink transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {t('home.achievements.cta')}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      {/* Mobile: swipeable carousel, 1 card visible. */}
      <div className="md:hidden">
        <Carousel
          opts={{ align: 'start', loop: false }}
          className="w-full"
          aria-label={t('home.achievements.heading')}
        >
          <CarouselContent className="-ml-3">
            {items.map((node, i) => (
              <CarouselItem
                key={i}
                className={cn('pl-3 basis-[85%]')}
              >
                <div className="h-full">{node}</div>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      </div>

      {/* Desktop md+: static 3-column grid. */}
      <div className="hidden md:grid grid-cols-3 gap-5 lg:gap-6">
        {items.map((node, i) => (
          <div key={i} className="h-full">
            {node}
          </div>
        ))}
      </div>

      {/* Mobile-only CTA below the carousel; desktop CTA sits in the header. */}
      <div className="mt-4 sm:hidden text-center">
        <Link
          to={localizedPath('/profile')}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-md text-sm font-semibold text-foreground hover:text-neon-pink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {t('home.achievements.cta')}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </motion.section>
  )
}
