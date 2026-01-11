import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Play, Calendar, Home, AlertTriangle, Move, Gamepad2, Zap, Images } from 'lucide-react'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useAuth } from '@/hooks/useAuth'

interface DailyIntroProps {
  date: string
  totalScreenshots: number
  onStart: () => void
}

export function DailyIntro({ date, totalScreenshots, onStart }: DailyIntroProps) {
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
      className="fixed inset-0 flex items-center justify-center bg-gradient-to-b from-background via-card to-background"
    >
      {/* Home Button */}
      <div className="absolute top-4 left-4 z-20">
        <Button variant="ghost" size="sm" asChild>
          <Link to={localizedPath('/')}>
            <Home className="w-4 h-4 mr-1" />
            {t('common.home')}
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

      <div className="relative text-center z-10">
        {/* Daily Challenge Title */}
        <motion.h1
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="text-5xl md:text-7xl font-black mb-4 tracking-wider"
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

        {/* Date */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="flex items-center justify-center gap-2 text-muted-foreground mb-8"
        >
          <Calendar className="w-5 h-5" />
          <span className="text-lg">{formattedDate}</span>
        </motion.div>

        {/* Game rules */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mb-8 p-4 rounded-lg bg-card/50 border border-border/50 max-w-md mx-auto"
        >
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {t('game.rules.title')}
          </h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <Images className="w-4 h-4 text-neon-purple" />
              <span>{t('game.rules.screenshots', { count: totalScreenshots })}</span>
            </li>
            <li className="flex items-center gap-2">
              <Move className="w-4 h-4 text-neon-purple" />
              <span>{t('game.rules.explore')}</span>
            </li>
            <li className="flex items-center gap-2">
              <Gamepad2 className="w-4 h-4 text-neon-purple" />
              <span>{t('game.rules.guess')}</span>
            </li>
            <li className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-neon-purple" />
              <span>{t('game.rules.time')}</span>
            </li>
          </ul>
        </motion.div>

        {/* Guest warning */}
        {!isAuthenticated && (
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="flex items-center justify-center gap-2 text-amber-500 mb-8"
          >
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm">{t('game.guestWarning')}</span>
          </motion.div>
        )}

        {/* Start Button */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Button
            variant="gaming"
            size="xl"
            onClick={onStart}
            className="gap-3 text-xl px-12 py-6"
          >
            {t('game.startChallenge')}
            <Play className="w-6 h-6" />
          </Button>
        </motion.div>

        {/* Decorative elements */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="absolute -top-20 -left-20 w-40 h-40 bg-neon-purple/10 rounded-full blur-3xl"
        />
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="absolute -bottom-20 -right-20 w-40 h-40 bg-neon-pink/10 rounded-full blur-3xl"
        />
      </div>
    </motion.div>
  )
}

// Backwards compatibility alias
export const TierIntro = DailyIntro
