import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchAdminJson as fetchJson } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api-errors'
import type { GeoRunStatePayload } from '@/hooks/useGeoRunPolling'
import type { AddMapStrategy } from './AddMapDialog'
import {
    INITIAL_OPS,
    INITIAL_CATALOG_DIALOG,
    opsReducer,
    catalogDialogReducer,
    type CatalogRow,
    type CuratedGame,
    type FilterMode,
    type SourcesResponse,
} from './geo-catalog-types'

interface UseGeoCatalogArgs {
    runState: GeoRunStatePayload | null
    armRunPolling: (windowMs?: number) => void
    initialFilter?: FilterMode
}

export function useGeoCatalog({ runState, armRunPolling, initialFilter }: UseGeoCatalogArgs) {
    const { t } = useTranslation()
    // The two catalog lists and their loading flag arrive from one fetch, so
    // they share a state object.
    const [data, setData] = useState<{
        curated: CuratedGame[] | null
        candidates: CatalogRow[] | null
        loading: boolean
    }>({ curated: null, candidates: null, loading: true })
    const { curated, candidates, loading } = data

    // The side-panel selection and the sources it loads are one slice (selecting
    // a game drives the fetch).
    const [panel, setPanel] = useState<{
        selectedId: number | null
        sources: SourcesResponse | null
        sourcesLoading: boolean
    }>({ selectedId: null, sources: null, sourcesLoading: false })
    const { selectedId, sources, sourcesLoading } = panel

    // Filter pill + search box + the row checkboxes are the catalog's view
    // controls; a filter/search change clears the selection, so they update
    // together as one slice.
    const [view, setView] = useState<{
        filter: FilterMode
        search: string
        rawSelected: Set<number>
    }>({ filter: initialFilter ?? 'enabled', search: '', rawSelected: new Set() })
    const { filter, search, rawSelected } = view
    const setFilter = useCallback(
        (filter: FilterMode) => setView((v) => ({ ...v, filter, rawSelected: new Set() })),
        [],
    )
    const setSearch = useCallback(
        (search: string) => setView((v) => ({ ...v, search, rawSelected: new Set() })),
        [],
    )
    const setRawSelected = useCallback(
        (next: Set<number> | ((prev: Set<number>) => Set<number>)) =>
            setView((v) => ({
                ...v,
                rawSelected: typeof next === 'function' ? next(v.rawSelected) : next,
            })),
        [],
    )

    // The success/error banner pair is one feedback slice — every mutation
    // clears both and then writes at most one, so they share a state object.
    const [feedback, setFeedback] = useState<{ message: string | null; error: string | null }>({
        message: null,
        error: null,
    })
    const setMessage = useCallback(
        (message: string | null) => setFeedback((f) => ({ ...f, message })),
        [],
    )
    const setError = useCallback(
        (error: string | null) => setFeedback((f) => ({ ...f, error })),
        [],
    )

    // Every per-row / per-tier / bulk mutation is mutually exclusive from the
    // operator's point of view, so the "what's in flight" flags collapse into a
    // single reducer that flips exactly one field per dispatch.
    const [ops, dispatchOps] = useReducer(opsReducer, INITIAL_OPS)

    // The three modal surfaces (Add-Map, Reset confirm, Uncurate confirm) are
    // one "active dialog" slice. Add-Map keeps the unified strategy tab so the
    // three side-panel buttons open it at their preferred tab.
    const [dialog, dispatchDialog] = useReducer(catalogDialogReducer, INITIAL_CATALOG_DIALOG)
    const addMapFor = dialog.kind === 'addMap' ? dialog.addMap : null
    const resetOpen = dialog.kind === 'reset'
    const uncurateFor = dialog.kind === 'uncurate' ? dialog.uncurate : null
    const setAddMapFor = (
        next:
            | { game: CuratedGame; strategy: AddMapStrategy }
            | null
            | ((
                  prev: { game: CuratedGame; strategy: AddMapStrategy } | null,
              ) => { game: CuratedGame; strategy: AddMapStrategy } | null),
    ) => {
        const value = typeof next === 'function' ? next(addMapFor) : next
        dispatchDialog(value ? { type: 'openAddMap', addMap: value } : { type: 'close' })
    }
    const setResetOpen = (open: boolean) =>
        dispatchDialog(open ? { type: 'openReset' } : { type: 'close' })
    const setUncurateFor = (game: CuratedGame | null) =>
        dispatchDialog(game ? { type: 'openUncurate', uncurate: game } : { type: 'close' })

    // Loaded together so the count badges on the filter pills stay
    // accurate regardless of which filter is active. The non-curated list
    // returns a leaner shape (no hasMap / mapCount), which is fine — those
    // columns are only meaningful for curated rows.
    const reload = useCallback(async () => {
        setData((d) => ({ ...d, loading: true }))
        try {
            const [c, k] = await Promise.all([
                fetchJson<{ games: CuratedGame[] }>(
                    '/api/admin/geo/games?curated=true&limit=200',
                ),
                fetchJson<{ games: Omit<CatalogRow, 'curated'>[] }>(
                    '/api/admin/geo/games?curated=false&limit=200',
                ),
            ])
            setData((d) => ({
                ...d,
                curated: c.games,
                candidates: k.games.map((g) => ({ ...g, curated: false })),
                loading: false,
            }))
        } catch (e) {
            setError(getApiErrorMessage(e))
            setData((d) => ({ ...d, loading: false }))
        }
    }, [setError])

    const reloadSources = useCallback(async (gameId: number) => {
        setPanel((p) => ({ ...p, sourcesLoading: true }))
        try {
            const sourcesData = await fetchJson<SourcesResponse>(
                `/api/admin/geo/games/${gameId}/sources`,
            )
            setPanel((p) => ({ ...p, sources: sourcesData, sourcesLoading: false }))
        } catch (e) {
            setError(getApiErrorMessage(e))
            setPanel((p) => ({ ...p, sources: null, sourcesLoading: false }))
        }
    }, [setError])

    useEffect(() => {
        void reload()
    }, [reload])

    // Select (or deselect) a catalog row's side panel. Clearing `sources`
    // synchronously avoids flashing the previous game's preview while the next
    // request is in flight; the fetch runs directly from this handler rather
    // than via a selection-watching effect.
    const selectGame = useCallback(
        (gameId: number | null) => {
            setPanel((p) => ({ ...p, selectedId: gameId, sources: null }))
            if (gameId !== null) void reloadSources(gameId)
        },
        [reloadSources],
    )

    const clearSelection = useCallback(() => {
        setPanel((p) => ({ ...p, selectedId: null, sources: null }))
    }, [])

    const reimport = async (game: CuratedGame) => {
        dispatchOps({ type: 'busyAction', value: 'reimport' })
        setMessage(null)
        setError(null)
        try {
            await fetchJson('/api/admin/geo/reimport', {
                method: 'POST',
                body: JSON.stringify({ gameId: game.id }),
            })
            setMessage(t('admin.geo.maps.reimportQueued', { name: game.name }))
            // Show live progress in the run banner since /reimport now
            // enqueues the full resolve+tick pipeline (not just resolver).
            armRunPolling()
            await Promise.all([reload(), reloadSources(game.id)])
        } catch (e) {
            setError(getApiErrorMessage(e))
        } finally {
            dispatchOps({ type: 'busyAction', value: null })
        }
    }

    const onAddMapSuccess = () => {
        if (!addMapFor) return
        const { game, strategy } = addMapFor
        // Strategy determines which success message to show — the dialog
        // doesn't tell us which form was submitted, but we know which one
        // was active when success fired.
        const messageKey =
            strategy === 'wand' ? 'admin.geo.wandMap.success' : 'admin.geo.manualMap.success'
        setMessage(t(messageKey, { name: game.name }))
        void Promise.all([reload(), reloadSources(game.id)])
    }

    const openAddMap = (strategy: AddMapStrategy) => (game: CuratedGame) =>
        setAddMapFor({ game, strategy })

    // Synchronize with the external run-polling system: when the parent-owned
    // `runState` (from useGeoRunPolling) flips active → idle, refetch so a game
    // moving 'pending' → 'resolved' or gaining `hasMap` becomes visible. There is
    // no in-component event to hang this on — the run completes asynchronously in
    // a hook this file doesn't own — so an effect is the correct React tool here
    // ("Synchronizing with an external system").
    const wasActiveRef = useRef(false)
    useEffect(() => {
        const active = runState?.isActive ?? false
        if (wasActiveRef.current && !active) {
            void reload()
            if (selectedId !== null) void reloadSources(selectedId)
        }
        wasActiveRef.current = active
    }, [runState?.isActive, reload, reloadSources, selectedId])

    const handleRetryTier = async (gameId: number, tier: string) => {
        dispatchOps({ type: 'retryingTier', value: tier })
        setMessage(null)
        setError(null)
        try {
            await fetchJson(`/api/admin/geo/tombstone/${gameId}/${tier}`, {
                method: 'DELETE',
            })
            setMessage(t('admin.geo.maps.tierStatus.retryQueued'))
            armRunPolling()
            await reloadSources(gameId)
        } catch (e) {
            setError(getApiErrorMessage(e))
        } finally {
            dispatchOps({ type: 'retryingTier', value: null })
        }
    }

    const handleRunTierNow = async (gameId: number, tier: string) => {
        dispatchOps({ type: 'runningTier', value: tier })
        setMessage(null)
        setError(null)
        try {
            await fetchJson(`/api/admin/geo/run/${gameId}/${tier}`, {
                method: 'POST',
            })
            setMessage(t('admin.geo.maps.tierStatus.runNowQueued'))
            armRunPolling()
            await reloadSources(gameId)
        } catch (e) {
            setError(getApiErrorMessage(e))
        } finally {
            dispatchOps({ type: 'runningTier', value: null })
        }
    }

    // Multi-map mode: "activate" a map = enable it. The legacy endpoint
    // (`/active-map`) is kept on the backend as an alias; this path uses
    // the explicit enable so multiple maps can be enabled in turn.
    const handleActivateMap = async (gameId: number, mapId: number) => {
        dispatchOps({ type: 'activatingMapId', value: mapId })
        setMessage(null)
        setError(null)
        try {
            await fetchJson(`/api/admin/geo/games/${gameId}/maps/enable`, {
                method: 'POST',
                body: JSON.stringify({ geoMapId: mapId }),
            })
            setMessage(t('admin.geo.maps.tierStatus.activated'))
            await Promise.all([reload(), reloadSources(gameId)])
        } catch (e) {
            setError(getApiErrorMessage(e))
        } finally {
            dispatchOps({ type: 'activatingMapId', value: null })
        }
    }

    const handleDisableMap = async (gameId: number, mapId: number) => {
        dispatchOps({ type: 'activatingMapId', value: mapId })
        setMessage(null)
        setError(null)
        try {
            await fetchJson(`/api/admin/geo/games/${gameId}/maps/disable`, {
                method: 'POST',
                body: JSON.stringify({ geoMapId: mapId }),
            })
            setMessage(t('admin.geo.maps.multi.disabled', 'Map disabled.'))
            await Promise.all([reload(), reloadSources(gameId)])
        } catch (e) {
            // Look at the structured ApiError code instead of stringifying —
            // matching on substring of `String(e)` works for the happy path
            // but breaks the moment the error message changes locale.
            const code = (e as { code?: string } | null)?.code ?? ''
            if (code === 'LAST_ENABLED') {
                setError(
                    t(
                        'admin.geo.maps.multi.disableLastBlocked',
                        'Cannot disable the last enabled map for a game.',
                    ),
                )
            } else {
                setError(getApiErrorMessage(e))
            }
        } finally {
            dispatchOps({ type: 'activatingMapId', value: null })
        }
    }

    const handleSetCaptureDefault = async (gameId: number, mapId: number) => {
        dispatchOps({ type: 'activatingMapId', value: mapId })
        setMessage(null)
        setError(null)
        try {
            await fetchJson(`/api/admin/geo/games/${gameId}/maps/capture-default`, {
                method: 'POST',
                body: JSON.stringify({ geoMapId: mapId }),
            })
            setMessage(
                t('admin.geo.maps.multi.captureDefaultSet', 'Capture default updated.'),
            )
            await reloadSources(gameId)
        } catch (e) {
            setError(getApiErrorMessage(e))
        } finally {
            dispatchOps({ type: 'activatingMapId', value: null })
        }
    }

    const handleUpdateRegion = async (
        gameId: number,
        mapId: number,
        region: string | null,
    ) => {
        dispatchOps({ type: 'activatingMapId', value: mapId })
        setMessage(null)
        setError(null)
        try {
            await fetchJson(`/api/admin/geo/maps/${mapId}`, {
                method: 'PATCH',
                body: JSON.stringify({ region }),
            })
            await reloadSources(gameId)
        } catch (e) {
            setError(getApiErrorMessage(e))
        } finally {
            dispatchOps({ type: 'activatingMapId', value: null })
        }
    }

    // Drop a game from the curated set straight from the Maps panel so an
    // operator who notices a wrong pick (low quality, no map) can retire it
    // without switching to the Games sub-tab. Backend flips `geo_curated`
    // off; the row falls out of the curated list on the next reload.
    const handleUncurate = async (game: CuratedGame) => {
        dispatchOps({ type: 'uncurating', value: true })
        setMessage(null)
        setError(null)
        try {
            await fetchJson('/api/admin/geo/curated', {
                method: 'POST',
                body: JSON.stringify({ gameId: game.id, curated: false }),
            })
            setMessage(t('admin.geo.maps.uncurate.success', { name: game.name }))
            setUncurateFor(null)
            if (selectedId === game.id) {
                clearSelection()
            }
            await reload()
        } catch (e) {
            setError(getApiErrorMessage(e))
        } finally {
            dispatchOps({ type: 'uncurating', value: false })
        }
    }

    const handleResetScraping = async () => {
        dispatchOps({ type: 'resetting', value: true })
        setMessage(null)
        setError(null)
        try {
            const data = await fetchJson<{
                importStates: number
                ingestFailures: number
                challenges: number
                maps: number
            }>('/api/admin/scraping/reset', { method: 'POST' })
            setMessage(t('admin.geo.reset.success', data))
            setResetOpen(false)
            // Side panel referenced rows that no longer exist.
            clearSelection()
            await reload()
        } catch (e) {
            setError(getApiErrorMessage(e))
        } finally {
            dispatchOps({ type: 'resetting', value: false })
        }
    }

    const selectedGame =
        curated?.find((g) => g.id === selectedId) ?? null

    // Build a unified row list. Curated rows carry the rich
    // metadataStatus/hasMap/mapCount info needed by the status badges and
    // the side panel; candidate rows are flat. Counts are computed from the
    // raw lists so the filter pills always show the true totals — never the
    // post-search ones.
    const allRows = useMemo<CatalogRow[]>(() => {
        const fromCurated: CatalogRow[] = (curated ?? []).map((g) => ({
            id: g.id,
            name: g.name,
            slug: g.slug,
            releaseYear: null,
            developer: null,
            metacritic: null,
            genres: null,
            mapEligibility: null,
            curated: true,
            metadataStatus: g.metadataStatus,
            hasMap: g.hasMap,
            mapCount: g.mapCount,
            candidateCount: g.candidateCount,
        }))
        return [...fromCurated, ...(candidates ?? [])]
    }, [curated, candidates])

    const counts = useMemo(() => {
        const enabled = (curated ?? []).filter((g) => g.hasMap).length
        const noMap = (curated ?? []).filter((g) => !g.hasMap).length
        const candidatesCount = candidates?.length ?? 0
        return {
            enabled,
            'no-map': noMap,
            candidates: candidatesCount,
            all: enabled + noMap + candidatesCount,
        }
    }, [curated, candidates])

    const visibleRows = useMemo(() => {
        const matchesFilter = (r: CatalogRow): boolean => {
            switch (filter) {
                case 'enabled':
                    return r.curated && r.hasMap === true
                case 'no-map':
                    return r.curated && r.hasMap === false
                case 'candidates':
                    return !r.curated
                case 'all':
                    return true
            }
        }
        const q = search.trim().toLowerCase()
        return allRows.filter(
            (r) =>
                matchesFilter(r) &&
                (!q ||
                    r.name.toLowerCase().includes(q) ||
                    (r.developer ?? '').toLowerCase().includes(q)),
        )
    }, [allRows, filter, search])

    // The effective selection is the raw user selection intersected with the
    // currently-visible rows — derived during render so an id hidden by the
    // active filter/search never leaks into the bulk-action count, without
    // mirroring it back into state via an effect.
    const selected = useMemo(() => {
        if (rawSelected.size === 0) return rawSelected
        const visibleIds = new Set(visibleRows.map((r) => r.id))
        const next = new Set<number>()
        rawSelected.forEach((id) => {
            if (visibleIds.has(id)) next.add(id)
        })
        return next.size === rawSelected.size ? rawSelected : next
    }, [rawSelected, visibleRows])

    const setSelected = setRawSelected

    const toggleSelect = (id: number) => {
        setRawSelected((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const selectAllVisible = () => {
        if (selected.size === visibleRows.length && visibleRows.length > 0) {
            setRawSelected(new Set())
        } else {
            setRawSelected(new Set(visibleRows.map((r) => r.id)))
        }
    }

    // Bulk curate / un-curate. Mixed selections are allowed — the verb
    // determines the target state for every row.
    const applyBulk = async (target: boolean) => {
        if (selected.size === 0) return
        dispatchOps({ type: 'bulkBusy', value: true })
        setMessage(null)
        setError(null)
        try {
            const items = [...selected].map((gameId) => ({ gameId, curated: target }))
            const data = await fetchJson<{ updated: number; notFound: number }>(
                '/api/admin/geo/curated/bulk',
                {
                    method: 'POST',
                    body: JSON.stringify({ items }),
                },
            )
            setMessage(
                t(
                    target
                        ? 'admin.geo.catalog.bulk.curatedMessage'
                        : 'admin.geo.catalog.bulk.removedMessage',
                    { count: data.updated },
                ),
            )
            setSelected(new Set())
            // If the side-panel target just lost its curated state, drop it.
            if (!target && selectedId !== null && selected.has(selectedId)) {
                clearSelection()
            }
            await reload()
        } catch (e) {
            setError(getApiErrorMessage(e))
        } finally {
            dispatchOps({ type: 'bulkBusy', value: false })
        }
    }

    return {
        // state slices
        curated,
        candidates,
        loading,
        selectedId,
        sources,
        sourcesLoading,
        filter,
        search,
        feedback,
        ops,
        addMapFor,
        resetOpen,
        uncurateFor,
        // derived
        selected,
        selectedGame,
        allRows,
        counts,
        visibleRows,
        // handlers
        reload,
        reloadSources,
        reimport,
        onAddMapSuccess,
        openAddMap,
        selectGame,
        clearSelection,
        handleRetryTier,
        handleRunTierNow,
        handleActivateMap,
        handleDisableMap,
        handleSetCaptureDefault,
        handleUpdateRegion,
        handleUncurate,
        handleResetScraping,
        toggleSelect,
        selectAllVisible,
        applyBulk,
        setFilter,
        setSearch,
        setSelected,
        setAddMapFor,
        setResetOpen,
        setUncurateFor,
    }
}
