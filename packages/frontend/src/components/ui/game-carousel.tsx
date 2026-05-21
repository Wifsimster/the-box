import {
    useEffect,
    useRef,
    useState,
    useCallback,
    type PointerEvent as ReactPointerEvent,
} from 'react'
import { Loader2, ZoomOut, ZoomIn, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    type CarouselApi,
} from '@/components/ui/carousel'
import { Button } from '@/components/ui/button'

// Magnification range: 1x = fit-to-frame (default), up to 4x.
const MIN_SCALE = 1
const MAX_SCALE = 4
// Multiplier applied per zoom-button press.
const ZOOM_STEP = 1.6

interface Point {
    x: number
    y: number
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

const midpoint = (a: Point, b: Point): Point => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
})

const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value))

interface ZoomView {
    scale: number
    x: number
    y: number
}

/**
 * Encapsulates zoom/pan/pinch state for a single image. Buttons drive
 * discrete steps; touch pointers drive drag-to-pan and pinch-to-zoom.
 */
function useImageZoom(resetKey: unknown) {
    const [view, setView] = useState<ZoomView>({ scale: 1, x: 0, y: 0 })
    const [isGesturing, setIsGesturing] = useState(false)

    const containerRef = useRef<HTMLDivElement | null>(null)
    const naturalRef = useRef({ w: 0, h: 0 })
    const pointersRef = useRef(new Map<number, Point>())
    const panRef = useRef<Point | null>(null)
    const pinchRef = useRef<{ dist: number; mid: Point } | null>(null)

    // Reset zoom whenever the displayed image changes.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset zoom for each new image
        setView({ scale: 1, x: 0, y: 0 })
    }, [resetKey])

    // Clamp a pan offset so the image edges can't be dragged inside the frame.
    const clampOffset = useCallback(
        (x: number, y: number, scale: number): Point => {
            const el = containerRef.current
            const { w: natW, h: natH } = naturalRef.current
            if (!el || !natW || !natH) return { x, y }
            const bw = el.clientWidth
            const bh = el.clientHeight
            // Match the rendered object-fit: cover on all viewports.
            const fit = Math.max(bw / natW, bh / natH)
            const contentW = natW * fit * scale
            const contentH = natH * fit * scale
            const maxX = Math.max(0, (contentW - bw) / 2)
            const maxY = Math.max(0, (contentH - bh) / 2)
            return {
                x: clamp(x, -maxX, maxX),
                y: clamp(y, -maxY, maxY),
            }
        },
        []
    )

    const setNaturalSize = useCallback((w: number, h: number) => {
        naturalRef.current = { w, h }
    }, [])

    // Zoom around the frame center (used by the buttons).
    const adjustZoom = useCallback(
        (factor: number) => {
            setView((v) => {
                const ns = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE)
                const r = ns / v.scale
                const c = clampOffset(v.x * r, v.y * r, ns)
                return { scale: ns, x: c.x, y: c.y }
            })
        },
        [clampOffset]
    )

    const zoomIn = useCallback(() => adjustZoom(ZOOM_STEP), [adjustZoom])
    const zoomOut = useCallback(() => adjustZoom(1 / ZOOM_STEP), [adjustZoom])
    const reset = useCallback(() => setView({ scale: 1, x: 0, y: 0 }), [])

    const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
        const el = containerRef.current
        if (!el) return
        el.setPointerCapture(e.pointerId)
        pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        setIsGesturing(true)
        const pts = [...pointersRef.current.values()]
        if (pts.length >= 2) {
            const [p0, p1] = pts
            pinchRef.current = {
                dist: distance(p0!, p1!),
                mid: midpoint(p0!, p1!),
            }
            panRef.current = null
        } else {
            panRef.current = { x: e.clientX, y: e.clientY }
        }
    }, [])

    const onPointerMove = useCallback(
        (e: ReactPointerEvent<HTMLDivElement>) => {
            if (!pointersRef.current.has(e.pointerId)) return
            pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
            const pts = [...pointersRef.current.values()]

            if (pts.length >= 2 && pinchRef.current) {
                // Pinch-to-zoom, anchored on the midpoint between the fingers.
                const [p0, p1] = pts
                const dist = distance(p0!, p1!)
                const mid = midpoint(p0!, p1!)
                const prev = pinchRef.current
                const el = containerRef.current
                if (!el) return
                const rect = el.getBoundingClientRect()
                const focalX = mid.x - (rect.left + rect.width / 2)
                const focalY = mid.y - (rect.top + rect.height / 2)
                const panDX = mid.x - prev.mid.x
                const panDY = mid.y - prev.mid.y
                const ratio = dist / (prev.dist || dist)
                setView((v) => {
                    const ns = clamp(v.scale * ratio, MIN_SCALE, MAX_SCALE)
                    const r = ns / v.scale
                    const nx = focalX + r * (v.x - focalX) + panDX
                    const ny = focalY + r * (v.y - focalY) + panDY
                    const c = clampOffset(nx, ny, ns)
                    return { scale: ns, x: c.x, y: c.y }
                })
                pinchRef.current = { dist, mid }
            } else if (pts.length === 1 && panRef.current) {
                // Drag-to-pan (only meaningful once magnified).
                const dx = e.clientX - panRef.current.x
                const dy = e.clientY - panRef.current.y
                panRef.current = { x: e.clientX, y: e.clientY }
                setView((v) => {
                    if (v.scale <= MIN_SCALE) return v
                    const c = clampOffset(v.x + dx, v.y + dy, v.scale)
                    return { ...v, x: c.x, y: c.y }
                })
            }
        },
        [clampOffset]
    )

    const endPointer = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
        pointersRef.current.delete(e.pointerId)
        const pts = [...pointersRef.current.values()]
        if (pts.length === 1) {
            // Pinch ended with one finger still down: hand off to panning.
            panRef.current = { x: pts[0]!.x, y: pts[0]!.y }
            pinchRef.current = null
        } else if (pts.length === 0) {
            panRef.current = null
            pinchRef.current = null
            setIsGesturing(false)
        }
    }, [])

    return {
        view,
        isGesturing,
        containerRef,
        setNaturalSize,
        zoomIn,
        zoomOut,
        reset,
        handlers: {
            onPointerDown,
            onPointerMove,
            onPointerUp: endPointer,
            onPointerCancel: endPointer,
        },
    }
}

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

    const zoom = useImageZoom(images[currentIndex]?.url ?? currentIndex)
    const { view } = zoom

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
                    {images.map((image, index) => {
                        const isActive = index === currentIndex
                        const zoomable = isActive && enableZoom
                        return (
                            <CarouselItem key={index} className="basis-full h-full pl-0 flex items-center justify-center overflow-hidden">
                                {image.url ? (
                                    <div
                                        ref={zoomable ? zoom.containerRef : undefined}
                                        className={cn(
                                            'relative w-full h-full flex items-center justify-center overflow-hidden',
                                            zoomable && 'pointer-events-auto touch-none',
                                            zoomable && view.scale > 1 &&
                                                (zoom.isGesturing ? 'cursor-grabbing' : 'cursor-grab')
                                        )}
                                        {...(zoomable ? zoom.handlers : {})}
                                    >
                                        {!loadedImages.has(index) && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                                                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                            </div>
                                        )}
                                        <img
                                            src={image.url}
                                            alt={image.alt || `Screenshot ${index + 1}`}
                                            draggable={false}
                                            className={cn(
                                                'w-full h-full object-cover',
                                                'transition-opacity duration-300',
                                                loadedImages.has(index) ? 'opacity-100' : 'opacity-0',
                                                imageClassName
                                            )}
                                            style={
                                                zoomable
                                                    ? {
                                                          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
                                                          transition: zoom.isGesturing
                                                              ? 'opacity 300ms'
                                                              : 'opacity 300ms, transform 200ms ease-out',
                                                          willChange: 'transform',
                                                      }
                                                    : undefined
                                            }
                                            onLoad={(e) => {
                                                handleImageLoad(index)
                                                if (zoomable) {
                                                    zoom.setNaturalSize(
                                                        e.currentTarget.naturalWidth,
                                                        e.currentTarget.naturalHeight
                                                    )
                                                }
                                            }}
                                        />
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center text-muted-foreground h-full w-full">
                                        No image available
                                    </div>
                                )}
                            </CarouselItem>
                        )
                    })}
                </CarouselContent>
            </Carousel>

            {/* Zoom Controls */}
            {enableZoom && (
                <div className="absolute top-1/2 -translate-y-1/2 left-4 z-30 flex flex-col items-center gap-1 bg-black/60 backdrop-blur-sm rounded-lg p-1.5 pointer-events-auto transition-all duration-200">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-foreground/80 hover:text-foreground hover:bg-foreground/20"
                        onClick={zoom.zoomIn}
                        disabled={view.scale >= MAX_SCALE - 0.01}
                        title="Zoom in"
                    >
                        <ZoomIn className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-foreground/80 hover:text-foreground hover:bg-foreground/20"
                        onClick={zoom.zoomOut}
                        disabled={view.scale <= MIN_SCALE + 0.01}
                        title="Zoom out"
                    >
                        <ZoomOut className="h-4 w-4" />
                    </Button>
                    <div className={cn(
                        "flex flex-col items-center gap-1 overflow-hidden transition-all duration-200",
                        view.scale > 1.01 ? "max-h-20 opacity-100" : "max-h-0 opacity-0"
                    )}>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-foreground/80 hover:text-foreground hover:bg-foreground/20"
                            onClick={zoom.reset}
                            title="Reset zoom"
                        >
                            <RotateCcw className="h-4 w-4" />
                        </Button>
                        <span className="text-xs text-foreground/60 px-2 tabular-nums">
                            {Math.round(view.scale * 100)}%
                        </span>
                    </div>
                </div>
            )}
        </div>
    )
}
