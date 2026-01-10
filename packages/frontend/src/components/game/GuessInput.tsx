import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useGameStore } from '@/stores/gameStore'
import { Send, SkipForward } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Game } from '@/types'

// Mock game search results for demo
const mockGames: Game[] = [
  { id: 1, name: 'The Witcher 3: Wild Hunt', slug: 'witcher-3', aliases: ['Witcher 3', 'TW3'], releaseYear: 2015 },
  { id: 2, name: 'The Sims 4', slug: 'sims-4', aliases: ['Sims 4', 'TS4'], releaseYear: 2014 },
  { id: 3, name: 'Red Dead Redemption 2', slug: 'rdr2', aliases: ['RDR2'], releaseYear: 2018 },
  { id: 4, name: 'Elden Ring', slug: 'elden-ring', aliases: [], releaseYear: 2022 },
  { id: 5, name: 'Minecraft', slug: 'minecraft', aliases: ['MC'], releaseYear: 2011 },
]

export function GuessInput() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Game[]>([])
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const {
    gamePhase,
    timerStartedAt,
    setGamePhase,
    addGuessResult,
    updateScore,
    incrementCorrectAnswers,
    pauseTimer,
    startTimer,
    setTimeLimit,
  } = useGameStore()

  // Focus input when playing
  useEffect(() => {
    if (gamePhase === 'playing' && inputRef.current) {
      inputRef.current.focus()
      startTimer()
      setTimeLimit(30)
    }
  }, [gamePhase, startTimer, setTimeLimit])

  // Search games as user types
  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    // Filter mock games (replace with API call)
    const filtered = mockGames.filter(
      (game) =>
        game.name.toLowerCase().includes(query.toLowerCase()) ||
        game.aliases.some((alias) =>
          alias.toLowerCase().includes(query.toLowerCase())
        )
    )
    setSuggestions(filtered)
    setShowSuggestions(filtered.length > 0)
    setSelectedIndex(-1)
  }, [query])

  const handleSubmit = (game?: Game) => {
    const selectedGame = game || suggestions[selectedIndex]
    const timeTakenMs = Date.now() - (timerStartedAt || Date.now())

    // Mock result (replace with API call)
    const isCorrect = selectedGame?.name === 'The Witcher 3: Wild Hunt'
    const scoreEarned = isCorrect ? Math.max(200 - Math.floor(timeTakenMs / 1000) * 5, 50) : 0

    pauseTimer()

    addGuessResult({
      position: 1,
      isCorrect,
      correctGame: mockGames[0],
      userGuess: selectedGame?.name || query,
      timeTakenMs,
      scoreEarned,
    })

    if (isCorrect) {
      incrementCorrectAnswers()
    }

    updateScore(scoreEarned)
    setGamePhase('result')
    setQuery('')
    setShowSuggestions(false)
  }

  const handleSkip = () => {
    const timeTakenMs = Date.now() - (timerStartedAt || Date.now())

    pauseTimer()

    addGuessResult({
      position: 1,
      isCorrect: false,
      correctGame: mockGames[0],
      userGuess: null,
      timeTakenMs,
      scoreEarned: 0,
    })

    setGamePhase('result')
    setQuery('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        handleSubmit(suggestions[selectedIndex])
      } else if (query.length > 0) {
        handleSubmit()
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  return (
    <div className="relative">
      {/* Input with suggestions */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => query.length >= 2 && setShowSuggestions(true)}
            placeholder={t('game.guessPlaceholder')}
            className="h-14 text-lg bg-card/80 backdrop-blur-sm border-2 border-border focus:border-primary pl-4 pr-12"
            disabled={gamePhase !== 'playing'}
          />

          {/* Typing indicator dots */}
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 bg-primary rounded-full"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  delay: i * 0.2,
                }}
              />
            ))}
          </div>
        </div>

        <Button
          variant="gaming"
          size="lg"
          onClick={() => handleSubmit()}
          disabled={gamePhase !== 'playing' || query.length === 0}
          className="h-14 px-6"
        >
          <Send className="w-5 h-5" />
        </Button>

        <Button
          variant="outline"
          size="lg"
          onClick={handleSkip}
          disabled={gamePhase !== 'playing'}
          className="h-14 px-6"
        >
          <SkipForward className="w-5 h-5" />
        </Button>
      </div>

      {/* Suggestions dropdown */}
      <AnimatePresence>
        {showSuggestions && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute bottom-full mb-2 left-0 right-0 bg-card border border-border rounded-lg shadow-xl overflow-hidden z-50"
          >
            {suggestions.map((game, index) => (
              <button
                key={game.id}
                onClick={() => handleSubmit(game)}
                className={cn(
                  "w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-secondary transition-colors",
                  selectedIndex === index && "bg-secondary"
                )}
              >
                <div className="w-10 h-10 rounded bg-muted flex items-center justify-center text-xs font-bold">
                  {game.name[0]}
                </div>
                <div className="flex-1">
                  <div className="font-medium">{game.name}</div>
                  {game.releaseYear && (
                    <div className="text-xs text-muted-foreground">{game.releaseYear}</div>
                  )}
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
