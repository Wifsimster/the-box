import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type KeyboardEvent,
    type MouseEvent,
    type PointerEvent,
    type WheelEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import type { GeoMapTilesConfig, GeoPoint } from '@the-box/types'
import { cn } from '@/lib/utils'
import { clamp01, isPlaceholderImageUrl } from '@/lib/geo-image'
import { MapErrorFallback } from './MapErrorFallback'

export interface MapCanvasProps {
    imageUrl: string
    widthPx: number
    heightPx: number
    // Optional tile source. Only honored by MapCanvasLeaflet — the legacy
    // DIY canvas (this file) ignores it and falls back to the imageUrl
    // thumbnail. Pages should set VITE_GEO_USE_LEAFLET=true for tile games.
    tiles?: GeoMapTilesConfig
    pin?: GeoPoint | null
    canonical?: GeoPoint | null // shown as a target when revealed
    onPin?: (p: GeoPoint) => void
    disabled?: boolean
    className?: string
    // When true, draws a guess → canonical connector. Only meaningful once
    // the guess has been revealed.
    showGuessLine?: boolean
}

const MIN_ZOOM = 1
const MAX_ZOOM = 6
const ZOOM_STEP = 1.4
// A pointer that travels more than this many pixels between down and up is
// treated as a pan gesture, not a click — so a small jitter doesn't drop a
// pin in the wrong spot.
const DRAG_THRESHOLD_PX = 5

/**
 * Click-to-pin map canvas with zoom (mouse wheel + buttons) and pan (drag).
 * Coordinates are normalized to [0..1] so the backend is decoupled from
 * actual image dimensions; a map asset swap doesn't invalidate historical pins.
 */
