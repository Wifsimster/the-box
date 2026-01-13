import { useEffect, useState, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    type CarouselApi,
} from '@/components/ui/carousel'
import { SwipeHint } from '@/components/ui/swipe-hint'

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
    showSwipeHint = true,
    enableHapticFeedback = true,
    imageClassName,
    onImageLoad,
}: GameCarouselProps) {
    const [api, setApi] = useState<CarouselApi>()
    const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set())
    const [showHint, setShowHint] = useState(showSwipeHint)

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
            setShowHint(false)
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
                }}
                className="w-full h-full"
            >
                <CarouselContent className="h-full !ml-0">
                    {images.map((image, index) => (
                        <CarouselItem key={index} className="basis-full h-full !pl-0">
                            <div className="relative w-full h-full flex items-center justify-center">
                                {image.url ? (
                                    <>
                                        {!loadedImages.has(index) && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                                                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                            </div>
                                        )}
                                        <div
                                            className={cn(
                                                'absolute inset-0 transition-opacity duration-300',
                                                loadedImages.has(index) ? 'opacity-100' : 'opacity-0',
                                                imageClassName
                                            )}
                                            style={{
                                                backgroundImage: `url(${image.url})`,
                                                backgroundSize: 'contain',
                                                backgroundPosition: 'center',
                                                backgroundRepeat: 'no-repeat',
                                            }}
                                        />
                                        <img
                                            src={image.url}
                                            alt={image.alt || `Screenshot ${index + 1}`}
                                            className="w-full h-full object-contain invisible pointer-events-none"
                                            onLoad={() => handleImageLoad(index)}
                                        />
                                    </>
                                ) : (
                                    <div className="flex items-center justify-center text-muted-foreground h-full w-full">
                                        No image available
                                    </div>
                                )}
                            </div>
                        </CarouselItem>
                    ))}
                </CarouselContent>
            </Carousel>

            {showHint && images.length > 1 && (
                <SwipeHint onDismiss={() => setShowHint(false)} />
            )}
        </div>
    )
}
