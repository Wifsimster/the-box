import { useEffect, useState, useMemo } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useGameStore } from '@/stores/gameStore'
import { gameApi } from '@/lib/api/game'
import { GameCarousel } from '@/components/ui/game-carousel'

interface ScreenshotViewerProps {
  imageUrl: string
  className?: string
  onLoad?: () => void
}

// Swipe navigation is disabled, so slide changes are intentionally ignored.
// Defined at module scope: it closes over no component state.
function handleSlideChange(_index: number) {
  // Swipe navigation disabled
}

export function ScreenshotViewer({
  imageUrl,
  className,
  onLoad,
}: ScreenshotViewerProps) {
  const { t } = useTranslation()
  // Prefetched neighbour screenshots, keyed by their absolute position so the
  // async results are tied to the data they describe rather than a slot index.
  const [adjacentImages, setAdjacentImages] = useState<
    Record<number, { url: string; alt: string }>
  >({})

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

  // Prefetch the adjacent screenshots and stash them keyed by position. Each
  // resolved fetch performs a single state update, so the effect never
  // cascades multiple setState calls.
  useEffect(() => {
    if (!sessionId || gamePhase !== 'playing') return

    let cancelled = false

    const prefetch = (position: number | null) => {
      if (!position) return
      gameApi.getScreenshot(sessionId, position, { prefetch: true })
        .then((data) => {
          if (cancelled) return
          setAdjacentImages((prev) => ({
            ...prev,
            [position]: {
              url: data.imageUrl,
              alt: t('game.screenshotAlt.current', {
                defaultValue: 'Screenshot {{position}} of {{total}}',
                position,
                total: totalScreenshots,
              }),
            },
          }))
        })
        .catch(() => { })
    }

    prefetch(findPreviousPosition)
    prefetch(findNextPosition)

    return () => {
      cancelled = true
    }
  }, [sessionId, gamePhase, totalScreenshots, findPreviousPosition, findNextPosition, t])

  // Derive the carousel images during render: [prev, current, next]. Neighbour
  // slots fill in from prefetched data once available.
  const images = useMemo(() => {
    const prev = findPreviousPosition !== null ? adjacentImages[findPreviousPosition] : undefined
    const next = findNextPosition !== null ? adjacentImages[findNextPosition] : undefined
    return [
      {
        url: prev?.url ?? null,
        alt: prev?.alt ?? t('game.screenshotAlt.previous', { defaultValue: 'Previous screenshot' }),
      },
      {
        url: imageUrl,
        alt: t('game.screenshotAlt.current', {
          defaultValue: 'Screenshot {{position}} of {{total}}',
          position: currentPosition,
          total: totalScreenshots,
        }),
      },
      {
        url: next?.url ?? null,
        alt: next?.alt ?? t('game.screenshotAlt.next', { defaultValue: 'Next screenshot' }),
      },
    ]
  }, [imageUrl, currentPosition, totalScreenshots, findPreviousPosition, findNextPosition, adjacentImages, t])

  return (
    <div
      className={cn(
        "relative bg-card select-none size-full",
        className
      )}
      style={{ overflow: 'hidden' }}
    >
      <GameCarousel
        images={images}
        currentIndex={1}
        onSlideChange={handleSlideChange}
        onImageLoad={onLoad}
        showSwipeHint={gamePhase === 'playing'}
        enableHapticFeedback={true}
        className="size-full"
      />

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-linear-to-t from-background/60 via-transparent to-background/40 pointer-events-none z-10" />

      {/* Placeholder when no image */}
      {!imageUrl && (
        <AnimatePresence>
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-linear-to-br from-neon-purple/20 to-neon-pink/20 z-20"
          >
            <p className="text-muted-foreground">{t('game.screenshotPlaceholder')}</p>
          </m.div>
        </AnimatePresence>
      )}
    </div>
  )
}
