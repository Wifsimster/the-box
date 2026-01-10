import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '@/stores/gameStore'
import { TierIntro } from '@/components/game/TierIntro'
import { PanoramaViewer } from '@/components/game/PanoramaViewer'
import { Timer } from '@/components/game/Timer'
import { GuessInput } from '@/components/game/GuessInput'
import { ProgressBar } from '@/components/game/ProgressBar'
import { ScoreDisplay } from '@/components/game/ScoreDisplay'
import { ResultCard } from '@/components/game/ResultCard'
import { LiveLeaderboard } from '@/components/game/LiveLeaderboard'

export default function GamePage() {
  const { t } = useTranslation()
  const {
    gamePhase,
    currentTier,
    currentTierName,
    currentPosition,
    totalScreenshots,
    totalScore,
    setGamePhase,
  } = useGameStore()

  // Start with tier intro on first load
  useEffect(() => {
    if (gamePhase === 'idle') {
      setGamePhase('tier_intro')
    }
  }, [gamePhase, setGamePhase])

  return (
    <div className="fixed inset-0 bg-background overflow-hidden">
      <AnimatePresence mode="wait">
        {/* Tier Intro Screen */}
        {gamePhase === 'tier_intro' && (
          <TierIntro
            key="tier-intro"
            tierNumber={currentTier}
            tierName={currentTierName}
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
            <div className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-background/90 to-transparent pb-8 pt-4 px-4">
              <div className="container mx-auto flex items-center justify-between">
                <ProgressBar
                  current={currentPosition}
                  total={totalScreenshots}
                />
                <div className="flex items-center gap-4">
                  <div className="text-sm text-muted-foreground">
                    <span className="font-bold text-primary">{currentTierName}</span>
                    <span className="mx-2">|</span>
                    <span className="font-bold text-foreground">{currentPosition}/{totalScreenshots}</span>
                  </div>
                  <ScoreDisplay score={totalScore} />
                </div>
              </div>
            </div>

            {/* Panorama Viewer (Full Screen) */}
            <PanoramaViewer
              imageUrl="/placeholder-panorama.jpg"
              className="w-full h-full"
            />

            {/* Timer (Top Center) */}
            <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30">
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

        {/* Tier Complete Screen */}
        {gamePhase === 'tier_complete' && (
          <motion.div
            key="tier-complete"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center w-full h-full"
          >
            <div className="text-center">
              <h1 className="text-4xl font-bold mb-4">{t('game.tierComplete')}</h1>
              <p className="text-2xl text-primary font-bold">{totalScore} pts</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
