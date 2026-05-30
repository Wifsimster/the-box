import type { MapCanvasProps } from './map-canvas-types'
import { MapCanvasLeaflet } from './MapCanvasLeaflet'

// Component name is GeoMapCanvas (not GeoMap) to avoid colliding with the
// GeoMap type from @the-box/types.
export type { MapCanvasProps as GeoMapCanvasProps } from './map-canvas-types'

export function GeoMapCanvas(props: MapCanvasProps) {
    return <MapCanvasLeaflet {...props} />
}
