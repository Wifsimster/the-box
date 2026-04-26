import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ImageOverlay,
    MapContainer,
    Marker,
    Polyline,
    useMapEvents,
} from 'react-leaflet'
import L, { CRS, type LatLngBoundsExpression, type LatLngExpression } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ImageOff } from 'lucide-react'
import type { GeoPoint } from '@the-box/types'
import { cn } from '@/lib/utils'
import { isPlaceholderImageUrl } from '@/lib/geo-image'
import type { MapCanvasProps } from './MapCanvas'

// Leaflet-based map canvas. Same public API as MapCanvas so the pages are
// drop-in compatible. Uses CRS.Simple (no real-world projection) and an
// ImageOverlay sized by map dimensions so pan/zoom works naturally.
//
// Coordinates in the public API are still normalized [0..1]. We convert
// to pixel (or image) space for Leaflet and back on click.

const FUCHSIA_DIVICON = createDiv('fuchsia')
const EMERALD_DIVICON = createDiv('emerald')

// Colors + box-shadow are sourced from the design tokens exposed on :root
// in src/index.css so this stays in sync with the rest of the UI.
function createDiv(color: 'fuchsia' | 'emerald'): L.DivIcon {
    const fill = color === 'fuchsia' ? 'var(--neon-pink)' : 'var(--success)'
    return L.divIcon({
        className: 'geo-map-marker',
        html: `<span style="display:block;width:16px;height:16px;border-radius:9999px;background:${fill};box-shadow:var(--glow-md);"></span>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
    })
}

export function MapCanvasLeaflet({
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
    // CRS.Simple: y=0 at top, +y downward in our normalized space; Leaflet's
    // default Simple CRS has +y upward. Flip y at the conversion boundary.
    const bounds: LatLngBoundsExpression = useMemo(
        () => [
            [0, 0],
            [heightPx, widthPx],
        ],
        [widthPx, heightPx],
    )

    // See MapCanvas.tsx for the rationale: placeholder URLs may load OK, real
    // 404s won't surface through Leaflet's ImageOverlay, so probe with a hidden
    // <img> in addition to the proactive placeholder check.
    const [errored, setErrored] = useState(() => isPlaceholderImageUrl(imageUrl))

    useEffect(() => {
        setErrored(isPlaceholderImageUrl(imageUrl))
    }, [imageUrl])

    const pinLatLng = pointToLatLng(pin, widthPx, heightPx)
    const canonicalLatLng = pointToLatLng(canonical, widthPx, heightPx)

    if (errored) {
        return (
            <div
                className={cn(
                    'relative w-full rounded-lg border border-dashed bg-muted/30 flex flex-col items-center justify-center gap-2 px-4 text-center text-xs text-muted-foreground',
                    className,
                )}
                style={{ aspectRatio: `${widthPx} / ${heightPx}` }}
                role="img"
                aria-label={t('geo.daily.mapUnavailable', 'Map unavailable')}
            >
                <ImageOff className="h-6 w-6 opacity-60" aria-hidden />
                <span>{t('geo.daily.mapUnavailable', 'Map unavailable')}</span>
            </div>
        )
    }

    return (
        <div
            className={cn('w-full overflow-hidden rounded-lg', className)}
            style={{ aspectRatio: `${widthPx} / ${heightPx}` }}
        >
            <img
                src={imageUrl}
                alt=""
                className="hidden"
                onError={() => setErrored(true)}
                aria-hidden
            />
            <MapContainer
                crs={CRS.Simple}
                bounds={bounds}
                maxBounds={bounds}
                attributionControl={false}
                zoomControl={!disabled}
                scrollWheelZoom={!disabled}
                doubleClickZoom={false}
                style={{ height: '100%', width: '100%', background: 'var(--background)' }}
            >
                <ImageOverlay url={imageUrl} bounds={bounds} />
                {!disabled && onPin && (
                    <ClickHandler
                        widthPx={widthPx}
                        heightPx={heightPx}
                        onPick={(p) => onPin(p)}
                    />
                )}
                {pinLatLng && <Marker position={pinLatLng} icon={FUCHSIA_DIVICON} />}
                {canonicalLatLng && (
                    <Marker position={canonicalLatLng} icon={EMERALD_DIVICON} />
                )}
                {showGuessLine && pinLatLng && canonicalLatLng && (
                    <Polyline
                        positions={[pinLatLng, canonicalLatLng]}
                        pathOptions={{ color: 'var(--foreground)', weight: 2, dashArray: '6 4', opacity: 0.9 }}
                    />
                )}
            </MapContainer>
        </div>
    )
}

function ClickHandler({
    widthPx,
    heightPx,
    onPick,
}: {
    widthPx: number
    heightPx: number
    onPick: (p: GeoPoint) => void
}) {
    useMapEvents({
        click(e) {
            const { lat, lng } = e.latlng
            // Leaflet's Simple CRS has y increasing upward, but our image
            // bounds were declared with lat=[0..heightPx] where lat=0 is the
            // image's top-left corner (no flip, since ImageOverlay respects
            // the bounds literally). Normalize both axes to [0..1].
            const y = clamp01(lat / heightPx)
            const x = clamp01(lng / widthPx)
            onPick({ x, y })
        },
    })
    return null
}

function pointToLatLng(
    p: GeoPoint | null | undefined,
    widthPx: number,
    heightPx: number,
): LatLngExpression | null {
    if (!p) return null
    return [p.y * heightPx, p.x * widthPx]
}

function clamp01(n: number): number {
    if (Number.isNaN(n)) return 0
    return Math.max(0, Math.min(1, n))
}
