import { type MouseEvent } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import type { GeoPoint } from '@the-box/types'
import { cn } from '@/lib/utils'
import { MAX_ZOOM, MIN_ZOOM } from './useMapTransform'

// Stop propagation so button clicks don't bubble up to the canvas's
// click-to-pin handler. Hoisted to module scope: it closes over nothing
// local, so reallocating it per render would be pure waste.
const withStopPropagation =
    (cb: () => void) => (e: MouseEvent) => {
        e.stopPropagation()
        cb()
    }

export function ZoomControls({
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
    const baseBtn =
        'flex size-8 items-center justify-center rounded-md bg-background/80 text-foreground backdrop-blur-sm shadow-md ring-1 ring-border hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
    return (
        <div className="absolute right-2 top-2 z-10 flex flex-col gap-1">
            <button
                type="button"
                aria-label={labels.in}
                title={labels.in}
                onClick={withStopPropagation(onZoomIn)}
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
                onClick={withStopPropagation(onZoomOut)}
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
                onClick={withStopPropagation(onZoomReset)}
                onPointerDown={(e) => e.stopPropagation()}
                disabled={zoom === 1}
                className={baseBtn}
            >
                <RotateCcw className="size-4" aria-hidden />
            </button>
        </div>
    )
}

export function Marker({
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

export function Crosshair({ x, y, faint }: { x: number; y: number; faint?: boolean }) {
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

export function GuessLine({ from, to }: { from: GeoPoint; to: GeoPoint }) {
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
