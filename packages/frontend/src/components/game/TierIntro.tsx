import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Play, Calendar, Home, AlertTriangle, Zap, Images, Gift, Info } from 'lucide-react'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useAuth } from '@/hooks/useAuth'

interface DailyIntroProps {
  date: string
  totalScreenshots: number
  onStart: () => void
  isCatchUp?: boolean
}

export function DailyIntro({ date, totalScreenshots, onStart, isCatchUp }: DailyIntroProps) {
  const { t } = useTranslation()
  const { localizedPath } = useLocalizedPath()
  const { isAuthenticated } = useAuth()

  // Format date for display
  const formattedDate = new Date(date).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 flex items-center justify-center bg-gradient-to-b from-background via-card to-background h-dvh"
    >
      {/* Home Button - Mobile-first positioning */}
      <div className="absolute top-2 left-2 sm:top-4 sm:left-4 z-20">
        <Button variant="ghost" size="sm" asChild className="h-8 sm:h-9 px-2 sm:px-3">
          <Link to={localizedPath('/')}>
            <Home className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1" />
            <span className="text-xs sm:text-sm">{t('common.home')}</span>
          </Link>
        </Button>
      </div>

      {/* Background grid effect */}
      <div className="absolute inset-0 opacity-20">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: `
              linear-gradient(rgba(139, 92, 246, 0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(139, 92, 246, 0.1) 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px',
          }}
        />
      </div>

      {/* Main content container - Mobile-first padding */}
      <div className="relative text-center z-10 w-full px-4 sm:px-6 md:px-8 max-w-2xl mx-auto">
        {/* Daily Challenge Title - Mobile-first typography */}
        <motion.h1
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black mb-3 sm:mb-4 tracking-wider"
          style={{
            textShadow: `
              0 0 10px rgba(139, 92, 246, 0.8),
              0 0 20px rgba(139, 92, 246, 0.6),
              0 0 30px rgba(139, 92, 246, 0.4),
              0 0 40px rgba(139, 92, 246, 0.2)
            `,
          }}
        >
          <span className="bg-gradient-to-r from-white via-neon-purple to-white bg-clip-text text-transparent">
            {t('game.dailyChallenge')}
          </span>
        </motion.h1>

        {/* Date - Mobile-first spacing */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="flex items-center justify-center gap-1.5 sm:gap-2 text-muted-foreground mb-4 sm:mb-6 md:mb-8"
        >
          <Calendar className="w-4 h-4 sm:w-5 sm:h-5" />
          <span className="text-sm sm:text-base md:text-lg">{formattedDate}</span>
        </motion.div>

        {/* Game rules - Compact grid */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mb-4 sm:mb-6 md:mb-8 grid grid-cols-3 gap-2 sm:gap-3 max-w-sm mx-auto"
        >
          {[
            { icon: Images, label: t('game.rules.screenshotsShort', { count: totalScreenshots }), delay: 0 },
            { icon: Zap, label: t('game.rules.speedShort'), delay: 0.05 },
            { icon: Gift, label: t('game.rules.hintsShort'), delay: 0.1 },
          ].map((rule, index) => (
            <motion.div
              key={index}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.2 + rule.delay }}
              className="flex flex-col items-center gap-1.5 p-2 sm:p-3 rounded-lg bg-card/50 border border-border/50 hover:border-neon-purple/50 transition-colors"
            >
              <rule.icon className="w-5 h-5 sm:w-6 sm:h-6 text-neon-purple" />
              <span className="text-[10px] sm:text-xs text-muted-foreground text-center leading-tight">
                {rule.label}
              </span>
            </motion.div>
          ))}
        </motion.div>

        {/* Catch-up notice - Mobile-first spacing */}
        {isCatchUp && (
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="flex items-center justify-center gap-1.5 sm:gap-2 text-blue-400 mb-4 sm:mb-6 md:mb-8 px-4"
          >
            <Info className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
            <span className="text-xs sm:text-sm">{t('game.catchUpNotice')}</span>
          </motion.div>
        )}

        {/* Guest warning - Mobile-first spacing */}
        {!isAuthenticated && (
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: isCatchUp ? 0.3 : 0.25 }}
            className="flex items-center justify-center gap-1.5 sm:gap-2 text-amber-500 mb-4 sm:mb-6 md:mb-8 px-4"
          >
            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
            <span className="text-xs sm:text-sm">{t('game.guestWarning')}</span>
          </motion.div>
        )}

        {/* Start Button - Mobile-first sizing */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="px-2 sm:px-4"
        >
          <Button
            variant="gaming"
            size="xl"
            onClick={onStart}
            className="gap-2 sm:gap-3 text-base sm:text-lg md:text-xl px-6 sm:px-8 md:px-12 py-4 sm:py-5 md:py-6 w-full sm:w-auto"
          >
            {t('game.startChallenge')}
            <Play className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />
          </Button>
        </motion.div>

        {/* Decorative elements - Hidden on mobile, shown on larger screens */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="hidden md:block absolute -top-20 -left-20 w-40 h-40 bg-neon-purple/10 rounded-full blur-3xl"
        />
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="hidden md:block absolute -bottom-20 -right-20 w-40 h-40 bg-neon-pink/10 rounded-full blur-3xl"
        />
      </div>
    </motion.div>
  )
}

// Backwards compatibility alias
export const TierIntro = DailyIntro
