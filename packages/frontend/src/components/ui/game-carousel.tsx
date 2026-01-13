import { useEffect, useState, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    type CarouselApi,
} from '@/components/ui/carousel'

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
}

export function GameCarousel({
    images,
    currentIndex,
    onSlideChange,
    className,
    enableHapticFeedback = true,
    imageClassName,
    onImageLoad,
}: GameCarouselProps) {
    const [api, setApi] = useState<CarouselApi>()
    const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set())

    // Trigger haptic feedback on navigation
    const triggerHapticFeedback = useCallback(() => {
        if (enableHapticFeedback && 'vibrate' in navigator) {
            navigator.vibrate(50)
        }
    }, [enableHapticFeedback])

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
                        <CarouselItem key={index} className="basis-full h-full pl-0 flex items-center justify-center">
                            {image.url ? (
                                <div className="relative w-full h-full flex items-center justify-center">
                                    {!loadedImages.has(index) && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                        </div>
                                    )}
                                    <img
                                        src={image.url}
                                        alt={image.alt || `Screenshot ${index + 1}`}
                                        className={cn(
                                            'max-w-full max-h-full object-contain md:w-full md:h-full md:object-cover transition-opacity duration-300',
                                            loadedImages.has(index) ? 'opacity-100' : 'opacity-0',
                                            imageClassName
                                        )}
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
        </div>
    )
}
