import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
    GeoFreePlayResult,
    GeoFreePlayView,
    GeoMap,
    GeoPlayableGame,
    GeoPoint,
} from '@the-box/types'
import { geoApi, GeoApiError } from '../lib/api/geo'
import { getApiErrorMessage } from '../lib/api-errors'

type Phase = 'idle' | 'loading' | 'ready' | 'submitting' | 'revealed' | 'error'

const GAMES_TTL_MS = 5 * 60 * 1000

interface GeoFreePlayState {
    // Catalog
    games: GeoPlayableGame[]
    gamesFetchedAt: number | null
    // Selection
    currentGameId: number | null
    currentMapId: number | null
    maps: GeoMap[]
    // Round
    view: GeoFreePlayView | null
    pendingGuess: GeoPoint | null
    result: GeoFreePlayResult | null
    correctMap: GeoMap | null
    // Status
    phase: Phase
    errorMessage: string | null
    errorCode: string | null
    // Round counter so the screenshot/map components can re-key on
    // each new pick (prevents Embla / stale-pin glitches between rounds).
    round: number

    // Actions
    loadGames(force?: boolean): Promise<void>
    selectGame(gameId: number): Promise<void>
    selectMap(mapId: number | null): Promise<void>
    rerollScreenshot(): Promise<void>
    setPendingGuess(p: GeoPoint | null): void
    submitGuess(): Promise<GeoFreePlayResult | null>
    nextRound(): Promise<void>
    reset(): void
}

export const useGeoFreePlayStore = create<GeoFreePlayState>()(
    persist(
        (set, get) => ({
            games: [],
            gamesFetchedAt: null,
            currentGameId: null,
            currentMapId: null,
            maps: [],
            view: null,
            pendingGuess: null,
            result: null,
            correctMap: null,
            phase: 'idle',
            errorMessage: null,
            errorCode: null,
            round: 0,

            async loadGames(force) {
                const { gamesFetchedAt } = get()
                const fresh =
                    !force &&
                    gamesFetchedAt != null &&
                    Date.now() - gamesFetchedAt < GAMES_TTL_MS
                if (fresh && get().games.length > 0) return
                try {
                    const games = await geoApi.listPlayableGames()
                    set({ games, gamesFetchedAt: Date.now() })
                } catch (err) {
                    set({
                        phase: 'error',
                        errorMessage: getApiErrorMessage(err),
                        errorCode: err instanceof GeoApiError ? err.code : null,
                    })
                }
            },

            async selectGame(gameId) {
                set({
                    phase: 'loading',
                    currentGameId: gameId,
                    currentMapId: null,
                    maps: [],
                    view: null,
                    pendingGuess: null,
                    result: null,
                    correctMap: null,
                    errorMessage: null,
                    errorCode: null,
                })
                try {
                    const maps = await geoApi.listGameMaps(gameId)
                    // Auto-select when the game is single-map so the player
                    // doesn't have to tap a chooser that has only one option.
                    const autoMapId = maps.length === 1 ? (maps[0]?.id ?? null) : null
                    set({ maps, currentMapId: autoMapId })
                    await get().rerollScreenshot()
                } catch (err) {
                    set({
                        phase: 'error',
                        errorMessage: getApiErrorMessage(err),
                        errorCode: err instanceof GeoApiError ? err.code : null,
                    })
                }
            },

            async selectMap(mapId) {
                // Pin coordinates are normalized [0..1] per map — switching
                // maps invalidates the previous pin. Clear it so the player
                // re-pins on the new image instead of seeing a stale dot.
                set({ currentMapId: mapId, pendingGuess: null, result: null, correctMap: null })
                if (mapId != null) {
                    await get().rerollScreenshot()
                }
            },

            async rerollScreenshot() {
                const { currentGameId, currentMapId } = get()
                if (currentGameId == null) return
                set({
                    phase: 'loading',
                    view: null,
                    pendingGuess: null,
                    result: null,
                    correctMap: null,
                    errorMessage: null,
                    errorCode: null,
                })
                try {
                    const view = await geoApi.pickFreePlay({
                        gameId: currentGameId,
                        geoMapId: currentMapId ?? undefined,
                    })
                    set({
                        view,
                        maps: view.maps,
                        // If we landed without a map preference, leave it
                        // null — the player picks before guessing. If a
                        // preference was set, keep it.
                        phase: 'ready',
                        round: get().round + 1,
                    })
                } catch (err) {
                    set({
                        phase: 'error',
                        errorMessage: getApiErrorMessage(err),
                        errorCode: err instanceof GeoApiError ? err.code : null,
                    })
                }
            },

            setPendingGuess(p) {
                set({ pendingGuess: p })
            },

            async submitGuess() {
                const { view, pendingGuess, currentMapId, maps } = get()
                if (!view || !pendingGuess) return null
                // Multi-map games require an explicit pick. Single-map
                // games auto-selected at load time so this is a no-op there.
                const pickedMapId =
                    currentMapId ?? (maps.length === 1 ? (maps[0]?.id ?? null) : null)
                if (pickedMapId == null) return null
                set({ phase: 'submitting', errorMessage: null })
                try {
                    const result = await geoApi.submitFreePlayGuess({
                        metaId: view.meta.id,
                        geoMapId: pickedMapId,
                        guess: pendingGuess,
                    })
                    const correctMap = maps.find((m) => m.id === result.correctMapId) ?? null
                    set({ result, correctMap, phase: 'revealed' })
                    return result
                } catch (err) {
                    set({
                        phase: 'error',
                        errorMessage: getApiErrorMessage(err),
                        errorCode: err instanceof GeoApiError ? err.code : null,
                    })
                    return null
                }
            },

            async nextRound() {
                await get().rerollScreenshot()
            },

            reset() {
                set({
                    currentGameId: null,
                    currentMapId: null,
                    maps: [],
                    view: null,
                    pendingGuess: null,
                    result: null,
                    correctMap: null,
                    phase: 'idle',
                    errorMessage: null,
                    errorCode: null,
                })
            },
        }),
        {
            name: 'geo-free-play-store-v1',
            // Only persist the user's last picked game + map so a reload
            // resumes the same context. Screenshots and results are
            // intentionally re-fetched from the network — stale state
            // would resurrect a round the player already finished.
            partialize: (state) => ({
                currentGameId: state.currentGameId,
                currentMapId: state.currentMapId,
            }),
            version: 1,
        },
    ),
)
