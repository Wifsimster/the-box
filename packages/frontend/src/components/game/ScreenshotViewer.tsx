import { useEffect, useState, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGameStore } from '@/stores/gameStore'
import { gameApi } from '@/lib/api/game'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from '@/components/ui/carousel'

interface ScreenshotViewerProps {
  imageUrl: string
  className?: string
  onLoad?: () => void
}

export function ScreenshotViewer({
  imageUrl,
  className,
  onLoad,
}: ScreenshotViewerProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [api, setApi] = useState<CarouselApi>()
  const [prevImageUrl, setPrevImageUrl] = useState<string | null>(null)
  const [nextImageUrl, setNextImageUrl] = useState<string | null>(null)
  const [dragProgress, setDragProgress] = useState(0)
  const [showSwipeHint, setShowSwipeHint] = useState(true)

  const {
    currentPosition,
    positionStates,
    totalScreenshots,
    navigateToPosition,
    gamePhase,
    sessionId,
  } = useGameStore()

  // Find previous navigable position
  const findPreviousPosition = useMemo(() => {
    for (let i = currentPosition - 1; i >= 1; i--) {
      const state = positionStates[i]
      if (state?.status === 'skipped' || state?.status === 'not_visited' || state?.status === 'correct') {
        return i
      }
    }
    for (let i = totalScreenshots; i > currentPosition; i--) {
      const state = positionStates[i]
      if (state?.status === 'skipped' || state?.status === 'correct') {
        return i
      }
    }
    return null
  }, [currentPosition, positionStates, totalScreenshots])

  // Find next navigable position
  const findNextPosition = useMemo(() => {
    for (let i = currentPosition + 1; i <= totalScreenshots; i++) {
      const state = positionStates[i]
      if (!state || state.status === 'not_visited' || state.status === 'skipped' || state.status === 'correct') {
        return i
      }
    }
    for (let i = 1; i < currentPosition; i++) {
      const state = positionStates[i]
      if (state?.status === 'skipped' || state?.status === 'correct') {
        return i
      }
    }
    return null
  }, [currentPosition, positionStates, totalScreenshots])

  // Initialize carousel to center position
  useEffect(() => {
    if (api && gamePhase === 'playing') {
      api.scrollTo(1, false)
    }
  }, [api, gamePhase])

  // Track drag progress for visual feedback
  useEffect(() => {
    if (!api) return

    const onScroll = () => {
      const progress = api.scrollProgress()
      // Convert progress to -1 to 1 range (left to right)
      // Progress is 0-1 for entire carousel, we want relative to center
      const selectedIndex = api.selectedScrollSnap()
      const centerOffset = progress - (1 / 3) // Center is at 1/3 position
      setDragProgress(centerOffset * 3) // Scale to -1 to 1 range
    }

    api.on('scroll', onScroll)
    return () => api.off('scroll', onScroll)
  }, [api])

  // Hide swipe hint after first interaction
  useEffect(() => {
    if (!api) return

    const hideHint = () => setShowSwipeHint(false)

    api.on('scroll', hideHint)
    return () => api.off('scroll', hideHint)
  }, [api])

  // Handle carousel navigation to sync with game store
  useEffect(() => {
    if (!api || gamePhase !== 'playing') return

    const handleSelect = () => {
      const selectedIndex = api.selectedScrollSnap()
      // The carousel has 3 items: [prev, current, next]
      // Index 0 = previous, 1 = current, 2 = next
      if (selectedIndex === 0) {
        // Swiped to previous
        const prevPos = findPreviousPosition
        if (prevPos) {
          // Haptic feedback on successful navigation (mobile only)
          if ('vibrate' in navigator) {
            navigator.vibrate(50)
          }
          navigateToPosition(prevPos)
          // Reset carousel to center after navigation
          setTimeout(() => api.scrollTo(1, false), 100)
        } else {
          // Can't go previous, reset to center
          api.scrollTo(1, false)
        }
      } else if (selectedIndex === 2) {
        // Swiped to next
        const nextPos = findNextPosition
        if (nextPos) {
          // Haptic feedback on successful navigation (mobile only)
          if ('vibrate' in navigator) {
            navigator.vibrate(50)
          }
          navigateToPosition(nextPos)
          // Reset carousel to center after navigation
          setTimeout(() => api.scrollTo(1, false), 100)
        } else {
          // Can't go next, reset to center
          api.scrollTo(1, false)
        }
      }
    }

    api.on('select', handleSelect)
    return () => {
      api.off('select', handleSelect)
    }
  }, [api, gamePhase, findPreviousPosition, findNextPosition, navigateToPosition])

  // Reset carousel to center when position changes externally
  useEffect(() => {
    if (api && gamePhase === 'playing') {
      // Small delay to ensure carousel is ready
      const timer = setTimeout(() => {
        api.scrollTo(1, false)
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [api, currentPosition, gamePhase])

  // Load adjacent screenshots
  useEffect(() => {
    if (!sessionId || gamePhase !== 'playing') {
      setNextImageUrl(null)
      setPrevImageUrl(null)
      return
    }

    if (findNextPosition) {
      gameApi.getScreenshot(sessionId, findNextPosition)
        .then((data) => setNextImageUrl(data.imageUrl))
        .catch(() => setNextImageUrl(null))
    } else {
      setNextImageUrl(null)
    }

    if (findPreviousPosition) {
      gameApi.getScreenshot(sessionId, findPreviousPosition)
        .then((data) => setPrevImageUrl(data.imageUrl))
        .catch(() => setPrevImageUrl(null))
    } else {
      setPrevImageUrl(null)
    }
  }, [sessionId, gamePhase, currentPosition, findNextPosition, findPreviousPosition])

  useEffect(() => {
    if (!imageUrl) return

    setIsLoading(true)
    const img = new Image()
    img.onload = () => {
      setIsLoading(false)
      onLoad?.()
    }
    img.onerror = () => {
      setIsLoading(false)
    }
    img.src = imageUrl
  }, [imageUrl, onLoad])

  const renderImage = (url: string | null) => {
    if (!url) {
      return <div className="h-full w-full bg-card" />
    }

    return (
      <div
        className="w-full h-full"
        style={{
          backgroundImage: `url(${url})`,
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          minHeight: '100%',
        }}
      />
    )
  }

  return (
    <div
      className={cn(
        "relative bg-card select-none",
        className
      )}
    >
      <Carousel
        setApi={setApi}
        opts={{
          align: 'center',
          loop: false,
          skipSnaps: false,
          dragFree: false,
          containScroll: 'trimSnaps',
          watchDrag: true,
          draggable: true,
          axis: 'x',
        }}
        className="w-full h-full overflow-hidden"
      >
        <CarouselContent className="h-full ml-0!">
          {/* Previous screenshot */}
          <CarouselItem className="basis-full h-full pl-0!">
            <div className="h-full w-full">
              {renderImage(prevImageUrl)}
            </div>
          </CarouselItem>

          {/* Current screenshot */}
          <CarouselItem className="basis-full h-full pl-0!">
            <div className="h-full w-full">
              {renderImage(imageUrl)}
            </div>
          </CarouselItem>

          {/* Next screenshot */}
          <CarouselItem className="basis-full h-full pl-0!">
            <div className="h-full w-full">
              {renderImage(nextImageUrl)}
            </div>
          </CarouselItem>
        </CarouselContent>
      </Carousel>

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-linear-to-t from-background/60 via-transparent to-background/40 pointer-events-none z-10" />

      {/* Swipe indicators */}
      <AnimatePresence>
        {showSwipeHint && gamePhase === 'playing' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 1, duration: 0.5 }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
          >
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-background/80 backdrop-blur-sm border border-border/50">
              <motion.div
                animate={{ x: [-4, 4, -4] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="text-xs text-muted-foreground flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span>Swipe</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drag progress indicators */}
      {gamePhase === 'playing' && Math.abs(dragProgress) > 0.05 && (
        <>
          {/* Left indicator */}
          {findPreviousPosition && dragProgress > 0.05 && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{
                opacity: Math.min(dragProgress * 2, 1),
                x: -20 + dragProgress * 30
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-30 pointer-events-none"
            >
              <div className="w-10 h-10 rounded-full bg-primary/20 backdrop-blur-sm border-2 border-primary flex items-center justify-center">
                <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </div>
            </motion.div>
          )}
          {/* Right indicator */}
          {findNextPosition && dragProgress < -0.05 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{
                opacity: Math.min(Math.abs(dragProgress) * 2, 1),
                x: 20 + dragProgress * 30
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-30 pointer-events-none"
            >
              <div className="w-10 h-10 rounded-full bg-primary/20 backdrop-blur-sm border-2 border-primary flex items-center justify-center">
                <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </motion.div>
          )}
        </>
      )}

      {/* Loading state */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-card z-20"
          >
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Placeholder when no image */}
      {!imageUrl && (
        <div className="absolute inset-0 flex items-center justify-center bg-linear-to-br from-neon-purple/20 to-neon-pink/20 z-20">
          <p className="text-muted-foreground">Screenshot will appear here</p>
        </div>
      )}
    </div>
  )
}
