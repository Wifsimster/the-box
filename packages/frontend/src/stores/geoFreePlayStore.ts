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
    | 'authRequired'
    | 'exhausted'

// Cold-start threshold: while a player has placed fewer than this many
// pins across the whole catalog, the cross-games shuffle is biased
// toward real-world-grounded titles. After it, the bias drops out so
// experienced players don't get stuck in GTA reruns.
const REAL_WORLD_BIAS_PIN_THRESHOLD = 5
// Multiplier applied to a real-world game's selection weight while the
// player is still under the cold-start threshold. 4× means a real-world
// game is picked 4× more often than a fictional one of equal pool size.
const REAL_WORLD_BIAS_WEIGHT = 4

// Bias-aware random pick. When the player is "new" (total played pins
// across all games < threshold), real-world-setting games get an
// outsized weight so the cold-start mental model is "you're guessing
// real geography" instead of "what is this fictional continent". After
// the threshold the bias collapses to uniform random — every game has
// weight 1, regardless of setting.
function weightedPick(
    pool: GeoPlayableGame[],
    playedByGame: Record<number, number[]>,
): GeoPlayableGame | undefined {
    if (pool.length === 0) return undefined
    const totalPlayed = Object.values(playedByGame).reduce(
        (sum, ids) => sum + ids.length,
        0,
    )
    const biasActive = totalPlayed < REAL_WORLD_BIAS_PIN_THRESHOLD
    // Short-circuit: if no game in the pool is real-world OR the bias
    // window is over, fall back to uniform random — saves the prefix-
    // sum walk on the common case.
    if (!biasActive || !pool.some((g) => g.realWorldSetting)) {
        return pool[Math.floor(Math.random() * pool.length)]
    }
    let total = 0
    const cumulative: number[] = []
    for (const g of pool) {
        total += g.realWorldSetting ? REAL_WORLD_BIAS_WEIGHT : 1
        cumulative.push(total)
    }
    const target = Math.random() * total
    for (let i = 0; i < pool.length; i++) {
        if (target < cumulative[i]!) return pool[i]
    }
    return pool[pool.length - 1]
}

// Returns true when the API rejected us because we're not signed in. We
// look at both the HTTP status and the error code so the UI can show the
// same login prompt regardless of which auth path the backend hit.
function isAuthError(err: unknown): boolean {
    if (!(err instanceof GeoApiError)) return false
    if (err.status === 401) return true
    return err.code === 'UNAUTHORIZED' || err.code === 'AUTH_ERROR'
}

const GAMES_TTL_MS = 5 * 60 * 1000
// WHERE NOT IN payload cap on the backend. Older plays simply roll off
// the front of the array once we hit it — re-seeing the very oldest
// screenshot after hundreds of rounds is acceptable, while letting the
// list grow unbounded would balloon both storage and the request body.
const MAX_PLAYED_PER_GAME = 1000
// Cap on the in-memory history stack used by the prev/next buttons.
// Older entries roll off the front so the player can always step back
// through their recent rounds without us holding every view forever.
const MAX_HISTORY = 50

