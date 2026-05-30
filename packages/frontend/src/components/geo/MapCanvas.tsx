import {
    useRef,
    useState,
    type KeyboardEvent,
    type MouseEvent,
    type PointerEvent,
    type WheelEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import type { GeoMapTilesConfig, GeoPoint } from '@the-box/types'
import { cn } from '@/lib/utils'
import { clamp01, isPlaceholderImageUrl } from '@/lib/geo-image'
import { MapErrorFallback } from './MapErrorFallback'
import { ZoomControls } from './MapCanvasOverlays'
import { MapSurface } from './MapSurface'
import { useMapTransform, ZOOM_STEP } from './useMapTransform'

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

// A pointer that travels more than this many pixels between down and up is
// treated as a pan gesture, not a click — so a small jitter doesn't drop a
// pin in the wrong spot.
const DRAG_THRESHOLD_PX = 5

/**
 * Click-to-pin map canvas with zoom (mouse wheel + buttons) and pan (drag).
 * Coordinates are normalized to [0..1] so the backend is decoupled from
 * actual image dimensions; a map asset swap doesn't invalidate historical pins.
 */
/**
 * Keying the stateful body on `imageUrl` lets React remount it on a map swap,
 * which resets zoom/pan/error/cursor to their initializers for free — no
 * previous-URL tracker or render-time state adjustment needed (the pattern
 * react-doctor's no-derived-useState recommends).
 */
export function MapCanvas(props: MapCanvasProps) {
    return <MapCanvasInner key={props.imageUrl} {...props} />
}

function MapCanvasInner({
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
    const containerRef = useRef<HTMLButtonElement>(null)
    const innerRef = useRef<HTMLDivElement>(null)
    const [hover, setHover] = useState<GeoPoint | null>(null)
    // Keyboard cursor — visible only while the canvas has focus. Lets keyboard
    // users nudge a virtual crosshair with arrow keys and confirm with
    // Enter/Space, since clientX/clientY isn't available without a mouse.
    const [kbCursor, setKbCursor] = useState<GeoPoint | null>(null)
    // Treat known placeholder URLs as failed up-front: they "load" successfully
    // (placehold.co returns a real image) so onError would never fire. Only the
    // probe failure is stored; the placeholder verdict is derived during render
    // so a remount (keyed by imageUrl) re-evaluates it with no bookkeeping.
    const [probeFailed, setProbeFailed] = useState(false)
    const errored = isPlaceholderImageUrl(imageUrl) || probeFailed

    const { zoom, pan, isPanning, clampPan, applyZoom, setPan, startPanning, stopPanning } =
        useMapTransform(containerRef)

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

    const placePinAtPointer = (e: MouseEvent<HTMLButtonElement>) => {
        if (suppressClickRef.current) {
            suppressClickRef.current = false
            return
        }
        if (disabled || errored || !onPin) return
        const p = normalizeFromEvent(e.clientX, e.clientY)
        if (!p) return
        // Anchor the keyboard cursor to the click. Tapping focuses the canvas
        // (role=button, tabIndex=0), which fires seedKeyboardCursor before the
        // new pin prop has propagated — without this sync the focus-seeded
        // cursor would land on the stale pin or the center default.
        setKbCursor(p)
        onPin(p)
    }

    const trackHover = (e: MouseEvent<HTMLButtonElement>) => {
        if (errored) return
        const p = normalizeFromEvent(e.clientX, e.clientY)
        if (!p) return
        setHover(p)
    }

    const seedKeyboardCursor = () => {
        if (disabled || errored) return
        // Seed the keyboard cursor from the existing pin (so re-focus picks up
        // where the player left off) or center it if there isn't one yet.
        setKbCursor((prev) => prev ?? pin ?? { x: 0.5, y: 0.5 })
    }

    const clearKeyboardCursor = () => setKbCursor(null)

    const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
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

    const handleWheel = (e: WheelEvent<HTMLButtonElement>) => {
        if (errored) return
        // Don't preventDefault — React passes a passive listener for wheel,
        // which makes preventDefault a no-op. We avoid scroll capture by
        // reserving wheel zoom for the case when the user is already
        // hovering the map (which they are, since this is onWheel on the
        // container) and applying a moderate factor.
        const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
        applyZoom(zoom * factor, { clientX: e.clientX, clientY: e.clientY })
    }

    const handlePointerDown = (e: PointerEvent<HTMLButtonElement>) => {
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

    const handlePointerMove = (e: PointerEvent<HTMLButtonElement>) => {
        const d = dragRef.current
        if (!d || d.pointerId !== e.pointerId) return
        const dx = e.clientX - d.startClientX
        const dy = e.clientY - d.startClientY
        if (!d.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
            d.moved = true
            startPanning()
        }
        if (d.moved) {
            setPan(clampPan(d.startPanX + dx, d.startPanY + dy, zoom))
        }
    }

    const endDrag = (e: PointerEvent<HTMLButtonElement>) => {
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
        stopPanning()
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
        // Positioning wrapper only — no interactive handlers, so the
        // ZoomControls buttons can sit as siblings of (not nested inside) the
        // interactive canvas button below. Native buttons may not contain
        // other interactive elements, so the zoom controls live here instead.
        <div
            className={cn('relative w-full', className)}
            style={{ aspectRatio }}
        >
            {/* The map surface is a real <button>: it's keyboard-focusable and
                arrow/+/-/0 driven, with native Enter/Space handled (and
                prevented) in handleKeyDown so it never double-fires a click.
                `aria-disabled` (not the `disabled` attribute) keeps it
                focusable for zoom inspection in the revealed/disabled state. */}
            <button
                ref={containerRef}
                type="button"
                onClick={placePinAtPointer}
                onMouseMove={trackHover}
                onMouseLeave={() => setHover(null)}
                onFocus={seedKeyboardCursor}
                onBlur={clearKeyboardCursor}
                onKeyDown={handleKeyDown}
                onWheel={handleWheel}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                aria-disabled={!interactive}
                aria-label={ariaLabel}
                className={cn(
                    'absolute inset-0 block w-full rounded-lg overflow-hidden bg-background select-none touch-none text-left',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    cursorClass,
                )}
            >
                <MapSurface
                    ref={innerRef}
                    imageUrl={imageUrl}
                    zoom={zoom}
                    pan={pan}
                    isPanning={isPanning}
                    hover={hover}
                    kbCursor={kbCursor}
                    pin={pin}
                    canonical={canonical}
                    disabled={disabled}
                    showGuessLine={showGuessLine}
                    youLabel={t('geo.map.labelYou')}
                    actualLabel={t('geo.map.labelActual')}
                    onImageError={() => setProbeFailed(true)}
                />
            </button>

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
