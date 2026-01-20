import { useEffect, useState, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useGameStore } from '@/stores/gameStore'
import { gameApi } from '@/lib/api/game'
import { GameCarousel } from '@/components/ui/game-carousel'

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
  const [images, setImages] = useState<{ url: string | null; alt?: string }[]>([])
  const [currentCarouselIndex, setCurrentCarouselIndex] = useState(1)

  const {
    currentPosition,
    positionStates,
    totalScreenshots,
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

  // Build images array: [prev, current, next]
  useEffect(() => {
    const newImages = [
      { url: null, alt: 'Previous screenshot' },
      { url: imageUrl, alt: `Screenshot ${currentPosition}` },
      { url: null, alt: 'Next screenshot' },
    ]

    // Load adjacent screenshots
    if (sessionId && gamePhase === 'playing') {
      if (findPreviousPosition) {
        gameApi.getScreenshot(sessionId, findPreviousPosition)
          .then((data) => {
            setImages((prev) => {
              const updated = [...prev]
              updated[0] = { url: data.imageUrl, alt: `Screenshot ${findPreviousPosition}` }
              return updated
            })
          })
          .catch(() => { })
      }

      if (findNextPosition) {
        gameApi.getScreenshot(sessionId, findNextPosition)
          .then((data) => {
            setImages((prev) => {
              const updated = [...prev]
              updated[2] = { url: data.imageUrl, alt: `Screenshot ${findNextPosition}` }
              return updated
            })
          })
          .catch(() => { })
      }
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- Necessary to update images when dependencies change
    setImages(newImages)
     
    setCurrentCarouselIndex(1) // Reset to center
  }, [imageUrl, currentPosition, sessionId, gamePhase, findPreviousPosition, findNextPosition])

  // Handle carousel slide change (disabled - swipe removed)
  const handleSlideChange = (_index: number) => {
    // Swipe navigation disabled
    return
  }

  return (
    <div
      className={cn(
        "relative bg-card select-none min-h-[60vh] md:min-h-[65vh]",
        className
      )}
      style={{ overflow: 'hidden' }}
    >
      <GameCarousel
        images={images}
        currentIndex={currentCarouselIndex}
        onSlideChange={handleSlideChange}
        onImageLoad={onLoad}
        showSwipeHint={gamePhase === 'playing'}
        enableHapticFeedback={true}
        className="w-full h-full"
      />

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-background/40 pointer-events-none z-10" />

      {/* Placeholder when no image */}
      {!imageUrl && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-neon-purple/20 to-neon-pink/20 z-20"
          >
            <p className="text-muted-foreground">Screenshot will appear here</p>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  )
}
