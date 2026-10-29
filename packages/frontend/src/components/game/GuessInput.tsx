import { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { m } from 'framer-motion'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { useGameStore } from '@/stores/gameStore'
import { SkipForward, SkipBack, Send, XCircle } from 'lucide-react'
import { ThinkingOrb } from '@/components/ui/thinking-orb'
import { createGuessSubmissionService } from '@/services'
import { LetterRevealBar } from '@/components/game/LetterRevealBar'
import { ProximityHintBanner } from '@/components/game/ProximityHintBanner'
import { useReducedMotionSafe } from '@/hooks/useReducedMotionSafe'
import { useGameGuess } from '@/hooks/useGameGuess'
import { useOnline } from '@/hooks/useOnline'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(pattern)
    } catch {
    }
  }
}

export function GuessInput() {
  const { t } = useTranslation()
  const isOnline = useOnline()
  const [query, setQuery] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isShaking, setIsShaking] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [announceIncorrect, setAnnounceIncorrect] = useState(false)
  const [showMiss, setShowMiss] = useState(false)
  const missTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (missTimer.current) clearTimeout(missTimer.current)
  }, [])
  const inputRef = useRef<HTMLInputElement>(null)

  const guessSubmissionService = useMemo(
    () => createGuessSubmissionService(),
    []
  )

  const { submitGuess } = useGameGuess(guessSubmissionService)

  const {
    gamePhase,
    skipToNextPosition,
    currentPosition,
    totalScreenshots,
    navigateToPosition,
    positionStates,
  } = useGameStore()

  useEffect(() => {
    if (gamePhase === 'playing' && inputRef.current) {
      inputRef.current.focus({ preventScroll: true })
    }
  }, [gamePhase])

  const prefersReducedMotion = useReducedMotionSafe()

  const handleSubmit = async () => {
    if (isSubmitting || !query.trim()) return
    if (!isOnline) {
      toast.error(t('game.offlineGuess'))
      return
    }

    setIsSubmitting(true)
    try {
      const result = await submitGuess(null, query.trim())

      if (!result.success && result.error) {
        toast.error(t(result.error, { defaultValue: result.error }))
      }

      if (result.success) {
        if (result.isCorrect) {
          setIsSuccess(true)
          setTimeout(() => setIsSuccess(false), 800)
          vibrate(15)
        } else {
          setAnnounceIncorrect(true)
          setTimeout(() => setAnnounceIncorrect(false), 1000)
          setShowMiss(true)
          if (missTimer.current) clearTimeout(missTimer.current)
          missTimer.current = setTimeout(() => setShowMiss(false), 2500)
          if (!prefersReducedMotion) {
            setIsShaking(true)
            setTimeout(() => setIsShaking(false), 500)
          }
          vibrate([30, 40, 30])
        }
      }

      if (result.success) {
        const currentChallengeId = useGameStore.getState().challengeId
        const isDailyChallengeMode = currentChallengeId !== null

        if (result.isCorrect) {
          setQuery('')
        } else if (!isDailyChallengeMode) {
          setQuery('')
        }
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSkip = () => {
    if (isSubmitting) return

    skipToNextPosition()
    setQuery('')
  }

  const findPreviousPosition = () => {
    for (let i = currentPosition - 1; i >= 1; i--) {
      const state = positionStates[i]
      if (state?.status === 'skipped' || state?.status === 'not_visited' || state?.status === 'correct') {
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
    }
  }

  const previousPosition = findPreviousPosition()
  const canGoPrevious = currentPosition > 1 && previousPosition !== null

  const isLastPosition = currentPosition === totalScreenshots

  const proximityHint = positionStates[currentPosition]?.proximityHint

  const keepKeyboardOpen = (e: React.PointerEvent) => {
    e.preventDefault()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="relative">
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {isSuccess && t('game.guessCorrect', { defaultValue: 'Correct guess!' })}
      </div>
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {announceIncorrect && t('game.guessIncorrect', { defaultValue: 'Incorrect guess. Try again.' })}
      </div>

      <div className="flex items-end gap-1.5 sm:gap-2">
        {canGoPrevious && (
          <Tooltip content={t('game.navigation.previous')}>
            <Button
              variant="outline"
              size="icon"
              onClick={handlePrevious}
              disabled={gamePhase !== 'playing' || isSubmitting}
              aria-label={t('game.navigation.previous')}
              onPointerDown={keepKeyboardOpen}
              className="size-12 sm:size-14 shrink-0 touch-manipulation bg-background/60 backdrop-blur-sm"
            >
              <SkipBack className="size-4 sm:size-5" />
            </Button>
          </Tooltip>
        )}

        <m.div
          className="relative flex-1 min-w-0"
          animate={isShaking ? { x: [-10, 10, -10, 10, 0] } : {}}
          transition={{ duration: 0.4 }}
        >
          <div
            className={cn(
              'rounded-xl overflow-hidden border-2 border-primary/30 shadow-[var(--glow-md)] bg-linear-to-r from-background/40 to-card/30 backdrop-blur-md md:backdrop-blur-xl focus-within:border-primary focus-within:shadow-[var(--glow-lg)] transition-all duration-300',
              isSuccess && 'border-success shadow-[var(--glow-success)] motion-safe:animate-pulse',
              !isSuccess && announceIncorrect && 'border-error shadow-[var(--glow-error)]'
            )}
          >
            <LetterRevealBar />

            <div className="relative">
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  if (showMiss) setShowMiss(false)
                }}
                onKeyDown={handleKeyDown}
                placeholder={t('game.guessPlaceholder')}
                enterKeyHint="send"
                inputMode="text"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-label={t('game.guessPlaceholder')}
                aria-invalid={announceIncorrect || undefined}
                className="h-12 sm:h-14 text-base md:text-lg border-0 rounded-none bg-transparent shadow-none focus-visible:ring-0 pl-3 sm:pl-4 pr-13 sm:pr-15"
                disabled={gamePhase !== 'playing'}
              />

              <Button
                variant="ghost"
                size="icon"
                onClick={handleSubmit}
                disabled={!query.trim() || isSubmitting || gamePhase !== 'playing' || !isOnline}
                aria-label={t('game.submit', { defaultValue: 'Submit guess' })}
                onPointerDown={keepKeyboardOpen}
                className={cn(
                  'absolute right-0.5 inset-y-0 my-auto size-11 sm:size-12 p-0 touch-manipulation transition-all duration-300',
                  query.trim()
                    ? 'bg-linear-to-r from-neon-pink to-neon-purple hover:from-neon-pink/90 hover:to-neon-purple/90'
                    : 'hover:bg-accent'
                )}
              >
                {isSubmitting ? (
                  <ThinkingOrb
                    state="solving"
                    size={20}
                    role="presentation"
                    aria-hidden
                  />
                ) : (
                  <Send className={cn('size-4 sm:size-5', query.trim() && 'text-white')} />
                )}
              </Button>
            </div>
          </div>
        </m.div>

        {!isLastPosition && (
          <Tooltip content={t('game.navigation.skip')}>
            <Button
              variant="outline"
              size="icon"
              onClick={handleSkip}
              disabled={gamePhase !== 'playing' || isSubmitting}
              aria-label={t('game.navigation.skip')}
              onPointerDown={keepKeyboardOpen}
              className="size-12 sm:size-14 shrink-0 touch-manipulation bg-background/60 backdrop-blur-sm"
            >
              <SkipForward className="size-4 sm:size-5" />
            </Button>
          </Tooltip>
        )}
      </div>

      {gamePhase === 'playing' && !isOnline && (
        <p role="status" className="mt-2 text-center text-xs text-warning">
          {t('game.offlineGuess')}
        </p>
      )}

      {gamePhase === 'playing' && showMiss && !proximityHint && (
        <p aria-hidden="true" className="mt-2 flex items-center justify-center gap-1.5 text-xs text-error">
          <XCircle className="size-3.5 shrink-0" />
          {t('game.guessIncorrect', { defaultValue: 'Incorrect guess. Try again.' })}
        </p>
      )}

      {gamePhase === 'playing' && proximityHint && (
        <ProximityHintBanner hint={proximityHint} />
      )}
    </div>
  )
}
