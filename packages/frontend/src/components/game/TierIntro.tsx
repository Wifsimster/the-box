import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Play, Calendar } from 'lucide-react'

interface DailyIntroProps {
  date: string
  totalScreenshots: number
  onStart: () => void
}

export function DailyIntro({ date, totalScreenshots, onStart }: DailyIntroProps) {
  const { t } = useTranslation()

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

        {/* Screenshot count */}
        <motion.p
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-xl text-muted-foreground mb-8"
        >
          {totalScreenshots} {t('game.screenshots')}
        </motion.p>

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
