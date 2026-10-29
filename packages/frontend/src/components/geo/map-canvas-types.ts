import type { GeoMapTilesConfig, GeoPoint } from '@the-box/types'

export interface MapCanvasProps {
    imageUrl: string
    widthPx: number
    heightPx: number
    tiles?: GeoMapTilesConfig
    pin?: GeoPoint | null
    canonical?: GeoPoint | null
    onPin?: (p: GeoPoint) => void
    disabled?: boolean
    className?: string
    showGuessLine?: boolean
}
