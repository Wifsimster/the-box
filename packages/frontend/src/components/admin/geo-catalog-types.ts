// Shared types + state reducers for the Geo catalog (GeoMapsTab + useGeoCatalog).
import type { AddMapStrategy } from './AddMapDialog'

export interface CuratedGame {
    id: number
    name: string
    slug: string
    metadataStatus: 'pending' | 'resolved' | 'unresolved'
    hasMap: boolean
    mapCount: number
    candidateCount: number
}

// Unified row shape used by the table. `curated` is the discriminator —
// when false, the map/candidate counts are not returned by the backend.
export interface CatalogRow {
    id: number
    name: string
    slug: string
    releaseYear: number | null
    developer: string | null
    metacritic: number | null
    genres: string[] | null
    mapEligibility: boolean | null
    curated: boolean
    metadataStatus?: 'pending' | 'resolved' | 'unresolved'
    hasMap?: boolean
    mapCount?: number
    candidateCount?: number
}

export type FilterMode = 'enabled' | 'no-map' | 'candidates' | 'all'
export const FILTER_MODES: FilterMode[] = ['enabled', 'no-map', 'candidates', 'all']

export interface ActiveMapInfo {
    id: number
    source:
        | 'registry'
        | 'fandom'
        | 'strategywiki'
        | 'fextralife'
        | 'wand'
        | 'wikidata'
        | 'steam'
        | 'manual'
    imageUrl: string
    license: string
    attribution: string | null
    widthPx: number
    heightPx: number
    region?: string | null
    // Multi-map: marks the row Steam/RAWG capture providers attach new
    // candidates to. Exactly one map per game holds the role.
    isCaptureDefault?: boolean
}

export type TierKey =
    | 'registry'
    | 'fandom'
    | 'strategywiki'
    | 'fextralife'
    | 'wand'
    | 'wikidata'
    | 'manual'

export interface TierCandidate {
    id: number
    imageUrl: string
    widthPx: number
    heightPx: number
    license: string
    attribution: string | null
    sourceUrl: string | null
    region: string | null
    isActive: boolean
}

export type TierStateBase = { tier: TierKey }
export type TierState =
    | (TierStateBase & {
          status: 'matched'
          via: string
          license?: string
          sourceUrl?: string
          candidates: TierCandidate[]
      })
    | (TierStateBase & {
          status: 'tombstoned'
          reason: string
          attempts: number
          retryAfter: string
      })
    | (TierStateBase & { status: 'eligible' })
    | (TierStateBase & { status: 'untried'; reason?: string })

export interface SourcesResponse {
    gameId: number
    gameName: string
    slug: string
    // Deprecated: identical to `captureDefaultMap`. Kept for the desktop
    // preview block until the multi-map refactor of that section lands.
    activeMap: ActiveMapInfo | null
    // All maps a player would see in the chooser today. Always includes
    // the capture default; for a single-map game it has length 1.
    enabledMaps?: ActiveMapInfo[]
    captureDefaultMap?: ActiveMapInfo | null
    sources: TierState[]
}

export interface OpsState {
    busyAction: 'reimport' | null
    bulkBusy: boolean
    resetting: boolean
    uncurating: boolean
    retryingTier: string | null
    runningTier: string | null
    activatingMapId: number | null
}

export const INITIAL_OPS: OpsState = {
    busyAction: null,
    bulkBusy: false,
    resetting: false,
    uncurating: false,
    retryingTier: null,
    runningTier: null,
    activatingMapId: null,
}

export type OpsAction =
    | { type: 'busyAction'; value: 'reimport' | null }
    | { type: 'bulkBusy'; value: boolean }
    | { type: 'resetting'; value: boolean }
    | { type: 'uncurating'; value: boolean }
    | { type: 'retryingTier'; value: string | null }
    | { type: 'runningTier'; value: string | null }
    | { type: 'activatingMapId'; value: number | null }

export function opsReducer(state: OpsState, action: OpsAction): OpsState {
    switch (action.type) {
        case 'busyAction':
            return { ...state, busyAction: action.value }
        case 'bulkBusy':
            return { ...state, bulkBusy: action.value }
        case 'resetting':
            return { ...state, resetting: action.value }
        case 'uncurating':
            return { ...state, uncurating: action.value }
        case 'retryingTier':
            return { ...state, retryingTier: action.value }
        case 'runningTier':
            return { ...state, runningTier: action.value }
        case 'activatingMapId':
            return { ...state, activatingMapId: action.value }
    }
}

export type CatalogDialogState =
    | { kind: 'none' }
    | { kind: 'addMap'; addMap: { game: CuratedGame; strategy: AddMapStrategy } }
    | { kind: 'reset' }
    | { kind: 'uncurate'; uncurate: CuratedGame }

export const INITIAL_CATALOG_DIALOG: CatalogDialogState = { kind: 'none' }

export type CatalogDialogAction =
    | { type: 'openAddMap'; addMap: { game: CuratedGame; strategy: AddMapStrategy } }
    | { type: 'openReset' }
    | { type: 'openUncurate'; uncurate: CuratedGame }
    | { type: 'close' }

export function catalogDialogReducer(
    _state: CatalogDialogState,
    action: CatalogDialogAction,
): CatalogDialogState {
    switch (action.type) {
        case 'openAddMap':
            return { kind: 'addMap', addMap: action.addMap }
        case 'openReset':
            return { kind: 'reset' }
        case 'openUncurate':
            return { kind: 'uncurate', uncurate: action.uncurate }
        case 'close':
            return { kind: 'none' }
    }
}

