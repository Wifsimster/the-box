import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Play, Trophy, Brain, History, Clock } from 'lucide-react'
import { CubeBackground } from '@/components/backgrounds/CubeBackground'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useSession } from '@/lib/auth-client'
import { gameApi } from '@/lib/api/game'
import { useEffect, useState, useMemo } from 'react'
import { useNextDailyCountdown } from '@/hooks/useNextDailyCountdown'

export default function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { localizedPath } = useLocalizedPath()
  const { data: session } = useSession()
  const [isTodayCompleted, setIsTodayCompleted] = useState(false)
  const [todayScore, setTodayScore] = useState<number>(0)
  const [screenshotsFound, setScreenshotsFound] = useState<number>(0)
  const [isLoading, setIsLoading] = useState(true)
  const timeRemaining = useNextDailyCountdown()

  // Memoize humorous message to prevent re-selection on countdown re-renders
  const humorousMessage = useMemo(() => {
    if (!isTodayCompleted) return ''

    let category: 'perfect' | 'excellent' | 'good' | 'average' | 'low'

    if (screenshotsFound === 10 && todayScore >= 4500) {
      category = 'perfect'
    } else if (todayScore >= 3500 || screenshotsFound >= 8) {
      category = 'excellent'
    } else if (todayScore >= 2000 || screenshotsFound >= 6) {
      category = 'good'
    } else if (todayScore >= 1000 || screenshotsFound >= 4) {
      category = 'average'
    } else {
      category = 'low'
    }

    const messages = t(`home.completionMessages.${category}`, { returnObjects: true }) as string[]
    return messages[Math.floor(Math.random() * messages.length)]
  }, [isTodayCompleted, todayScore, screenshotsFound, t])

  // Check if user has already completed today's challenge
  useEffect(() => {
    const checkTodayChallenge = async () => {
      if (!session?.user?.id) {
        setIsLoading(false)
        return
      }

      try {
        const data = await gameApi.getTodayChallenge()
        // Check if user has an existing session that is completed
        if (data.userSession?.isCompleted) {
          setIsTodayCompleted(true)
          setTodayScore(data.userSession.totalScore)
          setScreenshotsFound(data.userSession.screenshotsFound)
        }
      } catch (error) {
        console.error('Failed to check today challenge:', error)
      } finally {
        setIsLoading(false)
      }
    }

    checkTodayChallenge()
  }, [session?.user?.id])

  return (
    <>
      <CubeBackground />
      <div className="container mx-auto px-4 py-8 sm:py-10 md:py-12 lg:py-16 relative z-10">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8 sm:mb-10 md:mb-12 lg:mb-16"
        >
          <motion.img
            src="/logo.svg"
            alt="The Box"
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="h-16 w-16 sm:h-20 sm:w-20 md:h-24 md:w-24 mb-4 sm:mb-5 md:mb-6 mx-auto"
          />

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-3 sm:mb-4 bg-linear-to-r from-neon-purple via-neon-pink to-neon-cyan bg-clip-text text-transparent">
            {t('home.title')}
          </h1>

          <p className="text-sm sm:text-base md:text-lg lg:text-xl text-muted-foreground max-w-2xl mx-auto px-2 sm:px-4">
            {t('home.subtitle')}
          </p>
        </motion.div>

        {/* CTA Button */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="flex flex-col items-center gap-4 mb-8 sm:mb-10 md:mb-12 lg:mb-16"
        >
          {/* Show completion message if today's challenge is completed */}
          {isTodayCompleted && (
            <div className="text-center max-w-xl mx-auto">
              <div className="bg-card/80 backdrop-blur-sm border border-neon-purple/30 rounded-lg p-4 sm:p-6 mb-3">
                <p className="text-lg sm:text-xl font-bold text-neon-purple mb-3">
                  {humorousMessage}
                </p>
                <div className="flex items-center justify-center gap-4 sm:gap-6 text-sm sm:text-base mb-4">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 sm:h-5 sm:w-5 text-neon-cyan" />
                    <span className="font-semibold text-neon-cyan">{todayScore} pts</span>
                  </div>
                  <div className="text-muted-foreground">
                    {screenshotsFound}/10 {t('game.screenshots')}
                  </div>
                </div>

                {/* Countdown timer */}
                <div className="flex items-center justify-center gap-2 pt-3 border-t border-neon-purple/20">
                  <Clock className="h-4 w-4 text-neon-pink" />
                  <span className="text-xs sm:text-sm text-muted-foreground">
                    {t('home.nextDailyIn')}
                  </span>
                  <span className="font-mono font-semibold text-neon-pink text-sm sm:text-base">
                    {String(timeRemaining.hours).padStart(2, '0')}:
                    {String(timeRemaining.minutes).padStart(2, '0')}:
                    {String(timeRemaining.seconds).padStart(2, '0')}
                  </span>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {t('home.comeBackTomorrow')}
              </p>
            </div>
          )}

          {/* Show appropriate button based on completion status */}
          {!isLoading && (
            isTodayCompleted ? (
              <Button
                variant="outline"
                size="xl"
                onClick={() => navigate(localizedPath('/history'))}
                className="gap-2 sm:gap-3 text-sm sm:text-base md:text-lg px-6 sm:px-8 md:px-10 lg:px-12 w-full sm:w-auto"
              >
                <History className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" />
                {t('common.history')}
              </Button>
            ) : (
              <Button
                variant="gaming"
                size="xl"
                onClick={() => navigate(localizedPath('/play'))}
                className="gap-2 sm:gap-3 text-sm sm:text-base md:text-lg px-6 sm:px-8 md:px-10 lg:px-12 w-full sm:w-auto"
              >
                <Play className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" />
                {t('home.dailyGuess')}
              </Button>
            )
          )}
        </motion.div>

        {/* Features Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 md:gap-6 max-w-2xl mx-auto"
        >
          <Card className="bg-card/50 border-border hover:border-neon-purple/50 transition-colors">
            <CardContent className="pt-4 sm:pt-5 md:pt-6 text-center">
              <div className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 rounded-lg bg-neon-purple/20 flex items-center justify-center">
                <Brain className="h-5 w-5 sm:h-6 sm:w-6 text-neon-purple" />
              </div>
              <h3 className="text-sm sm:text-base font-semibold mb-1.5 sm:mb-2">{t('home.features.panorama')}</h3>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {t('home.features.panoramaDesc')}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border hover:border-neon-pink/50 transition-colors">
            <CardContent className="pt-4 sm:pt-5 md:pt-6 text-center">
              <div className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 rounded-lg bg-neon-pink/20 flex items-center justify-center">
                <Trophy className="h-5 w-5 sm:h-6 sm:w-6 text-neon-pink" />
              </div>
              <h3 className="text-sm sm:text-base font-semibold mb-1.5 sm:mb-2">{t('home.features.daily')}</h3>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {t('home.features.dailyDesc')}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </>
  )
}
