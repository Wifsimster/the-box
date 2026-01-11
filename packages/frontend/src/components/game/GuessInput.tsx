import { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useGameStore } from '@/stores/gameStore'
import { Send, SkipForward } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Game } from '@/types'
import {
  createGameSearchService,
  createGameValidationService,
  createScoringService,
} from '@/services'
import { useGameGuess } from '@/hooks/useGameGuess'

/**
 * Game guess input component with autocomplete
 *
 * Refactored to follow SOLID principles:
 * - Services injected for game search, validation, and scoring
 * - Business logic extracted to useGameGuess hook
 * - Component focuses only on UI rendering
 */
export function GuessInput() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Game[]>([])
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Services (dependency injection via factory functions)
  const gameSearchService = useMemo(() => createGameSearchService(), [])
  const validationService = useMemo(() => createGameValidationService(), [])
  const scoringService = useMemo(() => createScoringService(), [])

  // Custom hook for guess submission logic
  const { submitGuess, skipRound } = useGameGuess(
    validationService,
    scoringService
  )

  const { gamePhase, startTimer, setTimeLimit } = useGameStore()

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

    let cancelled = false

    // Use game search service
    gameSearchService.search(query).then((results) => {
      if (!cancelled) {
        setSuggestions(results)
        setShowSuggestions(results.length > 0)
        setSelectedIndex(-1)
      }
    })

    return () => {
      cancelled = true
    }
  }, [query, gameSearchService])

  const handleSubmit = async (game?: Game) => {
    const selectedGame = game || suggestions[selectedIndex]

    await submitGuess(selectedGame || null, query)

    setQuery('')
    setShowSuggestions(false)
  }

  const handleSkip = () => {
    skipRound()
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
                  'w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-secondary transition-colors',
                  selectedIndex === index && 'bg-secondary'
                )}
              >
                <div className="w-10 h-10 rounded bg-muted flex items-center justify-center text-xs font-bold">
                  {game.name[0]}
                </div>
                <div className="flex-1">
                  <div className="font-medium">{game.name}</div>
                  {game.releaseYear && (
                    <div className="text-xs text-muted-foreground">
                      {game.releaseYear}
                    </div>
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
