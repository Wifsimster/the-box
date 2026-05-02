import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import {
  geoFetchApi,
  type GeoFetchGameRow,
  type GeoFetchStage,
  type GeoFetchStatus,
} from '@/lib/api/geo-fetch'

// Single store for the geo-fetch admin tab. Server is the source of truth on
// initial mount + reconnect; sockets push deltas in between. Game rows are
// keyed by gameId for cheap merging.

interface GeoFetchState {
  status: GeoFetchStatus | null
  games: Record<number, GeoFetchGameRow>
  isLoading: boolean
  isStarting: boolean
  error: string | null
  filterStage: GeoFetchStage | null
  search: string

  hydrate: () => Promise<void>
  start: (input: { gameIds?: number[]; all?: boolean }) => Promise<void>
  cancel: () => Promise<void>
  retryGame: (gameId: number) => Promise<void>
  retrySource: (gameId: number, source: string) => Promise<void>
  selectMap: (gameId: number, mapId: number) => Promise<void>
  resetCooldown: (gameId: number) => Promise<void>

  setFilterStage: (stage: GeoFetchStage | null) => void
  setSearch: (q: string) => void

  // Socket-driven mutators (called from the panel's useEffect)
  applyProgress: (payload: { gameId: number; source: string; stage: string }) => void
  applyGameDone: (payload: { gameId: number; mapsFound: number; zonesTotal: number; finalStage: string }) => void
  applyMapSelected: (payload: { gameId: number; mapId: number }) => void
}

export const useGeoFetchStore = create<GeoFetchState>()(
  devtools(
    (set, get) => ({
      status: null,
      games: {},
      isLoading: false,
      isStarting: false,
      error: null,
      filterStage: null,
      search: '',

      async hydrate() {
        set({ isLoading: true, error: null })
        try {
          const [status, page] = await Promise.all([
            geoFetchApi.status(),
            geoFetchApi.listGames({
              stage: get().filterStage ?? undefined,
              search: get().search || undefined,
              limit: 200,
            }),
          ])
          const games: Record<number, GeoFetchGameRow> = {}
          for (const row of page.games) games[row.game_id] = row
          set({ status, games, isLoading: false })
        } catch (err) {
          set({ isLoading: false, error: String(err) })
        }
      },

      async start(input) {
        set({ isStarting: true })
        try {
          await geoFetchApi.start(input)
          await get().hydrate()
        } finally {
          set({ isStarting: false })
        }
      },

      async cancel() {
        await geoFetchApi.cancel()
        await get().hydrate()
      },

      async retryGame(gameId) {
        await geoFetchApi.retry(gameId)
      },

      async retrySource(gameId, source) {
        await geoFetchApi.retrySource(gameId, source)
      },

      async selectMap(gameId, mapId) {
        await geoFetchApi.selectMap(gameId, mapId)
      },

      async resetCooldown(gameId) {
        await geoFetchApi.resetCooldown(gameId)
        await get().hydrate()
      },

      setFilterStage(stage) {
        set({ filterStage: stage })
        void get().hydrate()
      },

      setSearch(q) {
        set({ search: q })
      },

      applyProgress({ gameId, source, stage }) {
        const existing = get().games[gameId]
        if (!existing) return
        set({
          games: {
            ...get().games,
            [gameId]: {
              ...existing,
              current_stage: stage as GeoFetchStage,
              active_source: source,
              updated_at: new Date().toISOString(),
            },
          },
        })
      },

      applyGameDone({ gameId, mapsFound, zonesTotal, finalStage }) {
        const existing = get().games[gameId]
        if (!existing) return
        set({
          games: {
            ...get().games,
            [gameId]: {
              ...existing,
              current_stage: finalStage as GeoFetchStage,
              zones_covered: mapsFound,
              zones_total: zonesTotal,
              active_source: null,
              updated_at: new Date().toISOString(),
            },
          },
        })
      },

      applyMapSelected({ gameId }) {
        const existing = get().games[gameId]
        if (!existing) return
        set({
          games: {
            ...get().games,
            [gameId]: {
              ...existing,
              zones_selected: existing.zones_selected + 1,
              updated_at: new Date().toISOString(),
            },
          },
        })
      },
    }),
    { name: 'geoFetchStore' },
  ),
)
