import { type Ref } from 'react'
import type { GeoPoint } from '@the-box/types'
import { Crosshair, GuessLine, Marker } from './MapCanvasOverlays'

interface MapSurfaceProps {
    imageUrl: string
    zoom: number
    pan: { x: number; y: number }
    isPanning: boolean
    hover: GeoPoint | null
    kbCursor: GeoPoint | null
    pin?: GeoPoint | null
    canonical?: GeoPoint | null
    disabled?: boolean
    showGuessLine?: boolean
    youLabel: string
    actualLabel: string
    onImageError: () => void
    ref?: Ref<HTMLDivElement>
}

/**
 * The transformed inner frame of the map canvas. It carries the pan + zoom
 * transform; the image background and every normalized-coordinate overlay
 * live here so their math stays trivial — the inner div's bounding rect
 * already accounts for pan + zoom.
 */
export function MapSurface({
    imageUrl,
    zoom,
    pan,
    isPanning,
    hover,
    kbCursor,
    pin,
    canonical,
    disabled,
    showGuessLine,
    youLabel,
    actualLabel,
    onImageError,
    ref,
}: MapSurfaceProps) {
    return (
        <div
            ref={ref}
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
                onError={onImageError}
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
            {pin && !kbCursor && <Crosshair x={pin.x} y={pin.y} faint />}

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
                    label={youLabel}
                    zoom={zoom}
                />
            )}

            {/* Canonical (revealed) */}
            {canonical && (
                <Marker
                    x={canonical.x}
                    y={canonical.y}
                    color="emerald"
                    label={actualLabel}
                    zoom={zoom}
                />
            )}
        </div>
    )
}
