import { useEffect, useState, useCallback } from 'react'
import { Loader2, ZoomOut, ZoomIn, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    type CarouselApi,
} from '@/components/ui/carousel'
import { Button } from '@/components/ui/button'

// Subtle zoom levels - not too visible but useful for seeing more context
const ZOOM_LEVELS = [1, 0.85, 0.7, 0.55, 0.4] as const

interface GameCarouselImage {
    url: string | null
    alt?: string
}

interface GameCarouselProps {
    images: GameCarouselImage[]
    currentIndex: number
    onSlideChange?: (index: number) => void
    className?: string
    showSwipeHint?: boolean
    enableHapticFeedback?: boolean
    imageClassName?: string
    onImageLoad?: () => void
    enableZoom?: boolean
}

export function GameCarousel({
    images,
    currentIndex,
    onSlideChange,
    className,
    enableHapticFeedback = true,
    imageClassName,
    onImageLoad,
    enableZoom = true,
}: GameCarouselProps) {
    const [api, setApi] = useState<CarouselApi>()
    const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set())
    const [hasUserInteracted, setHasUserInteracted] = useState(false)
    const [zoomLevelIndex, setZoomLevelIndex] = useState(0)

    const currentZoom = ZOOM_LEVELS[zoomLevelIndex] ?? 1

    // Reset zoom when image changes
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset zoom when navigating to a new image
        setZoomLevelIndex(0)
    }, [currentIndex])

    // Zoom out one level
    const handleZoomOut = useCallback(() => {
        setZoomLevelIndex((prev) => Math.min(prev + 1, ZOOM_LEVELS.length - 1))
    }, [])

    // Zoom in one level
    const handleZoomIn = useCallback(() => {
        setZoomLevelIndex((prev) => Math.max(prev - 1, 0))
    }, [])

    // Reset zoom to default
    const handleResetZoom = useCallback(() => {
        setZoomLevelIndex(0)
    }, [])

    // Track user interaction to enable haptic feedback
    useEffect(() => {
        const handleInteraction = () => setHasUserInteracted(true)
        const events = ['click', 'touchstart', 'keydown']
        events.forEach((e) => document.addEventListener(e, handleInteraction, { once: true }))
        return () => events.forEach((e) => document.removeEventListener(e, handleInteraction))
    }, [])

    // Trigger haptic feedback on navigation
    const triggerHapticFeedback = useCallback(() => {
        if (enableHapticFeedback && hasUserInteracted && 'vibrate' in navigator) {
            navigator.vibrate(50)
        }
    }, [enableHapticFeedback, hasUserInteracted])

    // Handle slide selection
    useEffect(() => {
        if (!api) return

        const handleSelect = () => {
            const selectedIndex = api.selectedScrollSnap()
            onSlideChange?.(selectedIndex)
            triggerHapticFeedback()
        }

        api.on('select', handleSelect)

        return () => {
            api.off('select', handleSelect)
        }
    }, [api, onSlideChange, triggerHapticFeedback])

    // Sync carousel position with currentIndex prop
    useEffect(() => {
        if (api && api.selectedScrollSnap() !== currentIndex) {
            api.scrollTo(currentIndex, false)
        }
    }, [api, currentIndex])

    // Handle image load
    const handleImageLoad = useCallback(
        (index: number) => {
            setLoadedImages((prev) => new Set(prev).add(index))
            if (index === currentIndex) {
                onImageLoad?.()
            }
        },
        [currentIndex, onImageLoad]
    )

    return (
        <div className={cn('relative w-full h-full', className)}>
            <Carousel
                setApi={setApi}
                opts={{
                    align: 'center',
                    loop: false,
                    dragFree: false,
                    skipSnaps: false,
                    containScroll: 'trimSnaps',
                    watchDrag: false,
                }}
                className="w-full h-full pointer-events-none"
            >
                <CarouselContent className="h-full ml-0">
                    {images.map((image, index) => (
                        <CarouselItem key={index} className="basis-full h-full pl-0 flex items-center justify-center overflow-hidden">
                            {image.url ? (
                                <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                                    {!loadedImages.has(index) && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                        </div>
                                    )}
                                    <img
                                        src={image.url}
                                        alt={image.alt || `Screenshot ${index + 1}`}
                                        className={cn(
                                            'max-w-full max-h-full object-contain md:w-full md:h-full md:object-cover transition-all duration-300',
                                            loadedImages.has(index) ? 'opacity-100' : 'opacity-0',
                                            imageClassName
                                        )}
                                        style={{
                                            transform: index === currentIndex ? `scale(${currentZoom})` : undefined,
                                        }}
                                        onLoad={() => handleImageLoad(index)}
                                    />
                                </div>
                            ) : (
                                <div className="flex items-center justify-center text-muted-foreground h-full w-full">
                                    No image available
                                </div>
                            )}
                        </CarouselItem>
                    ))}
                </CarouselContent>
            </Carousel>

            {/* Zoom Controls */}
            {enableZoom && (
                <div className="absolute bottom-4 left-4 z-20 flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-lg p-1 pointer-events-auto">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/20"
                        onClick={handleZoomIn}
                        disabled={zoomLevelIndex === 0}
                        title="Zoom in"
                    >
                        <ZoomIn className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/20"
                        onClick={handleZoomOut}
                        disabled={zoomLevelIndex === ZOOM_LEVELS.length - 1}
                        title="Zoom out"
                    >
                        <ZoomOut className="h-4 w-4" />
                    </Button>
                    {zoomLevelIndex !== 0 && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/20"
                            onClick={handleResetZoom}
                            title="Reset zoom"
                        >
                            <RotateCcw className="h-4 w-4" />
                        </Button>
                    )}
                    {zoomLevelIndex !== 0 && (
                        <span className="text-xs text-white/60 px-2 tabular-nums">
                            {Math.round(currentZoom * 100)}%
                        </span>
                    )}
                </div>
            )}
        </div>
    )
}
