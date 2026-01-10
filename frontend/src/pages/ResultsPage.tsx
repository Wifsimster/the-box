import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useGameStore } from '@/stores/gameStore'
import { Trophy, Home, Share2, CheckCircle, XCircle } from 'lucide-react'

export default function ResultsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { totalScore, correctAnswers, totalScreenshots, guessResults, resetGame } = useGameStore()

  const accuracy = Math.round((correctAnswers / totalScreenshots) * 100)

  const handlePlayAgain = () => {
    resetGame()
    navigate('/play')
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-8"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2, type: 'spring' }}
          className="inline-flex items-center justify-center w-20 h-20 mb-4 rounded-full bg-gradient-to-br from-neon-purple to-neon-pink"
        >
          <Trophy className="w-10 h-10 text-white" />
        </motion.div>

        <h1 className="text-3xl font-bold mb-2">{t('game.tierComplete')}</h1>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="text-5xl font-bold text-primary mb-4"
        >
          {totalScore} pts
        </motion.div>

        <div className="flex justify-center gap-8 text-muted-foreground">
          <div>
            <span className="text-foreground font-bold text-xl">{correctAnswers}</span>
            <span className="text-sm">/{totalScreenshots}</span>
            <p className="text-xs">{t('game.correctAnswers')}</p>
          </div>
          <div>
            <span className="text-foreground font-bold text-xl">{accuracy}%</span>
            <p className="text-xs">{t('game.accuracy')}</p>
          </div>
        </div>
      </motion.div>

      {/* Action Buttons */}
      <div className="flex justify-center gap-4 mb-8">
        <Button variant="outline" size="lg" onClick={() => navigate('/')}>
          <Home className="w-4 h-4 mr-2" />
          {t('common.home')}
        </Button>
        <Button variant="gaming" size="lg">
          <Share2 className="w-4 h-4 mr-2" />
          Share
        </Button>
      </div>

      {/* Results Summary */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-semibold mb-4">Results Summary</h3>
          <div className="space-y-2">
            {guessResults.map((result, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50"
              >
                <span className="text-muted-foreground w-6">{index + 1}.</span>
                {result.isCorrect ? (
                  <CheckCircle className="w-5 h-5 text-success" />
                ) : (
                  <XCircle className="w-5 h-5 text-error" />
                )}
                <div className="flex-1">
                  <span className="font-medium">{result.correctGame.name}</span>
                  {result.userGuess && !result.isCorrect && (
                    <span className="text-sm text-muted-foreground ml-2">
                      (guessed: {result.userGuess})
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className={result.scoreEarned > 0 ? 'text-success font-bold' : 'text-muted-foreground'}>
                    +{result.scoreEarned}
                  </span>
                </div>
              </motion.div>
            ))}

            {guessResults.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                No results yet. Play the game first!
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
