import { MapCanvas, type MapCanvasProps } from './MapCanvas'
import { MapCanvasLeaflet } from './MapCanvasLeaflet'

// Pick the renderer at build time via a Vite flag so the Leaflet bundle
// (~45 KB gz) stays out of the default build. Callers all go through this
// barrel so future swaps don't touch page code.
const USE_LEAFLET = import.meta.env.VITE_GEO_USE_LEAFLET === 'true'

// Component name is GeoMapCanvas (not GeoMap) to avoid colliding with the
// GeoMap type from @the-box/types.
export type { MapCanvasProps as GeoMapCanvasProps } from './MapCanvas'

export function GeoMapCanvas(props: MapCanvasProps) {
    return USE_LEAFLET ? <MapCanvasLeaflet {...props} /> : <MapCanvas {...props} />
}
