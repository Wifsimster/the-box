import { m } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Flame, Info, Play, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useReducedMotionSafe } from '@/hooks/useReducedMotionSafe'

const TODAY_PREVIEW_IMAGE = '/api/game/preview/image'

interface TodayStartProps {
  date: string
  totalScreenshots: number
  isAuthenticated: boolean
  isOnline: boolean
  isStarting: boolean
  isCatchUp?: boolean
  streak?: number | null
  onStart: () => void
}

export function TodayStart({
  date,
  totalScreenshots,
  isAuthenticated,
  isOnline,
  isStarting,
  isCatchUp = false,
  streak = null,
  onStart,
}: TodayStartProps) {
  const { t, i18n } = useTranslation()
  const reducedMotion = useReducedMotionSafe()

  const formattedDate = new Date(`${date}T00:00:00Z`).toLocaleDateString(i18n.language, {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
  const showPreview = !isCatchUp

  let hint = isAuthenticated ? t('today.startHint') : t('today.guestHint')
  if (isCatchUp) hint = t('game.catchUpNotice')

  return (
    <m.section
      aria-labelledby="today-title"
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reducedMotion ? undefined : { opacity: 0 }}
      className="relative flex size-full flex-col items-center justify-center overflow-y-auto px-4 py-6"
    >
      {showPreview && (
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
          <img
            src={TODAY_PREVIEW_IMAGE}
            alt=""
            data-keep-blur
            decoding="async"
            className="size-full scale-110 object-cover opacity-25 blur-3xl"
          />
        </div>
      )}

      <div className="relative z-10 flex w-full max-w-xl flex-col items-center gap-4 text-center sm:gap-5">
        <div className="space-y-1">
          <h1 id="today-title" className="gradient-gaming-title text-3xl font-bold sm:text-4xl">
            {t('today.boxOf', { date: formattedDate })}
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            {t('today.rules', { count: totalScreenshots })}
          </p>
        </div>

        <div
          data-testid="today-box-preview"
          aria-hidden="true"
          className="group relative aspect-video w-full overflow-hidden rounded-xl border border-neon-purple/40 bg-muted shadow-cta transition-colors duration-300 hover:border-neon-pink/60"
        >
          {showPreview && (
            <img
              src={TODAY_PREVIEW_IMAGE}
              alt=""
              data-keep-blur
              decoding="async"
              width={1280}
              height={720}
              className="size-full scale-110 object-cover blur-xl transition-[filter,transform] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:scale-105 group-hover:blur-md"
            />
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-background/30 transition-colors duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:bg-background/15">
            <img
              src="/logo-open.svg"
              alt=""
              className="size-16 drop-shadow-lg transition-opacity duration-500 group-hover:opacity-70 sm:size-20"
            />
          </span>
        </div>

        {streak !== null && streak > 0 && (
          <p className="inline-flex items-center gap-2 rounded-full border border-neon-pink/40 bg-card/70 px-3 py-1 text-sm font-semibold text-foreground backdrop-blur-sm">
            <Flame className="size-4 text-neon-pink" aria-hidden="true" />
            {t('today.streak', { count: streak })}
          </p>
        )}

        <Button
          variant="gaming"
          size="xl"
          data-testid="today-open-box"
          onClick={onStart}
          disabled={!isOnline || isStarting}
          aria-busy={isStarting}
          className="w-full gap-3 sm:w-auto sm:px-12"
        >
          <Play className="size-5" aria-hidden="true" />
          {isCatchUp ? t('today.openCatchUp') : t('home.playToday')}
        </Button>

        {!isOnline ? (
          <p role="status" className="flex items-center gap-2 text-sm text-warning">
            <WifiOff className="size-4 shrink-0" aria-hidden="true" />
            {t('home.offlineHint')}
          </p>
        ) : (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            {isCatchUp && <Info className="size-4 shrink-0 text-neon-blue" aria-hidden="true" />}
            {hint}
          </p>
        )}
      </div>
    </m.section>
  )
}
