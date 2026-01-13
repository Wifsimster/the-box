import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGameStore } from '@/stores/gameStore'

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
  const containerRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const [swipeOffset, setSwipeOffset] = useState(0)
  
  const {
    currentPosition,
    positionStates,
    totalScreenshots,
    skipToNextPosition,
    navigateToPosition,
    gamePhase,
  } = useGameStore()

  // Find previous navigable position
  const findPreviousPosition = () => {
    for (let i = currentPosition - 1; i >= 1; i--) {
      const state = positionStates[i]
      if (state?.status === 'skipped' || state?.status === 'not_visited') {
        return i
      }
    }
    for (let i = currentPosition - 1; i >= 1; i--) {
      const state = positionStates[i]
      if (state?.status === 'correct') {
        return i
      }
    }
    return null
  }

  // Check if there's a next position
  const hasNext = () => {
    for (let i = currentPosition + 1; i <= totalScreenshots; i++) {
      const state = positionStates[i]
      if (!state || state.status === 'not_visited' || state.status === 'skipped') {
        return true
      }
    }
    for (let i = 1; i < currentPosition; i++) {
      const state = positionStates[i]
      if (state?.status === 'skipped') {
        return true
      }
    }
    return false
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (gamePhase !== 'playing') return
    const touch = e.touches[0]
    touchStartX.current = touch.clientX
    touchStartY.current = touch.clientY
    setSwipeOffset(0)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (gamePhase !== 'playing' || touchStartX.current === null) return
    const touch = e.touches[0]
    const deltaX = touch.clientX - touchStartX.current
    const deltaY = Math.abs(touch.clientY - (touchStartY.current || 0))
    
    // Only allow horizontal swipes (ignore if vertical movement is too large)
    if (deltaY < Math.abs(deltaX)) {
      // Limit swipe offset to prevent over-swiping
      const maxOffset = window.innerWidth * 0.3
      setSwipeOffset(Math.max(-maxOffset, Math.min(maxOffset, deltaX)))
    }
  }

  const handleTouchEnd = () => {
    if (gamePhase !== 'playing' || touchStartX.current === null) return
    
    const threshold = 50 // Minimum swipe distance in pixels
    const offset = swipeOffset
    
    if (Math.abs(offset) > threshold) {
      if (offset < 0) {
        // Swipe left - go to next
        if (hasNext()) {
          skipToNextPosition()
        }
      } else {
        // Swipe right - go to previous
        const prevPos = findPreviousPosition()
        if (prevPos) {
          navigateToPosition(prevPos)
        }
      }
    }
    
    // Reset
    touchStartX.current = null
    touchStartY.current = null
    setSwipeOffset(0)
  }

  useEffect(() => {
    if (!containerRef.current || !imageUrl) return

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

    return () => {
      // Cleanup
    }
  }, [imageUrl, onLoad])

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative overflow-hidden bg-card touch-none select-none",
        className
      )}
      style={{
        backgroundImage: isLoading ? 'none' : `url(${imageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        transform: swipeOffset !== 0 ? `translateX(${swipeOffset}px)` : undefined,
        transition: swipeOffset === 0 ? 'transform 0.2s ease-out' : 'none',
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Gradient overlay for better UI visibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-background/40 pointer-events-none" />

      {/* Loading state */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-card"
          >
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Placeholder when no image */}
      {!imageUrl && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-neon-purple/20 to-neon-pink/20">
          <p className="text-muted-foreground">Screenshot will appear here</p>
        </div>
      )}
    </div>
  )
}
