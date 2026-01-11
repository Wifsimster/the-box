import { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { useGameStore } from '@/stores/gameStore'
import { SkipForward, SkipBack, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Game } from '@/types'
import {
  createGameSearchService,
  createGuessSubmissionService,
} from '@/services'
import { useGameGuess } from '@/hooks/useGameGuess'
import { toast } from '@/lib/toast'
import { useAuth } from '@/hooks/useAuth'

/**
 * Game guess input component with autocomplete
 *
 * Refactored to follow SOLID principles:
 * - Services injected for game search and guess submission
 * - Business logic extracted to useGameGuess hook
 * - Component focuses only on UI rendering
 */
export function GuessInput() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Game[]>([])
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auth hook for admin check
  const { session } = useAuth()
  const isAdmin = session?.user.role === 'admin'

  // Services (dependency injection via factory functions)
  const gameSearchService = useMemo(() => createGameSearchService(), [])
  const guessSubmissionService = useMemo(
    () => createGuessSubmissionService(),
    []
  )

  // Custom hook for guess submission logic
  const { submitGuess } = useGameGuess(guessSubmissionService)

  const {
    gamePhase,
    startScoreCountdown,
    skipToNextPosition,
    currentPosition,
    totalScreenshots,
    navigateToPosition,
    positionStates,
    currentScreenshotData,
  } = useGameStore()

  // Focus input when playing
  useEffect(() => {
    if (gamePhase === 'playing' && inputRef.current) {
      inputRef.current.focus()
      startScoreCountdown()
    }
  }, [gamePhase, startScoreCountdown])

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
        const results = await gameSearchService.search(query)
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
  }, [query, gameSearchService])

  const handleSubmit = async (game?: Game) => {
    if (isSubmitting) return // Prevent double submission

    const selectedGame = game || suggestions[selectedIndex]

    setIsSubmitting(true)
    try {
      const result = await submitGuess(selectedGame || null, query)

      // Show error toast if submission failed
      if (!result.success && result.error) {
        toast.error(result.error)
      }

      setQuery('')
      setShowSuggestions(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSkip = () => {
    if (isSubmitting) return // Prevent double click

    // Skip to next position without using a try (preserves tries for later)
    skipToNextPosition()
    setQuery('')
    setShowSuggestions(false)
  }

  // Find previous navigable position (skipped or in_progress positions before current)
  const findPreviousPosition = () => {
    for (let i = currentPosition - 1; i >= 1; i--) {
      const state = positionStates[i]
      if (state?.status === 'skipped') {
        return i
      }
    }
    return null
  }

  const handlePrevious = () => {
    if (isSubmitting) return

    const prevPos = findPreviousPosition()
    if (prevPos) {
      navigateToPosition(prevPos)
      setQuery('')
      setShowSuggestions(false)
    }
  }

  // Can show previous button if position > 1 and there's a skipped position before
  const previousPosition = findPreviousPosition()
  const canGoPrevious = currentPosition > 1 && previousPosition !== null

  // Hide skip button on last screenshot
  const isLastPosition = currentPosition === totalScreenshots

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
        {/* Previous button - shown when there are skipped positions before current */}
        {canGoPrevious && (
          <Tooltip content={t('game.navigation.previous')}>
            <Button
              variant="gaming"
              size="lg"
              onClick={handlePrevious}
              disabled={gamePhase !== 'playing' || isSubmitting}
              className="h-14 px-6"
            >
              <SkipBack className="w-5 h-5" />
            </Button>
          </Tooltip>
        )}

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

        {/* Skip/Next button - hidden on last screenshot */}
        {!isLastPosition && (
          <Tooltip content={t('game.navigation.skip')}>
            <Button
              variant="gaming"
              size="lg"
              onClick={handleSkip}
              disabled={gamePhase !== 'playing' || isSubmitting}
              className="h-14 px-6"
            >
              <SkipForward className="w-5 h-5" />
            </Button>
          </Tooltip>
        )}
      </div>

      {/* Admin hint - only shown to admin users */}
      {isAdmin && currentScreenshotData?.gameName && (
        <div className="mt-2 px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded-lg">
          <span className="text-xs text-red-400 font-medium">
            {t('game.adminHint')}: {currentScreenshotData.gameName}
          </span>
        </div>
      )}

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
