import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Play, Trophy, Rotate3D, Users, Gamepad2 } from 'lucide-react'
import { useSession } from '@/lib/auth-client'
import { CubeBackground } from '@/components/backgrounds/CubeBackground'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'

export default function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: session } = useSession()
  const { localizedPath } = useLocalizedPath()

  const handleMultiplayerClick = () => {
    if (session) {
      navigate(localizedPath('/multiplayer'))
    } else {
      navigate(localizedPath('/login') + '?redirect=' + encodeURIComponent(localizedPath('/multiplayer')))
    }
  }

  return (
    <>
      <CubeBackground />
      <div className="container mx-auto px-4 py-12 relative z-10">
      {/* Hero Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-12"
      >
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="inline-flex items-center justify-center w-24 h-24 mb-6 rounded-2xl bg-linear-to-br from-neon-purple to-neon-pink shadow-lg shadow-neon-purple/30"
        >
          <Gamepad2 className="w-12 h-12 text-white" />
        </motion.div>

        <h1 className="text-5xl font-bold mb-4 bg-linear-to-r from-neon-purple via-neon-pink to-neon-cyan bg-clip-text text-transparent">
          {t('home.title')}
        </h1>

        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          {t('home.subtitle')}
        </p>
      </motion.div>

      {/* CTA Buttons */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12"
      >
        <Button
          variant="gaming"
          size="xl"
          onClick={() => navigate(localizedPath('/play'))}
          className="gap-3 text-lg px-12"
        >
          <Play className="w-6 h-6" />
          {t('home.dailyGuess')}
        </Button>
        <Button
          variant="outline"
          size="xl"
          onClick={handleMultiplayerClick}
          className="gap-3 text-lg px-12"
        >
          <Users className="w-6 h-6" />
          {t('home.multiplayerGame')}
        </Button>
      </motion.div>

      {/* Features Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.6 }}
        className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto"
      >
        <Card className="bg-card/50 border-border hover:border-neon-purple/50 transition-colors">
          <CardContent className="pt-6 text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-neon-purple/20 flex items-center justify-center">
              <Rotate3D className="w-6 h-6 text-neon-purple" />
            </div>
            <h3 className="font-semibold mb-2">{t('home.features.panorama')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('home.features.panoramaDesc')}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border hover:border-neon-pink/50 transition-colors">
          <CardContent className="pt-6 text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-neon-pink/20 flex items-center justify-center">
              <Trophy className="w-6 h-6 text-neon-pink" />
            </div>
            <h3 className="font-semibold mb-2">{t('home.features.daily')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('home.features.dailyDesc')}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border hover:border-neon-cyan/50 transition-colors">
          <CardContent className="pt-6 text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-neon-cyan/20 flex items-center justify-center">
              <Users className="w-6 h-6 text-neon-cyan" />
            </div>
            <h3 className="font-semibold mb-2">{t('home.features.multiplayer')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('home.features.multiplayerDesc')}
            </p>
          </CardContent>
        </Card>
      </motion.div>
      </div>

      {/* Legal Links - Fixed at bottom of screen */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.8 }}
        className="fixed bottom-0 left-0 right-0 z-20 py-4 text-center"
      >
        <nav className="flex items-center justify-center gap-6 text-sm">
          <Link
            to={localizedPath('/terms')}
            className="text-muted-foreground hover:text-neon-purple transition-colors"
          >
            {t('footer.terms')}
          </Link>
          <Link
            to={localizedPath('/privacy')}
            className="text-muted-foreground hover:text-neon-purple transition-colors"
          >
            {t('footer.privacy')}
          </Link>
          <Link
            to={localizedPath('/contact')}
            className="text-muted-foreground hover:text-neon-purple transition-colors"
          >
            {t('footer.contact')}
          </Link>
        </nav>
        <p className="mt-2 text-xs text-muted-foreground/60">
          &copy; {new Date().getFullYear()} The Box. {t('footer.allRightsReserved')}
        </p>
      </motion.div>
    </>
  )
}
