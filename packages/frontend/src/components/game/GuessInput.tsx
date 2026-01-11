import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useGameStore } from '@/stores/gameStore'
import { Send, SkipForward, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { gameApi } from '@/lib/api'
import type { GameSearchResult } from '@/types'

export function GuessInput() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<GameSearchResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const {
    gamePhase,
    tierSessionId,
    currentScreenshotData,
    currentPosition,
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
    }
  }, [gamePhase, startTimer])

  // Search games as user types (with debounce)
  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    // Debounce search
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true)
      try {
        const results = await gameApi.searchGames(query)
        setSuggestions(results)
        setShowSuggestions(results.length > 0)
        setSelectedIndex(-1)
      } catch (err) {
        console.error('Search failed:', err)
        setSuggestions([])
      } finally {
        setIsSearching(false)
      }
    }, 200)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [query])

  const handleSubmit = useCallback(async (game?: GameSearchResult) => {
    if (!tierSessionId || !currentScreenshotData) {
      console.error('Missing session data')
      return
    }

    const selectedGame = game || suggestions[selectedIndex]
    const timeTakenMs = Date.now() - (timerStartedAt || Date.now())

    pauseTimer()
    setIsSubmitting(true)

    try {
      const result = await gameApi.submitGuess({
        tierSessionId,
        screenshotId: currentScreenshotData.screenshotId,
        position: currentPosition,
        gameId: selectedGame?.id || null,
        guessText: selectedGame?.name || query,
        timeTakenMs,
      })

      addGuessResult({
        position: currentPosition,
        isCorrect: result.isCorrect,
        correctGame: result.correctGame,
        userGuess: selectedGame?.name || query,
        timeTakenMs,
        scoreEarned: result.scoreEarned,
      })

      if (result.isCorrect) {
        incrementCorrectAnswers()
      }

      updateScore(result.totalScore)
      setGamePhase('result')
    } catch (err) {
      console.error('Failed to submit guess:', err)
      // Still show result even on error
      setGamePhase('result')
    } finally {
      setIsSubmitting(false)
      setQuery('')
      setShowSuggestions(false)
    }
  }, [tierSessionId, currentScreenshotData, currentPosition, suggestions, selectedIndex, query, timerStartedAt, pauseTimer, addGuessResult, incrementCorrectAnswers, updateScore, setGamePhase])

  const handleSkip = useCallback(async () => {
    if (!tierSessionId || !currentScreenshotData) {
      console.error('Missing session data')
      return
    }

    const timeTakenMs = Date.now() - (timerStartedAt || Date.now())

    pauseTimer()
    setIsSubmitting(true)

    try {
      const result = await gameApi.submitGuess({
        tierSessionId,
        screenshotId: currentScreenshotData.screenshotId,
        position: currentPosition,
        gameId: null,
        guessText: '',
        timeTakenMs,
      })

      addGuessResult({
        position: currentPosition,
        isCorrect: false,
        correctGame: result.correctGame,
        userGuess: null,
        timeTakenMs,
        scoreEarned: 0,
      })

      updateScore(result.totalScore)
      setGamePhase('result')
    } catch (err) {
      console.error('Failed to submit skip:', err)
      setGamePhase('result')
    } finally {
      setIsSubmitting(false)
      setQuery('')
    }
  }, [tierSessionId, currentScreenshotData, currentPosition, timerStartedAt, pauseTimer, addGuessResult, updateScore, setGamePhase])

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

          {/* Searching/typing indicator */}
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-1">
            {isSearching ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : (
              [0, 1, 2].map((i) => (
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
              ))
            )}
          </div>
        </div>

        <Button
          variant="gaming"
          size="lg"
          onClick={() => handleSubmit()}
          disabled={gamePhase !== 'playing' || query.length === 0 || isSubmitting}
          className="h-14 px-6"
        >
          {isSubmitting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </Button>

        <Button
          variant="outline"
          size="lg"
          onClick={handleSkip}
          disabled={gamePhase !== 'playing' || isSubmitting}
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
