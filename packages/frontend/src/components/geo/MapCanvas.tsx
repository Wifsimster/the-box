import { useRef, useState, type MouseEvent } from 'react'
import type { GeoPoint } from '@the-box/types'
import { cn } from '@/lib/utils'

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
    const containerRef = useRef<HTMLDivElement>(null)
    const [hover, setHover] = useState<GeoPoint | null>(null)

    const handleClick = (e: MouseEvent<HTMLDivElement>) => {
        if (disabled || !onPin) return
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return
        const x = (e.clientX - rect.left) / rect.width
        const y = (e.clientY - rect.top) / rect.height
        onPin({
            x: clamp01(x),
            y: clamp01(y),
        })
    }

    const handleMove = (e: MouseEvent<HTMLDivElement>) => {
        if (disabled) return
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return
        setHover({
            x: clamp01((e.clientX - rect.left) / rect.width),
            y: clamp01((e.clientY - rect.top) / rect.height),
        })
    }

    const aspectRatio = widthPx > 0 && heightPx > 0 ? `${widthPx} / ${heightPx}` : '16 / 9'

    return (
        <div
            ref={containerRef}
            onClick={handleClick}
            onMouseMove={handleMove}
            onMouseLeave={() => setHover(null)}
            style={{ aspectRatio, backgroundImage: `url(${imageUrl})` }}
            className={cn(
                'relative w-full rounded-lg overflow-hidden bg-center bg-no-repeat bg-cover select-none',
                disabled ? 'cursor-default' : 'cursor-crosshair',
                className,
            )}
            role={disabled ? 'img' : 'button'}
            aria-label="Pin location on the map"
        >
            {/* Crosshair at hover position */}
            {!disabled && hover && (
                <Crosshair x={hover.x} y={hover.y} faint />
            )}

            {/* Guess → canonical line */}
            {showGuessLine && pin && canonical && (
                <GuessLine from={pin} to={canonical} />
            )}

            {/* User pin */}
            {pin && <Marker x={pin.x} y={pin.y} color="fuchsia" label="You" />}

            {/* Canonical (revealed) */}
            {canonical && (
                <Marker x={canonical.x} y={canonical.y} color="emerald" label="Actual" />
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
    const colorClass =
        color === 'fuchsia'
            ? 'bg-fuchsia-500 ring-fuchsia-300 shadow-fuchsia-500/50'
            : 'bg-emerald-500 ring-emerald-300 shadow-emerald-500/50'
    return (
        <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
        >
            <div
                className={cn(
                    'h-4 w-4 rounded-full ring-2 shadow-lg',
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

function clamp01(n: number): number {
    if (Number.isNaN(n)) return 0
    return Math.max(0, Math.min(1, n))
}
