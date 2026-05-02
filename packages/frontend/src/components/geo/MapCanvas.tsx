import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { GeoPoint } from '@the-box/types'
import { cn } from '@/lib/utils'
import { clamp01, isPlaceholderImageUrl } from '@/lib/geo-image'
import { MapErrorFallback } from './MapErrorFallback'

export interface MapCanvasProps {
    imageUrl: string
    widthPx: number
    heightPx: number
    pin?: GeoPoint | null
    canonical?: GeoPoint | null // shown as a target when revealed
    onPin?: (p: GeoPoint) => void
    disabled?: boolean
    className?: string
    // When true, draws a guess → canonical connector. Only meaningful once
    // the guess has been revealed.
    showGuessLine?: boolean
}

/**
 * Click-to-pin map canvas. Coordinates are normalized to [0..1] so the
 * backend is decoupled from the actual image dimensions; a map asset swap
 * doesn't invalidate historical pins.
 *
 * Intentionally Leaflet-free for the MVP: a plain <img> + absolutely
 * positioned markers keeps the bundle small and works without an extra
 * dependency. Swap to Leaflet later if pan/zoom is needed.
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
    const [hover, setHover] = useState<GeoPoint | null>(null)
    // Keyboard cursor — visible only while the canvas has focus. Lets keyboard
    // users nudge a virtual crosshair with arrow keys and confirm with
    // Enter/Space, since clientX/clientY isn't available without a mouse.
    const [kbCursor, setKbCursor] = useState<GeoPoint | null>(null)
    // Treat known placeholder URLs as failed up-front: they "load" successfully
    // (placehold.co returns a real image) so onError would never fire.
    const [errored, setErrored] = useState(() => isPlaceholderImageUrl(imageUrl))

    useEffect(() => {
        setErrored(isPlaceholderImageUrl(imageUrl))
    }, [imageUrl])

    const handleClick = (e: MouseEvent<HTMLDivElement>) => {
        if (disabled || errored || !onPin) return
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return
        const x = clamp01((e.clientX - rect.left) / rect.width)
        const y = clamp01((e.clientY - rect.top) / rect.height)
        // Anchor the keyboard cursor to the click. Tapping focuses the canvas
        // (role=button, tabIndex=0), which fires handleFocus before the new
        // pin prop has propagated — without this sync the focus-seeded cursor
        // would land on the stale pin or the center default, leaving the
        // crosshair pinned to (0.5, 0.5) while the marker sits elsewhere.
        setKbCursor({ x, y })
        onPin({ x, y })
    }

    const handleMove = (e: MouseEvent<HTMLDivElement>) => {
        if (disabled || errored) return
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return
        setHover({
            x: clamp01((e.clientX - rect.left) / rect.width),
            y: clamp01((e.clientY - rect.top) / rect.height),
        })
    }

    const handleFocus = () => {
        if (disabled || errored) return
        // Seed the keyboard cursor from the existing pin (so re-focus picks up
        // where the player left off) or center it if there isn't one yet.
        setKbCursor((prev) => prev ?? pin ?? { x: 0.5, y: 0.5 })
    }

    const handleBlur = () => setKbCursor(null)

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (disabled || errored || !onPin) return
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

    const aspectRatio = widthPx > 0 && heightPx > 0 ? `${widthPx} / ${heightPx}` : '16 / 9'

    if (errored) {
        return <MapErrorFallback aspectRatio={aspectRatio} className={className} />
    }

    const interactive = !disabled && !!onPin
    const ariaLabel = interactive
        ? t('geo.map.ariaPin')
        : t('geo.map.ariaPinDisabled')

    return (
        <div
            ref={containerRef}
            onClick={handleClick}
            onMouseMove={handleMove}
            onMouseLeave={() => setHover(null)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            style={{ aspectRatio, backgroundImage: `url(${imageUrl})` }}
            className={cn(
                'relative w-full rounded-lg overflow-hidden bg-center bg-no-repeat bg-cover select-none',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                disabled ? 'cursor-default' : 'cursor-crosshair',
                className,
            )}
            role={interactive ? 'button' : 'img'}
            tabIndex={interactive ? 0 : -1}
            aria-label={ariaLabel}
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

            {/* Crosshair at hover position */}
            {!disabled && hover && !kbCursor && (
                <Crosshair x={hover.x} y={hover.y} faint />
            )}

            {/* Keyboard cursor — solid (not faint) so it's distinguishable
                from the mouse-hover crosshair. */}
            {kbCursor && <Crosshair x={kbCursor.x} y={kbCursor.y} />}

            {/* Pin axis guide — when no hover/keyboard crosshair is active,
                draw faint X/Y lines through the placed pin so the operator
                can read its coordinates at a glance instead of seeing the
                axis stuck at the canvas center. */}
            {pin && !hover && !kbCursor && (
                <Crosshair x={pin.x} y={pin.y} faint />
            )}

            {/* Guess → canonical line */}
            {showGuessLine && pin && canonical && (
                <GuessLine from={pin} to={canonical} />
            )}

            {/* User pin */}
            {pin && (
                <Marker
                    x={pin.x}
                    y={pin.y}
                    color="fuchsia"
                    label={t('geo.map.labelYou')}
                />
            )}

            {/* Canonical (revealed) */}
            {canonical && (
                <Marker
                    x={canonical.x}
                    y={canonical.y}
                    color="emerald"
                    label={t('geo.map.labelActual')}
                />
            )}
        </div>
    )
}

function Marker({
    x,
    y,
    color,
    label,
}: {
    x: number
    y: number
    color: 'fuchsia' | 'emerald'
    label: string
}) {
    const colorClass = color === 'fuchsia' ? 'bg-neon-pink' : 'bg-success'
    return (
        <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
        >
            <div
                className={cn(
                    'h-4 w-4 rounded-full ring-2 ring-white/30 shadow-lg',
                    colorClass,
                )}
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
            className="pointer-events-none absolute inset-0 h-full w-full"
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

