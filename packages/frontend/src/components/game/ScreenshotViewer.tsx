import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGameStore } from '@/stores/gameStore'
import { springConfig } from '@/lib/animations'

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
  const x = useMotionValue(0)
  
  const {
    currentPosition,
    positionStates,
    totalScreenshots,
    skipToNextPosition,
    navigateToPosition,
    gamePhase,
  } = useGameStore()

  // Calculate max drag distance (30% of screen width) - memoized to avoid recalculation
  const maxDragDistance = useMemo(() => {
    return typeof window !== 'undefined' ? window.innerWidth * 0.3 : 150
  }, [])

  // Find previous navigable position (include all positions: skipped, not_visited, correct)
  const findPreviousPosition = useMemo(() => {
    for (let i = currentPosition - 1; i >= 1; i--) {
      const state = positionStates[i]
      if (state?.status === 'skipped' || state?.status === 'not_visited' || state?.status === 'correct') {
        return i
      }
    }
    return null
  }, [currentPosition, positionStates])

  // Check if there's a next position (include correct positions)
  const hasNext = useMemo(() => {
    for (let i = currentPosition + 1; i <= totalScreenshots; i++) {
      const state = positionStates[i]
      if (!state || state.status === 'not_visited' || state.status === 'skipped' || state.status === 'correct') {
        return true
      }
    }
    for (let i = 1; i < currentPosition; i++) {
      const state = positionStates[i]
      if (state?.status === 'skipped' || state?.status === 'correct') {
        return true
      }
    }
    return false
  }, [currentPosition, positionStates, totalScreenshots])

  // Opacity based on drag distance for visual feedback
  const opacity = useTransform(x, [-maxDragDistance, 0, maxDragDistance], [0.7, 1, 0.7])

  // Handle drag end - determine if we should navigate
  const handleDragEnd = (_event: any, info: { offset: { x: number }; velocity: { x: number } }) => {
    if (gamePhase !== 'playing') {
      // Reset position if not playing
      animate(x, 0, springConfig.snappy)
      return
    }

    const threshold = 50 // Minimum swipe distance in pixels
    const velocityThreshold = 500 // Minimum velocity for quick swipes
    const offset = info.offset.x
    const velocity = info.velocity.x

    // Check if swipe is significant enough (either by distance or velocity)
    const shouldNavigate = Math.abs(offset) > threshold || Math.abs(velocity) > velocityThreshold

    if (shouldNavigate) {
      const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1000
      
      if (offset < 0 || velocity < -velocityThreshold) {
        // Swipe left - go to next
        if (hasNext) {
          // Animate out to the left before navigating
          animate(x, -screenWidth, {
            type: 'spring',
            stiffness: 400,
            damping: 17,
            onComplete: () => {
              skipToNextPosition()
              // Reset position after navigation
              x.set(0)
            },
          })
          return
        }
      } else if (offset > 0 || velocity > velocityThreshold) {
        // Swipe right - go to previous
        if (findPreviousPosition) {
          // Animate out to the right before navigating
          animate(x, screenWidth, {
            type: 'spring',
            stiffness: 400,
            damping: 17,
            onComplete: () => {
              navigateToPosition(findPreviousPosition)
              // Reset position after navigation
              x.set(0)
            },
          })
          return
        }
      }
    }

    // Reset to center if swipe wasn't significant enough
    animate(x, 0, springConfig.snappy)
  }

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768) // md breakpoint
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Reset position when image changes (new screenshot loaded)
  useEffect(() => {
    x.set(0)
  }, [imageUrl, x])

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
    <motion.div
      className={cn(
        "relative overflow-hidden bg-card touch-none select-none",
        className
      )}
      style={{
        backgroundImage: isLoading ? 'none' : `url(${imageUrl})`,
        backgroundSize: isMobile ? 'contain' : 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        x,
        opacity,
      }}
      drag="x"
      dragConstraints={{ left: -maxDragDistance, right: maxDragDistance }}
      dragElastic={0.2}
      dragMomentum={false}
      onDragEnd={handleDragEnd}
      whileDrag={{ 
        cursor: 'grabbing',
        scale: 0.98,
      }}
      transition={springConfig.snappy}
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
    </motion.div>
  )
}
