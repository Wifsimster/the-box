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

const REAL_WORLD_BIAS_PIN_THRESHOLD = 5
const REAL_WORLD_BIAS_WEIGHT = 4

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

function isAuthError(err: unknown): boolean {
    if (!(err instanceof GeoApiError)) return false
    if (err.status === 401) return true
    return err.code === 'UNAUTHORIZED' || err.code === 'AUTH_ERROR'
}

export const RUN_LENGTH = 5

interface RunState {
    roundIndex: number
    scores: number[]
    finished: boolean
}

const GAMES_TTL_MS = 5 * 60 * 1000
const MAX_PLAYED_PER_GAME = 1000
const MAX_HISTORY = 50

interface HistoryEntry {
    gameId: number
    mapId: number | null
    view: GeoFreePlayView
}

interface GeoFreePlayState {
    games: GeoPlayableGame[]
    gamesFetchedAt: number | null
    currentGameId: number | null
    currentMapId: number | null
    maps: GeoMap[]
    view: GeoFreePlayView | null
    pendingGuess: GeoPoint | null
    result: GeoFreePlayResult | null
    correctMap: GeoMap | null
    phase: Phase
    errorMessage: string | null
    errorCode: string | null
    round: number
    playedByGame: Record<number, number[]>
    ignoredGameIds: number[]
    hasEverPlacedPin: boolean
    bestScoreByGame: Record<number, number>
    previousBestScore: number | null
    run: RunState | null
    history: HistoryEntry[]
    historyIndex: number

    loadGames(force?: boolean): Promise<void>
    selectGame(gameId: number): Promise<void>
    selectMap(mapId: number | null): Promise<void>
    rerollScreenshot(): Promise<void>
    pickRandomAcrossGames(): Promise<void>
    goPrevious(): void
    goNext(): Promise<void>
    setPendingGuess(p: GeoPoint | null): void
    submitGuess(): Promise<GeoFreePlayResult | null>
    nextRound(): Promise<void>
    checkForNewScreenshots(): Promise<void>
    toggleIgnoreGame(gameId: number): void
    startRun(): Promise<void>
    advanceRun(): Promise<void>
    endRun(): void
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
            hasEverPlacedPin: false,
            bestScoreByGame: {},
            previousBestScore: null,
            run: null,
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
                set({ currentMapId: mapId, pendingGuess: null, result: null, correctMap: null })
                if (mapId != null) {
                    await get().rerollScreenshot()
                }
            },

            async rerollScreenshot() {
                const { currentGameId, currentMapId, playedByGame, view: currentView } = get()
                if (currentGameId == null) return
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
                        phase: 'ready',
                        round: get().round + 1,
                        history: nextHistory,
                        historyIndex: nextHistory.length - 1,
                    })
                } catch (err) {
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
                if (get().games.length === 0) {
                    await get().loadGames()
                }
                const { games, ignoredGameIds, currentGameId, playedByGame } = get()
                const ignored = new Set(ignoredGameIds)
                const candidates = games.filter((g) => {
                    if (ignored.has(g.id)) return false
                    if (g.screenshotCount <= 0) return false
                    const played = playedByGame[g.id]?.length ?? 0
                    return played < g.screenshotCount
                })
                if (candidates.length === 0) return
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
                await get().rerollScreenshot()
            },

            setPendingGuess(p) {
                const prev = get().pendingGuess
                if (prev && p && prev.x === p.x && prev.y === p.y) return
                if (!prev && !p) return
                set(
                    p
                        ? { pendingGuess: p, hasEverPlacedPin: true }
                        : { pendingGuess: p },
                )
            },

            async submitGuess() {
                const { view, pendingGuess, currentMapId, currentGameId, maps } =
                    get()
                if (!view || !pendingGuess) return null
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
                    let previousBestScore: number | null = null
                    if (currentGameId != null) {
                        const prev = get().playedByGame[currentGameId] ?? []
                        const next = prev.includes(view.meta.id)
                            ? prev
                            : [...prev, view.meta.id].slice(-MAX_PLAYED_PER_GAME)
                        previousBestScore =
                            get().bestScoreByGame[currentGameId] ?? null
                        const bestScoreByGame =
                            previousBestScore == null || result.score > previousBestScore
                                ? {
                                      ...get().bestScoreByGame,
                                      [currentGameId]: result.score,
                                  }
                                : get().bestScoreByGame
                        set({
                            playedByGame: {
                                ...get().playedByGame,
                                [currentGameId]: next,
                            },
                            bestScoreByGame,
                        })
                    }
                    const { run } = get()
                    const nextRun =
                        run && !run.finished
                            ? { ...run, scores: [...run.scores, result.score] }
                            : run
                    set({
                        result,
                        correctMap,
                        previousBestScore,
                        run: nextRun,
                        phase: 'revealed',
                    })
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
                if (get().run) {
                    await get().advanceRun()
                    return
                }
                await get().rerollScreenshot()
            },

            async startRun() {
                set({ run: { roundIndex: 0, scores: [], finished: false } })
                await get().pickRandomAcrossGames()
            },

            async advanceRun() {
                const { run } = get()
                if (!run) return
                if (run.scores.length >= RUN_LENGTH) {
                    set({ run: { ...run, finished: true } })
                    return
                }
                set({ run: { ...run, roundIndex: run.scores.length } })
                await get().pickRandomAcrossGames()
            },

            endRun() {
                set({ run: null })
            },

            async checkForNewScreenshots() {
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
                    run: null,
                    history: [],
                    historyIndex: -1,
                })
            },
        }),
        {
            name: 'geo-free-play-store-v1',
            partialize: (state) => ({
                currentGameId: state.currentGameId,
                currentMapId: state.currentMapId,
                playedByGame: state.playedByGame,
                ignoredGameIds: state.ignoredGameIds,
                hasEverPlacedPin: state.hasEverPlacedPin,
                bestScoreByGame: state.bestScoreByGame,
            }),
            version: 3,
        },
    ),
)
