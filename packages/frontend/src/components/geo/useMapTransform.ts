import { useCallback, useReducer, type RefObject } from 'react'

export const MIN_ZOOM = 1
export const MAX_ZOOM = 6
export const ZOOM_STEP = 1.4

interface Pan {
    x: number
    y: number
}

interface TransformState {
    zoom: number
    pan: Pan
    isPanning: boolean
}

type TransformAction =
    | { type: 'reset' }
    | { type: 'setView'; zoom: number; pan: Pan }
    | { type: 'setZoom'; zoom: number }
    | { type: 'pan'; pan: Pan }
    | { type: 'panStart' }
    | { type: 'panEnd' }

const INITIAL_TRANSFORM: TransformState = {
    zoom: 1,
    pan: { x: 0, y: 0 },
    isPanning: false,
}

function transformReducer(
    state: TransformState,
    action: TransformAction,
): TransformState {
    switch (action.type) {
        case 'reset':
            return { ...state, zoom: 1, pan: { x: 0, y: 0 } }
        case 'setView':
            return { ...state, zoom: action.zoom, pan: action.pan }
        case 'setZoom':
            return { ...state, zoom: action.zoom }
        case 'pan':
            return { ...state, pan: action.pan }
        case 'panStart':
            return { ...state, isPanning: true }
        case 'panEnd':
            return { ...state, isPanning: false }
    }
}

export interface MapTransform {
    zoom: number
    pan: Pan
    isPanning: boolean
    /** Reset zoom + pan to their defaults (used when the map asset changes). */
    resetView: () => void
    clampPan: (x: number, y: number, z: number) => Pan
    applyZoom: (next: number, focal?: { clientX: number; clientY: number }) => void
    setPan: (pan: Pan) => void
    startPanning: () => void
    stopPanning: () => void
}

/**
 * Encapsulates the zoom/pan/isPanning view transform for the DIY map canvas.
 * Bundled as a single reducer because the three values move together (a zoom
 * change reclamps pan, a drag flips isPanning then writes pan) — keeping them
 * in one place makes those transitions atomic and testable.
 */
export function useMapTransform(
    containerRef: RefObject<HTMLElement | null>,
): MapTransform {
    const [state, dispatch] = useReducer(transformReducer, INITIAL_TRANSFORM)
    const { zoom, pan, isPanning } = state

    const clampPan = useCallback(
        (x: number, y: number, z: number): Pan => {
            const rect = containerRef.current?.getBoundingClientRect()
            if (!rect) return { x: 0, y: 0 }
            // transform-origin is center: at scale z, the inner div extends
            // (z-1)*size/2 past each edge. Clamp pan so we don't drift past
            // the image's corners.
            const slackX = ((z - 1) * rect.width) / 2
            const slackY = ((z - 1) * rect.height) / 2
            return {
                x: Math.max(-slackX, Math.min(slackX, x)),
                y: Math.max(-slackY, Math.min(slackY, y)),
            }
        },
        [containerRef],
    )

    const applyZoom = useCallback(
        (next: number, focal?: { clientX: number; clientY: number }) => {
            const rect = containerRef.current?.getBoundingClientRect()
            const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next))
            if (z <= 1) {
                dispatch({ type: 'setView', zoom: 1, pan: { x: 0, y: 0 } })
                return
            }
            if (!rect) {
                dispatch({ type: 'setZoom', zoom: z })
                return
            }
            // Zoom toward the focal point by keeping the image-space coord
            // under the cursor fixed across the zoom change.
            if (focal) {
                const cx = focal.clientX - rect.left - rect.width / 2
                const cy = focal.clientY - rect.top - rect.height / 2
                const imageX = (cx - pan.x) / zoom
                const imageY = (cy - pan.y) / zoom
                const newPanX = cx - imageX * z
                const newPanY = cy - imageY * z
                dispatch({ type: 'setView', zoom: z, pan: clampPan(newPanX, newPanY, z) })
            } else {
                dispatch({ type: 'setView', zoom: z, pan: clampPan(pan.x, pan.y, z) })
            }
        },
        [containerRef, zoom, pan, clampPan],
    )

    const resetView = useCallback(() => dispatch({ type: 'reset' }), [])
    const setPan = useCallback((next: Pan) => dispatch({ type: 'pan', pan: next }), [])
    const startPanning = useCallback(() => dispatch({ type: 'panStart' }), [])
    const stopPanning = useCallback(() => dispatch({ type: 'panEnd' }), [])

    return {
        zoom,
        pan,
        isPanning,
        resetView,
        clampPan,
        applyZoom,
        setPan,
        startPanning,
        stopPanning,
    }
}
