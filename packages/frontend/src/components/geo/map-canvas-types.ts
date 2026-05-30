import type { GeoMapTilesConfig, GeoPoint } from '@the-box/types'

/**
 * Shared props for the geo map canvas. The active renderer is
 * {@link MapCanvasLeaflet}; this type lives in its own module so consumers can
 * import it without pulling in a component implementation.
 */
export interface MapCanvasProps {
    imageUrl: string
    widthPx: number
    heightPx: number
    // Optional tile source. Honored by MapCanvasLeaflet; falls back to the
    // imageUrl thumbnail otherwise. Pages set VITE_GEO_USE_LEAFLET=true for
    // tile games.
    tiles?: GeoMapTilesConfig
    pin?: GeoPoint | null
    canonical?: GeoPoint | null // shown as a target when revealed
    onPin?: (p: GeoPoint) => void
    disabled?: boolean
    className?: string
    // When true, draws a guess → canonical connector. Only meaningful once the
    // guess has been revealed.
    showGuessLine?: boolean
}
