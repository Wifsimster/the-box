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

  // Fallback: show current image if carousel fails
  if (!api && imageUrl) {
    return (
      <div
        className={cn(
          "relative overflow-hidden bg-card select-none",
          className
        )}
      >
        <div className="absolute inset-0 w-full h-full">
          {renderImage(imageUrl)}
        </div>
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-background/40 pointer-events-none z-10" />
        {/* Loading state */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-card z-20">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-card select-none",
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
        }}
        className="w-full h-full"
      >
        <CarouselContent className="h-full !ml-0">
          {/* Previous screenshot */}
          <CarouselItem className="basis-full h-full !pl-0">
            <div className="h-full w-full">
              {renderImage(prevImageUrl)}
            </div>
          </CarouselItem>

          {/* Current screenshot */}
          <CarouselItem className="basis-full h-full !pl-0">
            <div className="h-full w-full">
              {renderImage(imageUrl)}
            </div>
          </CarouselItem>

          {/* Next screenshot */}
          <CarouselItem className="basis-full h-full !pl-0">
            <div className="h-full w-full">
              {renderImage(nextImageUrl)}
            </div>
          </CarouselItem>
        </CarouselContent>
      </Carousel>

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
