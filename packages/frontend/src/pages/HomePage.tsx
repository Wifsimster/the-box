import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Play, Trophy, Rotate3D } from 'lucide-react'
import { CubeBackground } from '@/components/backgrounds/CubeBackground'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'

export default function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { localizedPath } = useLocalizedPath()

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
          className="flex justify-center mb-8 sm:mb-10 md:mb-12 lg:mb-16"
        >
          <Button
            variant="gaming"
            size="xl"
            onClick={() => navigate(localizedPath('/play'))}
            className="gap-2 sm:gap-3 text-sm sm:text-base md:text-lg px-6 sm:px-8 md:px-10 lg:px-12 w-full sm:w-auto"
          >
            <Play className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" />
            {t('home.dailyGuess')}
          </Button>
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
                <Rotate3D className="h-5 w-5 sm:h-6 sm:w-6 text-neon-purple" />
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
