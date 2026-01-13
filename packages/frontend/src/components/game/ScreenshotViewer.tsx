import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGameStore } from '@/stores/gameStore'
import { springConfig } from '@/lib/animations'
import { gameApi } from '@/lib/api/game'

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
  const [isMobile, setIsMobile] = useState(false)
  const [nextImageUrl, setNextImageUrl] = useState<string | null>(null)
  const [prevImageUrl, setPrevImageUrl] = useState<string | null>(null)
  
  const {
    currentPosition,
    positionStates,
    totalScreenshots,
    navigateToPosition,
    gamePhase,
    sessionId,
  } = useGameStore()

  const screenWidth = useMemo(() => {
    return typeof window !== 'undefined' ? window.innerWidth : 1000
  }, [])

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

  // Handle swipe end
  const handleSwipeEnd = (_event: any, info: { offset: { x: number }; velocity: { x: number } }) => {
    if (gamePhase !== 'playing' || !isMobile) return

    const threshold = 50
    const velocityThreshold = 500
    const offset = info.offset.x
    const velocity = info.velocity.x
    const shouldNavigate = Math.abs(offset) > threshold || Math.abs(velocity) > velocityThreshold

    if (shouldNavigate) {
      if (offset < 0 || velocity < -velocityThreshold) {
        // Swipe left - go to next
        const nextPos = findNextPosition
        if (nextPos) {
          navigateToPosition(nextPos)
        }
      } else if (offset > 0 || velocity > velocityThreshold) {
        // Swipe right - go to previous
        const prevPos = findPreviousPosition
        if (prevPos) {
          navigateToPosition(prevPos)
        }
      }
    }
  }

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Load adjacent screenshots
  useEffect(() => {
    if (!sessionId || gamePhase !== 'playing') {
      setNextImageUrl(null)
      setPrevImageUrl(null)
      return
    }

    const nextPos = findNextPosition
    const prevPos = findPreviousPosition

    if (nextPos) {
      gameApi.getScreenshot(sessionId, nextPos)
        .then((data) => setNextImageUrl(data.imageUrl))
        .catch(() => {})
    } else {
      setNextImageUrl(null)
    }

    if (prevPos) {
      gameApi.getScreenshot(sessionId, prevPos)
        .then((data) => setPrevImageUrl(data.imageUrl))
        .catch(() => {})
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

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-card touch-none select-none",
        className
      )}
    >
      {/* Swipeable container - only on mobile */}
      {isMobile ? (
        <motion.div
          className="absolute inset-0 flex"
          drag="x"
          dragConstraints={{ left: -screenWidth, right: screenWidth }}
          dragElastic={0.1}
          dragMomentum={false}
          onDragEnd={handleSwipeEnd}
          whileDrag={{ cursor: 'grabbing' }}
          transition={springConfig.snappy}
        >
          {/* Previous image */}
          {prevImageUrl && (
            <div
              className="flex-shrink-0"
              style={{
                width: screenWidth,
                height: '100%',
                backgroundImage: `url(${prevImageUrl})`,
                backgroundSize: 'contain',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
              }}
            />
          )}

          {/* Current image */}
          <div
            className="flex-shrink-0"
            style={{
              width: screenWidth,
              height: '100%',
              backgroundImage: isLoading ? 'none' : `url(${imageUrl})`,
              backgroundSize: 'contain',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }}
          />

          {/* Next image */}
          {nextImageUrl && (
            <div
              className="flex-shrink-0"
              style={{
                width: screenWidth,
                height: '100%',
                backgroundImage: `url(${nextImageUrl})`,
                backgroundSize: 'contain',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
              }}
            />
          )}
        </motion.div>
      ) : (
        /* Desktop: static image */
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: isLoading ? 'none' : `url(${imageUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
        />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-background/40 pointer-events-none z-10" />

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
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-neon-purple/20 to-neon-pink/20 z-20">
          <p className="text-muted-foreground">Screenshot will appear here</p>
        </div>
      )}
    </div>
  )
}