interface HistoryEntry {
    gameId: number
    mapId: number | null
    view: GeoFreePlayView
}

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
    // In-memory navigation history (current session only). Each entry is
    // a fully-restorable round so prev/next can step through screenshots
    // the player has already seen — including across game switches.
    history: HistoryEntry[]
    historyIndex: number

    // Actions
    loadGames(force?: boolean): Promise<void>
    selectGame(gameId: number): Promise<void>
    selectMap(mapId: number | null): Promise<void>
    rerollScreenshot(): Promise<void>
    // Pick a brand-new screenshot from a random non-ignored game in the
    // catalog. Avoids re-rolling onto the current game when alternatives
    // exist so the button feels like it actually shuffled.
    pickRandomAcrossGames(): Promise<void>
    goPrevious(): void
    goNext(): Promise<void>
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
            history: [],
            historyIndex: -1,

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
                        phase: isAuthError(err) ? 'authRequired' : 'error',
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
                const { currentGameId, currentMapId, playedByGame, view: currentView } = get()
                if (currentGameId == null) return
                // Capture the current screenshot's metaId before clearing
                // the view. It isn't in `playedByGame` yet (only submitted
                // guesses are), so without this the API can re-roll onto
                // the same screenshot — making "I don't know / skip" look
                // broken on small per-game pools.
                const currentMetaId = currentView?.meta.id ?? null
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
                    const playedIds = playedByGame[currentGameId] ?? []
                    const excludeMetaIds =
                        currentMetaId != null && !playedIds.includes(currentMetaId)
                            ? [...playedIds, currentMetaId]
                            : playedIds
                    const view = await geoApi.pickFreePlay({
                        gameId: currentGameId,
                        geoMapId: currentMapId ?? undefined,
                        excludeMetaIds:
                            excludeMetaIds.length > 0 ? excludeMetaIds : undefined,
                    })
                    // Branch the history at the current cursor (drop any
                    // forward entries) and append this new view so prev/next
                    // walks the user's actual recent path.
                    const { history, historyIndex } = get()
                    const truncated = history.slice(0, historyIndex + 1)
                    const nextHistory = [
                        ...truncated,
                        {
                            gameId: currentGameId,
                            mapId: currentMapId,
                            view,
                        },
                    ].slice(-MAX_HISTORY)
                    set({
                        view,
                        maps: view.maps,
                        // If we landed without a map preference, leave it
                        // null — the player picks before guessing. If a
                        // preference was set, keep it.
                        phase: 'ready',
                        round: get().round + 1,
                        history: nextHistory,
                        historyIndex: nextHistory.length - 1,
                    })
                } catch (err) {
                    // The server returns ALL_PLAYED when the exclusion
                    // list ate the only remaining candidates. Surface a
                    // dedicated phase so the UI can offer a "reset
                    // history" affordance instead of looking broken.
                    const code = err instanceof GeoApiError ? err.code : null
                    let phase: Phase = 'error'
                    if (code === 'ALL_PLAYED') phase = 'exhausted'
                    else if (isAuthError(err)) phase = 'authRequired'
                    set({
                        phase,
                        errorMessage: getApiErrorMessage(err),
                        errorCode: code,
                    })
                }
            },

            async pickRandomAcrossGames() {
                // Make sure the catalog is hydrated; cold-start this is
                // the first thing a fresh visitor would tap.
                if (get().games.length === 0) {
                    await get().loadGames()
                }
                const { games, ignoredGameIds, currentGameId, playedByGame } = get()
                const ignored = new Set(ignoredGameIds)
                // Exclude games the player has already fully played — landing
                // on one would just bounce back into the exhausted state and
                // (with the auto-switch effect) thrash through games until
                // every remaining candidate is also exhausted.
                const candidates = games.filter((g) => {
                    if (ignored.has(g.id)) return false
                    if (g.screenshotCount <= 0) return false
                    const played = playedByGame[g.id]?.length ?? 0
                    return played < g.screenshotCount
                })
                if (candidates.length === 0) return
                // Avoid landing back on the same game when there's an
                // alternative — otherwise the shuffle feels broken on
                // small catalogs.
                const pool =
                    candidates.length > 1 && currentGameId != null
                        ? candidates.filter((g) => g.id !== currentGameId)
                        : candidates
                const pick = weightedPick(pool, playedByGame)
                if (!pick) return
                await get().selectGame(pick.id)
            },

            goPrevious() {
                const { history, historyIndex } = get()
                if (historyIndex <= 0) return
                const newIndex = historyIndex - 1
                const entry = history[newIndex]
                if (!entry) return
                set({
                    historyIndex: newIndex,
                    currentGameId: entry.gameId,
                    currentMapId: entry.mapId,
                    maps: entry.view.maps,
                    view: entry.view,
                    pendingGuess: null,
                    result: null,
                    correctMap: null,
                    phase: 'ready',
                    errorMessage: null,
                    errorCode: null,
                    round: get().round + 1,
                })
            },

            async goNext() {
                const { history, historyIndex } = get()
                // Step forward through history if there's a stored entry…
                if (historyIndex < history.length - 1) {
                    const newIndex = historyIndex + 1
                    const entry = history[newIndex]
                    if (entry) {
                        set({
                            historyIndex: newIndex,
                            currentGameId: entry.gameId,
                            currentMapId: entry.mapId,
                            maps: entry.view.maps,
                            view: entry.view,
                            pendingGuess: null,
                            result: null,
                            correctMap: null,
                            phase: 'ready',
                            errorMessage: null,
                            errorCode: null,
                            round: get().round + 1,
                        })
                        return
                    }
                }
                // …otherwise fetch a fresh screenshot in the current game.
                await get().rerollScreenshot()
            },

            setPendingGuess(p) {
                const prev = get().pendingGuess
                // Skip the set when the click landed on the exact same
                // normalized point — Leaflet emits redundant clicks
                // during pinch-zoom on Android and we don't want every
                // one to trigger a re-render of the map canvas.
                if (prev && p && prev.x === p.x && prev.y === p.y) return
                if (!prev && !p) return
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
                        phase: isAuthError(err) ? 'authRequired' : 'error',
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
                    history: [],
                    historyIndex: -1,
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
