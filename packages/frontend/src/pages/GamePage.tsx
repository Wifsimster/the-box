import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '@/stores/gameStore'
import { DailyIntro } from '@/components/game/TierIntro'
import { PanoramaViewer } from '@/components/game/PanoramaViewer'
import { Timer } from '@/components/game/Timer'
import { GuessInput } from '@/components/game/GuessInput'
import { ProgressBar } from '@/components/game/ProgressBar'
import { ScoreDisplay } from '@/components/game/ScoreDisplay'
import { ResultCard } from '@/components/game/ResultCard'
import { LiveLeaderboard } from '@/components/game/LiveLeaderboard'
import { Globe } from 'lucide-react'

export default function GamePage() {
  const { t } = useTranslation()
  const [worldTotalScore, setWorldTotalScore] = useState<number | null>(null)
  const {
    gamePhase,
    challengeDate,
    currentPosition,
    totalScreenshots,
    totalScore,
    setGamePhase,
  } = useGameStore()

  // Fetch world total score when challenge is complete
  useEffect(() => {
    if (gamePhase === 'challenge_complete') {
      fetch('/api/leaderboard/today')
        .then(res => res.json())
        .then(data => {
          if (data.success && data.data?.entries) {
            const worldTotal = data.data.entries.reduce(
              (sum: number, entry: { totalScore: number }) => sum + entry.totalScore,
              0
            )
            setWorldTotalScore(worldTotal)
          }
        })
        .catch(() => {
          // Silently fail - world score is optional
        })
    }
  }, [gamePhase])

  // Start with daily intro on first load
  useEffect(() => {
    if (gamePhase === 'idle') {
      setGamePhase('daily_intro')
    }
  }, [gamePhase, setGamePhase])

  return (
    <div className="fixed inset-0 bg-background overflow-hidden">
      <AnimatePresence mode="wait">
        {/* Daily Challenge Intro Screen */}
        {gamePhase === 'daily_intro' && (
          <DailyIntro
            key="daily-intro"
            date={challengeDate || new Date().toISOString().split('T')[0]!}
            totalScreenshots={totalScreenshots}
            onStart={() => setGamePhase('playing')}
          />
        )}

        {/* Main Game Screen */}
        {(gamePhase === 'playing' || gamePhase === 'result') && (
          <motion.div
            key="game"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative w-full h-full"
          >
            {/* Progress Bar at Top */}
            <div className="absolute top-0 left-0 right-0 z-40 bg-gradient-to-b from-background/90 to-transparent pb-8 pt-4 px-4">
              <div className="container mx-auto flex items-center justify-end gap-4">
                <div className="text-sm text-muted-foreground">
                  <span className="font-bold text-foreground">{currentPosition}/{totalScreenshots}</span>
                </div>
                <ScoreDisplay score={totalScore} />
              </div>
            </div>

            {/* Panorama Viewer (Full Screen) */}
            <PanoramaViewer
              imageUrl="/placeholder-panorama.jpg"
              className="w-full h-full"
            />

            {/* Timer (Top Center) */}
            <div className="absolute top-8 left-1/2 -translate-x-1/2 z-30">
              <Timer />
            </div>

            {/* Live Leaderboard (Left Side) */}
            <div className="absolute left-4 top-1/2 -translate-y-1/2 z-20">
              <LiveLeaderboard />
            </div>

            {/* Guess Input (Bottom Center) */}
            <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-background/90 to-transparent pt-8 pb-4 px-4">
              <div className="container mx-auto max-w-2xl">
                <GuessInput />
              </div>
            </div>

            {/* Result Card Overlay */}
            <AnimatePresence>
              {gamePhase === 'result' && <ResultCard />}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Challenge Complete Screen */}
        {gamePhase === 'challenge_complete' && (
          <motion.div
            key="challenge-complete"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center w-full h-full"
          >
            <div className="text-center">
              <h1 className="text-4xl font-bold mb-4">{t('game.challengeComplete')}</h1>
              <p className="text-2xl text-primary font-bold mb-8">{totalScore} pts</p>

              {/* World Total Score */}
              {worldTotalScore !== null && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="flex items-center justify-center gap-3 text-muted-foreground"
                >
                  <Globe className="w-5 h-5" />
                  <span className="text-lg">
                    {t('game.worldTotal')}: <span className="font-bold text-foreground">{worldTotalScore.toLocaleString()}</span> pts
                  </span>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
