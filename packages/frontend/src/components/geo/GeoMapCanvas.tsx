import type { MapCanvasProps } from './map-canvas-types'
import { MapCanvasLeaflet } from './MapCanvasLeaflet'

export type { MapCanvasProps as GeoMapCanvasProps } from './map-canvas-types'

export function GeoMapCanvas(props: MapCanvasProps) {
    return <MapCanvasLeaflet {...props} />
}
