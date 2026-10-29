import { useEffect, useMemo, useState } from 'react'
import {
    ImageOverlay,
    MapContainer,
    Marker,
    Polyline,
    useMap,
    useMapEvents,
    ZoomControl,
} from 'react-leaflet'
import L, { CRS, type LatLngBoundsExpression, type LatLngExpression } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { GeoMapTilesConfig, GeoPoint } from '@the-box/types'
import { cn } from '@/lib/utils'
import { clamp01, isPlaceholderImageUrl } from '@/lib/geo-image'
import { formatTileUrl } from '@/lib/geo-tile-url'
import { MapErrorFallback } from './MapErrorFallback'
import type { MapCanvasProps } from './map-canvas-types'

const FUCHSIA_DIVICON = createDiv('fuchsia')
const EMERALD_DIVICON = createDiv('emerald')

function createDiv(color: 'fuchsia' | 'emerald'): L.DivIcon {
    const fill = color === 'fuchsia' ? 'var(--neon-pink)' : 'var(--success)'
    const className =
        color === 'fuchsia' ? 'geo-map-marker geo-map-marker-pop' : 'geo-map-marker'
    return L.divIcon({
        className,
        html: `<span style="display:block;width:16px;height:16px;border-radius:9999px;background:${fill};box-shadow:var(--glow-md);"></span>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
    })
}

export function MapCanvasLeaflet({
    imageUrl,
    widthPx,
    heightPx,
    tiles,
    pin,
    canonical,
    onPin,
    disabled,
    className,
    showGuessLine,
}: MapCanvasProps) {
    const bounds: LatLngBoundsExpression = useMemo(
        () => [
            [0, 0],
            [heightPx, widthPx],
        ],
        [widthPx, heightPx],
    )

    const [failedUrl, setFailedUrl] = useState<string | null>(null)
    const errored = isPlaceholderImageUrl(imageUrl) || failedUrl === imageUrl

    const pinLatLng = pointToLatLng(pin, widthPx, heightPx)
    const canonicalLatLng = pointToLatLng(canonical, widthPx, heightPx)

    if (errored) {
        return (
            <MapErrorFallback
                aspectRatio={`${widthPx} / ${heightPx}`}
                className={className}
            />
        )
    }

    return (
        <div
            className={cn(
                'relative isolate w-full overflow-hidden rounded-lg',
                'pointer-coarse:[&_.leaflet-bar_a]:!size-11 pointer-coarse:[&_.leaflet-bar_a]:!text-2xl pointer-coarse:[&_.leaflet-bar_a]:!leading-[44px]',
                className,
            )}
            style={{ aspectRatio: `${widthPx} / ${heightPx}`, zIndex: 0 }}
        >
            {!tiles && (
                <img
                    src={imageUrl}
                    alt=""
                    className="hidden"
                    onError={() => setFailedUrl(imageUrl)}
                    aria-hidden
                />
            )}
            <MapContainer
                crs={CRS.Simple}
                bounds={bounds}
                maxBounds={bounds}
                attributionControl={false}
                zoomControl={false}
                scrollWheelZoom
                doubleClickZoom={false}
                bounceAtZoomLimits={false}
                touchZoom
                zoomSnap={0.5}
                zoomDelta={0.5}
                keyboard
                keyboardPanDelta={50}
                style={{ height: '100%', width: '100%', background: 'var(--background)' }}
            >
                <ZoomControl position="bottomright" />
                <AutoInvalidateSize />
                {tiles ? (
                    <TilePyramidLayer
                        tiles={tiles}
                        widthPx={widthPx}
                        heightPx={heightPx}
                    />
                ) : (
                    <ImageOverlay url={imageUrl} bounds={bounds} />
                )}
                {!disabled && onPin && (
                    <ClickHandler
                        widthPx={widthPx}
                        heightPx={heightPx}
                        onPick={(p) => onPin(p)}
                    />
                )}
                {pinLatLng && (
                    <Marker
                        position={pinLatLng}
                        icon={FUCHSIA_DIVICON}
                        draggable={!disabled && !!onPin}
                        eventHandlers={
                            !disabled && onPin
                                ? {
                                      dragend: (e) => {
                                          const { lat, lng } = (e.target as L.Marker).getLatLng()
                                          onPin({
                                              x: clamp01(lng / widthPx),
                                              y: clamp01(lat / heightPx),
                                          })
                                      },
                                  }
                                : undefined
                        }
                    />
                )}
                {canonicalLatLng && (
                    <Marker position={canonicalLatLng} icon={EMERALD_DIVICON} />
                )}
                {showGuessLine && pinLatLng && canonicalLatLng && (
                    <>
                        <Polyline
                            positions={[pinLatLng, canonicalLatLng]}
                            pathOptions={{ color: 'var(--foreground)', weight: 2, dashArray: '6 4', opacity: 0.9 }}
                        />
                        <RevealFocus
                            guess={pinLatLng}
                            canonical={canonicalLatLng}
                            worldBounds={bounds}
                        />
                    </>
                )}
            </MapContainer>
        </div>
    )
}

function TilePyramidLayer({
    tiles,
    widthPx,
    heightPx,
}: {
    tiles: GeoMapTilesConfig
    widthPx: number
    heightPx: number
}) {
    const map = useMap()
    const { scheme, urlTemplate, tileSize, minZoom, maxZoom } = tiles
    useEffect(() => {
        const tileConfig = {
            scheme,
            urlTemplate,
            tileSize,
            minZoom,
            maxZoom,
        } as GeoMapTilesConfig
        const TemplatedTileLayer = L.TileLayer.extend({
            getTileUrl(coords: { x: number; y: number; z: number }) {
                return formatTileUrl(tileConfig, coords.z, coords.x, coords.y)
            },
        })
        const layer = new (TemplatedTileLayer as unknown as new (
            urlTemplate: string,
            opts: L.TileLayerOptions,
        ) => L.TileLayer)(urlTemplate, {
            tileSize,
            minZoom,
            maxZoom,
            bounds: [
                [0, 0],
                [heightPx, widthPx],
            ],
            noWrap: true,
            errorTileUrl:
                'data:image/svg+xml;utf8,' +
                encodeURIComponent(
                    '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="%23111" /><text x="50%" y="50%" fill="%23999" font-family="sans-serif" font-size="14" text-anchor="middle" dominant-baseline="central">tile missing</text></svg>',
                ),
        })
        layer.addTo(map)
        return () => {
            layer.remove()
        }
    }, [map, scheme, urlTemplate, tileSize, minZoom, maxZoom, widthPx, heightPx])
    return null
}

function AutoInvalidateSize() {
    const map = useMap()
    useEffect(() => {
        const container = map.getContainer()
        const observer = new ResizeObserver(() => {
            map.invalidateSize({ pan: false })
        })
        observer.observe(container)
        return () => observer.disconnect()
    }, [map])
    return null
}

function RevealFocus({
    guess,
    canonical,
    worldBounds,
}: {
    guess: LatLngExpression
    canonical: LatLngExpression
    worldBounds: LatLngBoundsExpression
}) {
    const map = useMap()
    const [gLat, gLng] = guess as [number, number]
    const [cLat, cLng] = canonical as [number, number]
    useEffect(() => {
        const animate = !window.matchMedia?.('(prefers-reduced-motion: reduce)')
            .matches
        map.fitBounds(L.latLngBounds([gLat, gLng], [cLat, cLng]), {
            padding: [48, 48],
            maxZoom: map.getZoom() + 3,
            animate,
        })
        return () => {
            const container = map.getContainer?.()
            if (!container || !container.isConnected) return
            try {
                map.fitBounds(worldBounds, { animate: false })
            } catch {
            }
        }
    }, [map, gLat, gLng, cLat, cLng, worldBounds])
    return null
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

