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

type Phase =
    | 'idle'
    | 'loading'
    | 'ready'
    | 'submitting'
    | 'revealed'
    | 'error'
    | 'exhausted'

const GAMES_TTL_MS = 5 * 60 * 1000
// WHERE NOT IN payload cap on the backend. Older plays simply roll off
// the front of the array once we hit it — re-seeing the very oldest
// screenshot after hundreds of rounds is acceptable, while letting the
// list grow unbounded would balloon both storage and the request body.
const MAX_PLAYED_PER_GAME = 1000

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
    // History of meta IDs the user has already played per game. Used as
    // the exclusion list on each reroll so the same screenshot is never
    // served twice in a row to the same client. Tracked per game (not
    // per map) so changing the map filter still hides already-seen
    // screenshots that happen to live on another map.
    playedByGame: Record<number, number[]>
    // Games the player explicitly opted out of ("don't know this one").
    // They're hidden from completion math so the all-time "done" message
    // can fire even if the catalog has games the player will never touch.
    ignoredGameIds: number[]

    // Actions
    loadGames(force?: boolean): Promise<void>
    selectGame(gameId: number): Promise<void>
    selectMap(mapId: number | null): Promise<void>
    rerollScreenshot(): Promise<void>
    setPendingGuess(p: GeoPoint | null): void
    submitGuess(): Promise<GeoFreePlayResult | null>
    nextRound(): Promise<void>
    // Force-refresh the catalog and try to roll again. Used from the
    // exhausted state so a player who's seen everything can pull in
    // newly-promoted screenshots without a full page reload.
    checkForNewScreenshots(): Promise<void>
    toggleIgnoreGame(gameId: number): void
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
            playedByGame: {},
            ignoredGameIds: [],

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
                const { currentGameId, currentMapId, playedByGame } = get()
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
                    const excludeMetaIds = playedByGame[currentGameId] ?? []
                    const view = await geoApi.pickFreePlay({
                        gameId: currentGameId,
                        geoMapId: currentMapId ?? undefined,
                        excludeMetaIds:
                            excludeMetaIds.length > 0 ? excludeMetaIds : undefined,
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
                    // The server returns ALL_PLAYED when the exclusion
                    // list ate the only remaining candidates. Surface a
                    // dedicated phase so the UI can offer a "reset
                    // history" affordance instead of looking broken.
                    const code = err instanceof GeoApiError ? err.code : null
                    set({
                        phase: code === 'ALL_PLAYED' ? 'exhausted' : 'error',
                        errorMessage: getApiErrorMessage(err),
                        errorCode: code,
                    })
                }
            },

            setPendingGuess(p) {
                set({ pendingGuess: p })
            },

            async submitGuess() {
                const { view, pendingGuess, currentMapId, currentGameId, maps } =
                    get()
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
                    // Record this metaId as played so the next reroll
                    // (and every future session — see persist config)
                    // excludes it from the random pool.
                    if (currentGameId != null) {
                        const prev = get().playedByGame[currentGameId] ?? []
                        const next = prev.includes(view.meta.id)
                            ? prev
                            : [...prev, view.meta.id].slice(-MAX_PLAYED_PER_GAME)
                        set({
                            playedByGame: {
                                ...get().playedByGame,
                                [currentGameId]: next,
                            },
                        })
                    }
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

            async checkForNewScreenshots() {
                // Force-refresh the catalog so screenshotCount badges
                // reflect newly-promoted captures, then try to roll
                // again — succeeds iff there's now at least one
                // unplayed meta for the current game.
                await get().loadGames(true)
                await get().rerollScreenshot()
            },

            toggleIgnoreGame(gameId) {
                const current = get().ignoredGameIds
                const next = current.includes(gameId)
                    ? current.filter((id) => id !== gameId)
                    : [...current, gameId]
                set({ ignoredGameIds: next })
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
            // Persist the user's last picked game + map so a reload
            // resumes the same context, and the played-meta history so
            // we don't reshow the same screenshots after a refresh.
            // Live round state (view, result, etc.) is intentionally
            // re-fetched from the network — stale state would
            // resurrect a round the player already finished.
            partialize: (state) => ({
                currentGameId: state.currentGameId,
                currentMapId: state.currentMapId,
                playedByGame: state.playedByGame,
                ignoredGameIds: state.ignoredGameIds,
            }),
            version: 3,
        },
    ),
)
