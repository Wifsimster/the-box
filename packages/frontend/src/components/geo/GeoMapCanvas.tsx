import { type MapCanvasProps } from './MapCanvas'
import { MapCanvasLeaflet } from './MapCanvasLeaflet'

// Component name is GeoMapCanvas (not GeoMap) to avoid colliding with the
// GeoMap type from @the-box/types.
export type { MapCanvasProps as GeoMapCanvasProps } from './MapCanvas'

export function GeoMapCanvas(props: MapCanvasProps) {
    return <MapCanvasLeaflet {...props} />
}
