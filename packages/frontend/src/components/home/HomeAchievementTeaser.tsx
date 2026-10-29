import { useEffect, useMemo, type ReactNode } from 'react'
import { m, type MotionProps } from 'framer-motion'
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
import { useReducedMotionSafe } from '@/hooks/useReducedMotionSafe'
import type { Achievement, AchievementWithProgress } from '@the-box/types'

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

function pickTeaserAchievements<T extends TeaserAchievement>(list: T[]): T[] {
  return list
    .toSorted((a, b) =>
      a.tier !== b.tier ? a.tier - b.tier : a.points - b.points,
    )
    .slice(0, TEASER_COUNT)
}

interface TeaserCardProps {
  achievement: TeaserAchievement
  lockedLabel: string
}

function TeaserCard({ achievement, lockedLabel }: TeaserCardProps) {
  const { t } = useTranslation()
  const localizedName = t(`achievements.items.${achievement.key}.name`, {
    defaultValue: achievement.name,
  })
  const localizedDescription = t(`achievements.items.${achievement.key}.description`, {
    defaultValue: achievement.description,
  })
  return (
    <div className="group relative h-full overflow-hidden rounded-xl border border-neon-purple/30 bg-card/60 backdrop-blur-sm transition-colors hover:border-neon-pink/60">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-12 -right-12 size-32 rounded-full bg-neon-pink/20 blur-3xl opacity-50 group-hover:opacity-70 transition-opacity"
      />
      <div className="relative flex flex-col items-center text-center p-(--card-padding) gap-3">
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
            className="absolute -bottom-1.5 -right-1.5 inline-flex size-6 items-center justify-center rounded-full bg-background/90 border border-neon-purple/40 text-foreground"
            aria-hidden="true"
          >
            <Lock className="size-3" />
          </span>
        </div>
        <h3 className="text-base font-semibold leading-tight text-foreground">
          {localizedName}
          <span className="sr-only">{` — ${lockedLabel}`}</span>
        </h3>
        <p className="text-sm text-muted-foreground line-clamp-3">
          {localizedDescription}
        </p>
        <Badge
          variant="outline"
          className="border-primary/40 bg-primary/10 text-xs uppercase tracking-wide text-primary"
        >
          {achievement.points} pts
        </Badge>
      </div>
    </div>
  )
}

function TeaserSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card/40 p-(--card-padding) flex flex-col items-center gap-3">
      <Skeleton className="size-12 rounded-xl" />
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

  const reducedMotion = useReducedMotionSafe()
  const motionProps = (props: MotionProps): MotionProps =>
    reducedMotion ? {} : props

  const {
    achievements,
    userAchievements,
    isLoading,
    isLoadingUserAchievements,
  } = useAchievementStore()

  useEffect(() => {
    const store = useAchievementStore.getState()
    if (userId) {
      if (
        store.userAchievements.length === 0 &&
        !store.isLoadingUserAchievements
      ) {
        store.fetchUserAchievements().catch(() => {})
      }
    } else if (store.achievements.length === 0 && !store.isLoading) {
      store.fetchAchievements().catch(() => {})
    }
  }, [userId])

  const loading = userId ? isLoadingUserAchievements : isLoading

  const teaser = useMemo<TeaserAchievement[]>(() => {
    if (userId) {
      const unearned = userAchievements.filter(
        (a: AchievementWithProgress) =>
          !a.isHidden &&
          !a.earned &&
          !(a.progressMax != null && a.progress >= a.progressMax),
      )
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

  if (!loading && teaser.length === 0) {
    return null
  }

  const lockedLabel = t('achievements.filters.locked')

  const items: { key: string; node: ReactNode }[] = loading
    ? Array.from({ length: TEASER_COUNT }).map((_, i) => ({
        key: `sk-${i}`,
        node: <TeaserSkeleton />,
      }))
    : teaser.map((a) => ({
        key: String(a.id),
        node: <TeaserCard achievement={a} lockedLabel={lockedLabel} />,
      }))

  return (
    <m.section
      {...motionProps({
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.5, delay: 0.5 },
      })}
      aria-labelledby="home-achievements-heading"
      aria-busy={loading || undefined}
      className="max-w-4xl mx-auto"
    >
      <div className="flex items-end justify-between gap-4 mb-4 sm:mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <GradientIcon
            size="sm"
            icon={<Trophy className="size-4 text-white" aria-hidden="true" />}
            className="shrink-0"
          />
          <div className="min-w-0">
            <h2
              id="home-achievements-heading"
              className="text-xl sm:text-2xl font-semibold leading-tight text-foreground"
            >
              {t('home.achievements.heading')}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('home.achievements.subheading')}
            </p>
          </div>
        </div>
        <Link
          to={localizedPath('/profile')}
          className="hidden md:inline-flex items-center gap-1.5 min-h-11 px-3 py-2 -mx-3 rounded-md text-sm font-semibold text-foreground hover:text-neon-pink transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {t('home.achievements.cta')}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="md:hidden">
        <Carousel
          opts={{ align: 'start', loop: false }}
          className="w-full"
          aria-label={t('home.achievements.carouselLabel')}
        >
          <CarouselContent className="-ml-3">
            {items.map((item) => (
              <CarouselItem
                key={item.key}
                className="pl-3 basis-[85%]"
              >
                <div className="h-full">{item.node}</div>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      </div>

      <div className="hidden md:grid grid-cols-3 gap-5 lg:gap-6">
        {items.map((item) => (
          <div key={item.key} className="h-full">
            {item.node}
          </div>
        ))}
      </div>

      <div className="mt-4 md:hidden">
        <Link
          to={localizedPath('/profile')}
          className="flex w-full items-center justify-center gap-1.5 min-h-11 px-4 py-2 rounded-md border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {t('home.achievements.cta')}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </m.section>
  )
}