export function MapCanvas({
    imageUrl,
    widthPx,
    heightPx,
    pin,
    canonical,
    onPin,
    disabled,
    className,
    showGuessLine,
}: MapCanvasProps) {
    const { t } = useTranslation()
    const containerRef = useRef<HTMLDivElement>(null)
    const innerRef = useRef<HTMLDivElement>(null)
    const [hover, setHover] = useState<GeoPoint | null>(null)
    // Keyboard cursor — visible only while the canvas has focus. Lets keyboard
    // users nudge a virtual crosshair with arrow keys and confirm with
    // Enter/Space, since clientX/clientY isn't available without a mouse.
    const [kbCursor, setKbCursor] = useState<GeoPoint | null>(null)
    // Treat known placeholder URLs as failed up-front: they "load" successfully
    // (placehold.co returns a real image) so onError would never fire.
    const [errored, setErrored] = useState(() => isPlaceholderImageUrl(imageUrl))

    const [zoom, setZoom] = useState(1)
    const [pan, setPan] = useState({ x: 0, y: 0 })
    const [isPanning, setIsPanning] = useState(false)
    const dragRef = useRef<{
        pointerId: number
        startClientX: number
        startClientY: number
        startPanX: number
        startPanY: number
        moved: boolean
    } | null>(null)
    // Set briefly after a drag-pan ends so the upcoming click event (which the
    // browser still fires for the pointer that initiated the drag) doesn't drop
    // a stray pin.
    const suppressClickRef = useRef(false)

    // Reset error/zoom/pan whenever the underlying map changes; otherwise users
    // get stuck zoomed into the previous map's coordinates. Adjusting state
    // during render (instead of in an effect) avoids a stale-UI commit.
    const [prevImageUrl, setPrevImageUrl] = useState(imageUrl)
    if (imageUrl !== prevImageUrl) {
        setPrevImageUrl(imageUrl)
        setErrored(isPlaceholderImageUrl(imageUrl))
        setZoom(1)
        setPan({ x: 0, y: 0 })
    }

    const clampPan = useCallback(
        (x: number, y: number, z: number) => {
            const rect = containerRef.current?.getBoundingClientRect()
            if (!rect) return { x: 0, y: 0 }
            // transform-origin is center: at scale z, the inner div extends
            // (z-1)*size/2 past each edge. Clamp pan so we don't drift past
            // the image's corners.
            const slackX = ((z - 1) * rect.width) / 2
            const slackY = ((z - 1) * rect.height) / 2
            return {
                x: Math.max(-slackX, Math.min(slackX, x)),
                y: Math.max(-slackY, Math.min(slackY, y)),
            }
        },
        [],
    )

    const applyZoom = useCallback(
        (next: number, focal?: { clientX: number; clientY: number }) => {
            const rect = containerRef.current?.getBoundingClientRect()
            const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next))
            if (z <= 1) {
                setZoom(1)
                setPan({ x: 0, y: 0 })
                return
            }
            if (!rect) {
                setZoom(z)
                return
            }
            // Zoom toward the focal point by keeping the image-space coord
            // under the cursor fixed across the zoom change.
            if (focal) {
                const cx = focal.clientX - rect.left - rect.width / 2
                const cy = focal.clientY - rect.top - rect.height / 2
                const imageX = (cx - pan.x) / zoom
                const imageY = (cy - pan.y) / zoom
                const newPanX = cx - imageX * z
                const newPanY = cy - imageY * z
                setZoom(z)
                setPan(clampPan(newPanX, newPanY, z))
            } else {
                setZoom(z)
                setPan(clampPan(pan.x, pan.y, z))
            }
        },
        [zoom, pan, clampPan],
    )

    const zoomIn = () => applyZoom(zoom * ZOOM_STEP)
    const zoomOut = () => applyZoom(zoom / ZOOM_STEP)
    const zoomReset = () => applyZoom(1)

    const normalizeFromEvent = (clientX: number, clientY: number) => {
        // The inner div carries the transform; its bounding rect already
        // accounts for scale + pan, so dividing yields image-space coords.
        const rect = innerRef.current?.getBoundingClientRect()
        if (!rect) return null
        return {
            x: clamp01((clientX - rect.left) / rect.width),
            y: clamp01((clientY - rect.top) / rect.height),
        }
    }

    const handleClick = (e: MouseEvent<HTMLDivElement>) => {
        if (suppressClickRef.current) {
            suppressClickRef.current = false
            return
        }
        if (disabled || errored || !onPin) return
        const p = normalizeFromEvent(e.clientX, e.clientY)
        if (!p) return
        // Anchor the keyboard cursor to the click. Tapping focuses the canvas
        // (role=button, tabIndex=0), which fires handleFocus before the new
        // pin prop has propagated — without this sync the focus-seeded cursor
        // would land on the stale pin or the center default.
        setKbCursor(p)
        onPin(p)
    }

    const handleMove = (e: MouseEvent<HTMLDivElement>) => {
        if (errored) return
        const p = normalizeFromEvent(e.clientX, e.clientY)
        if (!p) return
        setHover(p)
    }

    const handleFocus = () => {
        if (disabled || errored) return
        // Seed the keyboard cursor from the existing pin (so re-focus picks up
        // where the player left off) or center it if there isn't one yet.
        setKbCursor((prev) => prev ?? pin ?? { x: 0.5, y: 0.5 })
    }

    const handleBlur = () => setKbCursor(null)

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (errored) return
        // Zoom shortcuts work even when the map is in disabled (post-guess)
        // mode so keyboard users can inspect the result.
        switch (e.key) {
            case '+':
            case '=':
                e.preventDefault()
                zoomIn()
                return
            case '-':
            case '_':
                e.preventDefault()
                zoomOut()
                return
            case '0':
                e.preventDefault()
                zoomReset()
                return
        }
        if (disabled || !onPin) return
        const cursor = kbCursor ?? pin ?? { x: 0.5, y: 0.5 }
        // Coarse step ~5% of the map (large enough to feel responsive without
        // being unmanageable), Shift bumps to ~15% for fast traversal.
        const step = e.shiftKey ? 0.15 : 0.05
        switch (e.key) {
            case 'ArrowLeft':
                e.preventDefault()
                setKbCursor({ x: clamp01(cursor.x - step), y: cursor.y })
                return
            case 'ArrowRight':
                e.preventDefault()
                setKbCursor({ x: clamp01(cursor.x + step), y: cursor.y })
                return
            case 'ArrowUp':
                e.preventDefault()
                setKbCursor({ x: cursor.x, y: clamp01(cursor.y - step) })
                return
            case 'ArrowDown':
                e.preventDefault()
                setKbCursor({ x: cursor.x, y: clamp01(cursor.y + step) })
                return
            case 'Enter':
            case ' ':
                e.preventDefault()
                onPin({ x: clamp01(cursor.x), y: clamp01(cursor.y) })
                return
            case 'Escape':
                setKbCursor(null)
                return
        }
    }

    const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
        if (errored) return
        // Don't preventDefault — React passes a passive listener for wheel,
        // which makes preventDefault a no-op. We avoid scroll capture by
        // reserving wheel zoom for the case when the user is already
        // hovering the map (which they are, since this is onWheel on the
        // container) and applying a moderate factor.
        const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
        applyZoom(zoom * factor, { clientX: e.clientX, clientY: e.clientY })
    }

    const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
        if (errored) return
        // Only initiate panning when zoomed; at zoom 1 the pointer should
        // remain free for click-to-pin. Mouse-only — drag panning on touch
        // would steal the click-to-pin gesture.
        if (zoom <= 1 || e.pointerType !== 'mouse') return
        dragRef.current = {
            pointerId: e.pointerId,
            startClientX: e.clientX,
            startClientY: e.clientY,
            startPanX: pan.x,
            startPanY: pan.y,
            moved: false,
        }
        e.currentTarget.setPointerCapture(e.pointerId)
    }

    const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
        const d = dragRef.current
        if (!d || d.pointerId !== e.pointerId) return
        const dx = e.clientX - d.startClientX
        const dy = e.clientY - d.startClientY
        if (!d.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
            d.moved = true
            setIsPanning(true)
        }
        if (d.moved) {
            setPan(clampPan(d.startPanX + dx, d.startPanY + dy, zoom))
        }
    }

    const endDrag = (e: PointerEvent<HTMLDivElement>) => {
        const d = dragRef.current
        if (!d || d.pointerId !== e.pointerId) return
        if (d.moved) suppressClickRef.current = true
        try {
            e.currentTarget.releasePointerCapture(e.pointerId)
        } catch {
            // Pointer capture may have been silently released already
            // (e.g. on Chrome when the pointer leaves the window). Safe to ignore.
        }
        dragRef.current = null
        setIsPanning(false)
    }

    const aspectRatio = widthPx > 0 && heightPx > 0 ? `${widthPx} / ${heightPx}` : '16 / 9'

    if (errored) {
        return <MapErrorFallback aspectRatio={aspectRatio} className={className} />
    }

    const interactive = !disabled && !!onPin
    const ariaLabel = interactive
        ? t('geo.map.ariaPin')
        : t('geo.map.ariaPinDisabled')

    const canPan = zoom > 1
    const cursorClass = isPanning
        ? 'cursor-grabbing'
        : disabled
            ? canPan
                ? 'cursor-grab'
                : 'cursor-default'
            : canPan
                ? 'cursor-grab'
                : 'cursor-crosshair'

    return (
        <div
            ref={containerRef}
            onClick={handleClick}
            onMouseMove={handleMove}
            onMouseLeave={() => setHover(null)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{ aspectRatio }}
            className={cn(
                'relative w-full rounded-lg overflow-hidden bg-background select-none touch-none',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                cursorClass,
                className,
            )}
            role={interactive ? 'button' : 'img'}
            tabIndex={0}
            aria-label={ariaLabel}
        >
            {/* Inner frame carries the transform. Image background and all
                normalized-coordinate overlays live here so their math stays
                trivial: the inner div's bounding rect already accounts for
                pan + zoom. */}
            <div
                ref={innerRef}
                className="absolute inset-0 origin-center"
                style={{
                    backgroundImage: `url(${imageUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transition: isPanning ? 'none' : 'transform 120ms ease-out',
                }}
            >
                {/* Hidden probe so we can detect a 404 on the background image,
                    which CSS background-image cannot signal. */}
                <img
                    src={imageUrl}
                    alt=""
                    className="hidden"
                    onError={() => setErrored(true)}
                    aria-hidden
                />

                {/* Hover crosshair — only while the user is still aiming.
                    Once a pin is placed the crosshair anchors to the pin
                    (below) so blurring the canvas (e.g. clicking a zoom
                    button) doesn't leave the crosshair drifting away from
                    the marker. */}
                {!disabled && hover && !kbCursor && !pin && (
                    <Crosshair x={hover.x} y={hover.y} faint />
                )}

                {/* Keyboard cursor — solid (not faint) so it's distinguishable
                    from the mouse-hover crosshair. */}
                {kbCursor && <Crosshair x={kbCursor.x} y={kbCursor.y} />}

                {/* Pin axis guide — anchored to the placed pin so the
                    crosshair always reads its coordinates, regardless of
                    where the mouse currently is. */}
                {pin && !kbCursor && (
                    <Crosshair x={pin.x} y={pin.y} faint />
                )}

                {/* Guess → canonical line */}
                {showGuessLine && pin && canonical && (
                    <GuessLine from={pin} to={canonical} />
                )}

                {/* User pin — counter-scale so it stays the same screen size
                    as the user zooms in. */}
                {pin && (
                    <Marker
                        x={pin.x}
                        y={pin.y}
                        color="fuchsia"
                        label={t('geo.map.labelYou')}
                        zoom={zoom}
                    />
                )}

                {/* Canonical (revealed) */}
                {canonical && (
                    <Marker
                        x={canonical.x}
                        y={canonical.y}
                        color="emerald"
                        label={t('geo.map.labelActual')}
                        zoom={zoom}
                    />
                )}
            </div>

            <ZoomControls
                zoom={zoom}
                onZoomIn={zoomIn}
                onZoomOut={zoomOut}
                onZoomReset={zoomReset}
                labels={{
                    in: t('geo.map.zoomIn'),
                    out: t('geo.map.zoomOut'),
                    reset: t('geo.map.zoomReset'),
                }}
            />
        </div>
    )
}

function ZoomControls({
    zoom,
    onZoomIn,
    onZoomOut,
    onZoomReset,
    labels,
}: {
    zoom: number
    onZoomIn: () => void
    onZoomOut: () => void
    onZoomReset: () => void
    labels: { in: string; out: string; reset: string }
}) {
    // Stop propagation so button clicks don't bubble up to the canvas's
    // click-to-pin handler.
    const stop = (cb: () => void) => (e: MouseEvent) => {
        e.stopPropagation()
        cb()
    }
    const baseBtn =
        'flex size-8 items-center justify-center rounded-md bg-background/80 text-foreground backdrop-blur-sm shadow-md ring-1 ring-border hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
    return (
        <div className="absolute right-2 top-2 z-10 flex flex-col gap-1">
            <button
                type="button"
                aria-label={labels.in}
                title={labels.in}
                onClick={stop(onZoomIn)}
                onPointerDown={(e) => e.stopPropagation()}
                disabled={zoom >= MAX_ZOOM}
                className={baseBtn}
            >
                <Plus className="size-4" aria-hidden />
            </button>
            <button
                type="button"
                aria-label={labels.out}
                title={labels.out}
                onClick={stop(onZoomOut)}
                onPointerDown={(e) => e.stopPropagation()}
                disabled={zoom <= MIN_ZOOM}
                className={baseBtn}
            >
                <Minus className="size-4" aria-hidden />
            </button>
            <button
                type="button"
                aria-label={labels.reset}
                title={labels.reset}
                onClick={stop(onZoomReset)}
                onPointerDown={(e) => e.stopPropagation()}
                disabled={zoom === 1}
                className={baseBtn}
            >
                <RotateCcw className="size-4" aria-hidden />
            </button>
        </div>
    )
}

function Marker({
    x,
    y,
    color,
    label,
    zoom,
}: {
    x: number
    y: number
    color: 'fuchsia' | 'emerald'
    label: string
    zoom: number
}) {
    const colorClass = color === 'fuchsia' ? 'bg-neon-pink' : 'bg-success'
    return (
        <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
        >
            <div
                className={cn(
                    'size-4 rounded-full ring-2 ring-white/30 shadow-lg',
                    colorClass,
                )}
                // Counter-scale so the marker stays a consistent size on
                // screen no matter how far we've zoomed in.
                style={{ transform: `scale(${1 / zoom})` }}
                aria-hidden
            />
            <span className="sr-only">{label}</span>
        </div>
    )
}

function Crosshair({ x, y, faint }: { x: number; y: number; faint?: boolean }) {
    const opacity = faint ? 'opacity-40' : 'opacity-80'
    return (
        <>
            <div
                className={cn('pointer-events-none absolute inset-y-0 w-px bg-white/50', opacity)}
                style={{ left: `${x * 100}%` }}
            />
            <div
                className={cn('pointer-events-none absolute inset-x-0 h-px bg-white/50', opacity)}
                style={{ top: `${y * 100}%` }}
            />
        </>
    )
}

function GuessLine({ from, to }: { from: GeoPoint; to: GeoPoint }) {
    return (
        <svg
            className="pointer-events-none absolute inset-0 size-full"
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
        >
            <line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="white"
                strokeWidth={0.004}
                strokeDasharray="0.012 0.008"
                vectorEffect="non-scaling-stroke"
                opacity={0.9}
            />
        </svg>
    )
}
