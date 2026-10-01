import { m } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Play, Calendar, AlertTriangle, Zap, Images, Gift, Info } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

interface DailyIntroProps {
  date: string
  totalScreenshots: number
  onStart: () => void
  isCatchUp?: boolean
}

export function DailyIntro({ date, totalScreenshots, onStart, isCatchUp }: DailyIntroProps) {
  const { t } = useTranslation()
  const { isAuthenticated } = useAuth()

  // Format date for display
  const formattedDate = new Date(date).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative flex size-full overflow-y-auto bg-linear-to-b from-background via-card to-background"
    >
      <div className="absolute inset-0 opacity-20 pointer-events-none" aria-hidden="true">
        <div className="size-full bg-grid-neon" />
      </div>

      <div className="relative text-center z-10 w-full px-4 sm:px-6 md:px-8 py-6 sm:py-8 max-w-2xl m-auto">
        {/* Daily Challenge Title - Mobile-first typography */}
        <m.h1
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="gradient-gaming-title text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black mb-3 sm:mb-4 tracking-wide"
        >
          {t('game.dailyChallenge')}
        </m.h1>

        {/* Date - Mobile-first spacing */}
        <m.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="flex items-center justify-center gap-1.5 sm:gap-2 text-muted-foreground mb-4 sm:mb-6 md:mb-8"
        >
          <Calendar className="size-4 sm:size-5" aria-hidden="true" />
          <span className="text-sm sm:text-base md:text-lg first-letter:uppercase">{formattedDate}</span>
        </m.div>

        {/* Game rules - Compact grid */}
        <m.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mb-4 sm:mb-6 md:mb-8 grid grid-cols-3 gap-2 sm:gap-3 max-w-sm mx-auto"
          role="list"
        >
          {[
            { id: 'screenshots', icon: Images, label: t('game.rules.screenshotsShort', { count: totalScreenshots }), delay: 0 },
            { id: 'speed', icon: Zap, label: t('game.rules.speedShort'), delay: 0.05 },
            { id: 'hints', icon: Gift, label: t('game.rules.hintsShort'), delay: 0.1 },
          ].map((rule) => (
            <m.div
              key={rule.id}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.2 + rule.delay }}
              role="listitem"
              className="flex flex-col items-center gap-1.5 p-2 sm:p-3 rounded-lg bg-card/50 border border-border/50"
            >
              <rule.icon className="size-5 sm:size-6 text-neon-purple" aria-hidden="true" />
              <span className="text-xs text-muted-foreground text-center leading-tight">
                {rule.label}
              </span>
            </m.div>
          ))}
        </m.div>

        {/* Catch-up notice - Mobile-first spacing */}
        {isCatchUp && (
          <m.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="flex items-center justify-center gap-2 text-neon-blue mb-4 sm:mb-6 md:mb-8"
          >
            <Info className="size-4 sm:size-5 shrink-0" aria-hidden="true" />
            <span className="text-sm">{t('game.catchUpNotice')}</span>
          </m.div>
        )}

        {/* Guest warning - Mobile-first spacing */}
        {!isAuthenticated && (
          <m.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: isCatchUp ? 0.3 : 0.25 }}
            className="flex items-center justify-center gap-2 text-warning mb-4 sm:mb-6 md:mb-8"
          >
            <AlertTriangle className="size-4 sm:size-5 shrink-0" aria-hidden="true" />
            <span className="text-sm">{t('game.guestWarning')}</span>
          </m.div>
        )}

        <m.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Button
            variant="gaming"
            size="xl"
            onClick={onStart}
            className="gap-3 w-full sm:w-auto"
          >
            {t('game.startChallenge')}
            <Play className="size-5" aria-hidden="true" />
          </Button>
        </m.div>
      </div>
    </m.div>
  )
}
