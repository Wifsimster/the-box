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
// in src/index.css so this stays in sync with the rest of the UI. The
// fuchsia variant carries `geo-map-marker-pop` so the player's pin
// animates in on placement (CSS keyframe in index.css, gated on
// prefers-reduced-motion). The emerald canonical marker is intentionally
// static — it appears at round-end and shouldn't compete with the result
// overlay for attention.
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
    // <img> in addition to the proactive placeholder check. For tile maps,
    // the thumbnail probe is decorative — TileLayer handles its own errors.
    const [errored, setErrored] = useState(() => isPlaceholderImageUrl(imageUrl))

    useEffect(() => {
        setErrored(isPlaceholderImageUrl(imageUrl))
    }, [imageUrl])

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
        // `isolate` (CSS isolation) opens a fresh stacking context so
        // Leaflet's baked-in z-indexes on `.leaflet-pane` (200-700) and
        // `.leaflet-control` (800-1000) stay scoped to this container.
        // Without it, the +/- zoom controls and tile layers paint over
        // any Radix Sheet/Dialog (z-50) that opens above the page.
        <div
            className={cn('relative isolate w-full overflow-hidden rounded-lg', className)}
            style={{ aspectRatio: `${widthPx} / ${heightPx}`, zIndex: 0 }}
        >
            {!tiles && (
                <img
                    src={imageUrl}
                    alt=""
                    className="hidden"
                    onError={() => setErrored(true)}
                    aria-hidden
                />
            )}
            <MapContainer
                crs={CRS.Simple}
                bounds={bounds}
                maxBounds={bounds}
                attributionControl={false}
                // Default top-left collides with the panel's "Map" badge at
                // left-3 top-3 (see ImmersiveLayout). Anchor the +/- pair
                // bottom-right so it stays reachable on mobile (right thumb)
                // and clear of the FullscreenToggle in the deck's top-right.
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
                                      // Drag-to-refine: after the initial
                                      // tap-drop, the player can slide the
                                      // pin into a better spot without
                                      // re-aiming.
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
                    <Polyline
                        positions={[pinLatLng, canonicalLatLng]}
                        pathOptions={{ color: 'var(--foreground)', weight: 2, dashArray: '6 4', opacity: 0.9 }}
                    />
                )}
            </MapContainer>
        </div>
    )
}

// Renders a Leaflet tile pyramid using a custom L.TileLayer subclass so we
// can express schemes that the standard {z}/{x}/{y} template can't (zero-pad,
// inverted z). The world rectangle in CRS.Simple stays [0..heightPx,widthPx]
// so click→[0..1] math is identical to the ImageOverlay path.
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
    // Depend on the *shallow scalar* tile config so a parent re-rendering
    // with a fresh `tiles` object literal (same values, new identity)
    // doesn't tear down and rebuild the entire layer — that triggers a
    // full tile re-fetch on every parent state change. The `getTileUrl`
    // closure still reads from the captured `tiles`, which is fine
    // because the values it reads (scheme, urlTemplate, min/maxZoom)
    // are exactly the deps we list.
    const { scheme, urlTemplate, tileSize, minZoom, maxZoom } = tiles
    useEffect(() => {
        const TemplatedTileLayer = L.TileLayer.extend({
            getTileUrl(coords: { x: number; y: number; z: number }) {
                return formatTileUrl(tiles, coords.z, coords.x, coords.y)
            },
        })
        const layer = new (TemplatedTileLayer as unknown as new (
            urlTemplate: string,
            opts: L.TileLayerOptions,
        ) => L.TileLayer)(urlTemplate, {
            tileSize,
            minZoom,
            maxZoom,
            // Clamp tile requests to the world rectangle so OOB tiles (e.g.
            // the asymmetric 85x69 grid in WoW) don't 404-spam.
            bounds: [
                [0, 0],
                [heightPx, widthPx],
            ],
            noWrap: true,
            // Decorative placeholder for missing tiles — Leaflet's default
            // is a transparent gap that looks like a successful load.
            errorTileUrl:
                'data:image/svg+xml;utf8,' +
                encodeURIComponent(
                    // Text contrast bumped from #555 (~3:1 on #111) to
                    // #999 (~7:1) to clear WCAG 1.4.11 for informational
                    // text. The label is sub-fold rare, but readable
                    // when it does appear.
                    '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="%23111" /><text x="50%" y="50%" fill="%23999" font-family="sans-serif" font-size="14" text-anchor="middle" dominant-baseline="central">tile missing</text></svg>',
                ),
        })
        layer.addTo(map)
        return () => {
            layer.remove()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `tiles` is read via the captured closure but is identity-equivalent to the listed scalar fields; using the object directly would tear down the layer on every parent re-render.
    }, [map, scheme, urlTemplate, tileSize, minZoom, maxZoom, widthPx, heightPx])
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

