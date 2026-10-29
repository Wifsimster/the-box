import { useCallback, useEffect, useEffectEvent, useMemo, useReducer, useState } from 'react'
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
    const [data, setData] = useState<{
        curated: CuratedGame[] | null
        candidates: CatalogRow[] | null
        loading: boolean
    }>({ curated: null, candidates: null, loading: true })
    const { curated, candidates, loading } = data

    const [panel, setPanel] = useState<{
        selectedId: number | null
        sources: SourcesResponse | null
        sourcesLoading: boolean
    }>({ selectedId: null, sources: null, sourcesLoading: false })
    // oxlint-disable-next-line react-doctor/no-event-handler
    const { selectedId, sources, sourcesLoading } = panel

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

    const [ops, dispatchOps] = useReducer(opsReducer, INITIAL_OPS)

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

    const fetchCatalog = useCallback(
        () =>
            Promise.all([
                fetchJson<{ games: CuratedGame[] }>(
                    '/api/admin/geo/games?curated=true&limit=200',
                ),
                fetchJson<{ games: Omit<CatalogRow, 'curated'>[] }>(
                    '/api/admin/geo/games?curated=false&limit=200',
                ),
            ]).then(
                ([c, k]) => {
                    setData((d) => ({
                        ...d,
                        curated: c.games,
                        candidates: k.games.map((g) => ({ ...g, curated: false })),
                        loading: false,
                    }))
                },
                (e) => {
                    setError(getApiErrorMessage(e))
                    setData((d) => ({ ...d, loading: false }))
                },
            ),
        [setError],
    )

    const fetchSources = useCallback(
        (gameId: number) =>
            fetchJson<SourcesResponse>(`/api/admin/geo/games/${gameId}/sources`).then(
                (sourcesData) => {
                    setPanel((p) => ({ ...p, sources: sourcesData, sourcesLoading: false }))
                },
                (e) => {
                    setError(getApiErrorMessage(e))
                    setPanel((p) => ({ ...p, sources: null, sourcesLoading: false }))
                },
            ),
        [setError],
    )

    const reload = useCallback(() => {
        setData((d) => ({ ...d, loading: true }))
        return fetchCatalog()
    }, [fetchCatalog])

    const reloadSources = useCallback(
        (gameId: number) => {
            setPanel((p) => ({ ...p, sourcesLoading: true }))
            return fetchSources(gameId)
        },
        [fetchSources],
    )

    useEffect(() => {
        void fetchCatalog()
    }, [fetchCatalog])

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
        const messageKey =
            strategy === 'wand' ? 'admin.geo.wandMap.success' : 'admin.geo.manualMap.success'
        setMessage(t(messageKey, { name: game.name }))
        void Promise.all([reload(), reloadSources(game.id)])
    }

    const openAddMap = (strategy: AddMapStrategy) => (game: CuratedGame) =>
        setAddMapFor({ game, strategy })

    const runActive = runState?.isActive ?? false
    const [prevRunActive, setPrevRunActive] = useState(runActive)
    const [runSettledCount, setRunSettledCount] = useState(0)
    if (prevRunActive !== runActive) {
        setPrevRunActive(runActive)
        if (prevRunActive && !runActive) {
            setData((d) => ({ ...d, loading: true }))
            if (selectedId !== null) setPanel((p) => ({ ...p, sourcesLoading: true }))
            setRunSettledCount((n) => n + 1)
        }
    }
    const refetchAfterRun = useEffectEvent(() => {
        void fetchCatalog()
        if (selectedId !== null) void fetchSources(selectedId)
    })
    useEffect(() => {
        if (runSettledCount > 0) refetchAfterRun()
    }, [runSettledCount])

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
        selected,
        selectedGame,
        allRows,
        counts,
        visibleRows,
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
