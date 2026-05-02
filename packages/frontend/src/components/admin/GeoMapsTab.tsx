import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Loader2,
    RefreshCw,
    Upload,
    RotateCw,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Clock,
    MinusCircle,
    Sparkles,
    Trash2,
    Play,
    Zap,
    Search,
    RefreshCcw,
    ListChecks,
} from 'lucide-react'
import { GeoManualMapDialog } from './GeoManualMapDialog'
import { GeoWandMapDialog } from './GeoWandMapDialog'
import { GeoResearchAssistantDialog } from './GeoResearchAssistantDialog'
import { ResetScrapingDialog } from './ResetScrapingDialog'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    isGameInFlight,
    tiersInFlightForGame,
    type GeoRunStatePayload,
} from '@/hooks/useGeoRunPolling'
import { useIsMobile } from '@/hooks/useIsMobile'
import { fetchAdminJson as fetchJson } from '@/lib/api/admin'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet'

// Per-game ingestion-state surface. Replaces the global metric-tile grid +
// failures table from GeoAdminActions with a focused, drill-down table where
// each row's side panel shows which of the four geo_map ingestion tiers
// (registry / fandom / wikidata / manual) ran or would run next, and why
// any failed. Triage flow: scan rows for ⚠/✗, click row, side panel
// explains the cascade state, fix via "Re-run" or "Upload manually".

interface CuratedGame {
    id: number
    name: string
    slug: string
    metadataStatus: 'pending' | 'resolved' | 'unresolved'
    hasMap: boolean
    candidateCount: number
}

interface ActiveMapInfo {
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

type TierKey =
    | 'registry'
    | 'fandom'
    | 'strategywiki'
    | 'fextralife'
    | 'wand'
    | 'wikidata'
    | 'manual'

interface TierCandidate {
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

type TierStateBase = { tier: TierKey }
type TierState =
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

interface SourcesResponse {
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


interface GeoMapsTabProps {
    // The run-progress hook is owned by the parent (GeoReviewPanel) so that
    // polling and the live banner survive when an admin switches between
    // Pins / Maps / Games tabs mid-run.
    runState: GeoRunStatePayload | null
    runError: string | null
    armRunPolling: (windowMs?: number) => void
    /**
     * Deep-link from the Maps side panel into the Pins tab pre-filtered
     * to the selected game's screenshot candidates. Owned by the parent
     * because tab state and the candidate list filter live there.
     */
    onViewCaptures?: (gameId: number, gameName: string) => void
}

export function GeoMapsTab({
    runState,
    runError,
    armRunPolling,
    onViewCaptures,
}: GeoMapsTabProps) {
    const { t } = useTranslation()
    const isMobile = useIsMobile()
    const [games, setGames] = useState<CuratedGame[] | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [selectedId, setSelectedId] = useState<number | null>(null)
    const [sources, setSources] = useState<SourcesResponse | null>(null)
    const [sourcesLoading, setSourcesLoading] = useState(false)
    const [busyAction, setBusyAction] = useState<'reimport' | null>(null)
    const [message, setMessage] = useState<string | null>(null)
    const [manualUploadFor, setManualUploadFor] = useState<CuratedGame | null>(null)
    const [wandImportFor, setWandImportFor] = useState<CuratedGame | null>(null)
    const [researchFor, setResearchFor] = useState<CuratedGame | null>(null)
    const [resetOpen, setResetOpen] = useState(false)
    const [resetting, setResetting] = useState(false)
    const [uncurateFor, setUncurateFor] = useState<CuratedGame | null>(null)
    const [uncurating, setUncurating] = useState(false)
    const [runningAll, setRunningAll] = useState(false)
    const [runningGameId, setRunningGameId] = useState<number | null>(null)
    const [retryingTier, setRetryingTier] = useState<string | null>(null)
    const [runningTier, setRunningTier] = useState<string | null>(null)
    const [activatingMapId, setActivatingMapId] = useState<number | null>(null)

    const reload = useCallback(async () => {
        setLoading(true)
        try {
            const data = await fetchJson<{ games: CuratedGame[] }>(
                '/api/admin/geo/games?curated=true&limit=100',
            )
            setGames(data.games)
        } catch (e) {
            setError(String(e))
        } finally {
            setLoading(false)
        }
    }, [])

    const reloadSources = useCallback(async (gameId: number) => {
        setSourcesLoading(true)
        try {
            const data = await fetchJson<SourcesResponse>(
                `/api/admin/geo/games/${gameId}/sources`,
            )
            setSources(data)
        } catch (e) {
            setError(String(e))
            setSources(null)
        } finally {
            setSourcesLoading(false)
        }
    }, [])

    useEffect(() => {
        void reload()
    }, [reload])

    useEffect(() => {
        // Clear immediately on selection change so the side panel doesn't
        // flash the previous game's name/preview while the next sources
        // request is in flight (S2 from the audit).
        setSources(null)
        if (selectedId !== null) void reloadSources(selectedId)
    }, [selectedId, reloadSources])

    const reimport = async (game: CuratedGame) => {
        setBusyAction('reimport')
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
            setError(String(e))
        } finally {
            setBusyAction(null)
        }
    }

    const onManualSuccess = () => {
        setMessage(
            t('admin.geo.manualMap.success', {
                name: manualUploadFor?.name ?? '',
            }),
        )
        const id = manualUploadFor?.id
        void Promise.all([reload(), id !== undefined ? reloadSources(id) : Promise.resolve()])
    }

    const onWandSuccess = () => {
        setMessage(
            t('admin.geo.wandMap.success', {
                name: wandImportFor?.name ?? '',
            }),
        )
        const id = wandImportFor?.id
        void Promise.all([reload(), id !== undefined ? reloadSources(id) : Promise.resolve()])
    }

    // Auto-refresh the games list once a run finishes — a game flipping from
    // 'pending' → 'resolved' or gaining `hasMap` is invisible until we re-fetch.
    const wasActiveRef = useRef(false)
    useEffect(() => {
        const active = runState?.isActive ?? false
        if (wasActiveRef.current && !active) {
            void reload()
            if (selectedId !== null) void reloadSources(selectedId)
        }
        wasActiveRef.current = active
    }, [runState?.isActive, reload, reloadSources, selectedId])

    const handleRunAll = async () => {
        setRunningAll(true)
        setMessage(null)
        setError(null)
        try {
            await fetchJson('/api/admin/geo/run', { method: 'POST' })
            setMessage(t('admin.geo.run.allQueued'))
            armRunPolling()
        } catch (e) {
            setError(String(e))
        } finally {
            setRunningAll(false)
        }
    }

    const handleRunGame = async (game: CuratedGame) => {
        setRunningGameId(game.id)
        setMessage(null)
        setError(null)
        try {
            await fetchJson(`/api/admin/geo/run/${game.id}`, { method: 'POST' })
            setMessage(t('admin.geo.run.gameQueued', { name: game.name }))
            armRunPolling()
        } catch (e) {
            setError(String(e))
        } finally {
            setRunningGameId(null)
        }
    }

    const handleRetryTier = async (gameId: number, tier: string) => {
        setRetryingTier(tier)
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
            setError(String(e))
        } finally {
            setRetryingTier(null)
        }
    }

    const handleRunTierNow = async (gameId: number, tier: string) => {
        setRunningTier(tier)
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
            setError(String(e))
        } finally {
            setRunningTier(null)
        }
    }

    // Multi-map mode: "activate" a map = enable it. The legacy endpoint
    // (`/active-map`) is kept on the backend as an alias; this path uses
    // the explicit enable so multiple maps can be enabled in turn.
    const handleActivateMap = async (gameId: number, mapId: number) => {
        setActivatingMapId(mapId)
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
            setError(String(e))
        } finally {
            setActivatingMapId(null)
        }
    }

    const handleDisableMap = async (gameId: number, mapId: number) => {
        setActivatingMapId(mapId)
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
            const message = String(e)
            if (message.includes('LAST_ENABLED')) {
                setError(
                    t(
                        'admin.geo.maps.multi.disableLastBlocked',
                        'Cannot disable the last enabled map for a game.',
                    ),
                )
            } else {
                setError(message)
            }
        } finally {
            setActivatingMapId(null)
        }
    }

    const handleSetCaptureDefault = async (gameId: number, mapId: number) => {
        setActivatingMapId(mapId)
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
            setError(String(e))
        } finally {
            setActivatingMapId(null)
        }
    }

    const handleUpdateRegion = async (
        gameId: number,
        mapId: number,
        region: string | null,
    ) => {
        setActivatingMapId(mapId)
        setMessage(null)
        setError(null)
        try {
            await fetchJson(`/api/admin/geo/maps/${mapId}`, {
                method: 'PATCH',
                body: JSON.stringify({ region }),
            })
            await reloadSources(gameId)
        } catch (e) {
            setError(String(e))
        } finally {
            setActivatingMapId(null)
        }
    }

    // Drop a game from the curated set straight from the Maps panel so an
    // operator who notices a wrong pick (low quality, no map) can retire it
    // without switching to the Games sub-tab. Backend flips `geo_curated`
    // off; the row falls out of the curated list on the next reload.
    const handleUncurate = async (game: CuratedGame) => {
        setUncurating(true)
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
                setSelectedId(null)
                setSources(null)
            }
            await reload()
        } catch (e) {
            setError(String(e))
        } finally {
            setUncurating(false)
        }
    }

    const handleResetScraping = async () => {
        setResetting(true)
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
            setSelectedId(null)
            setSources(null)
            await reload()
        } catch (e) {
            setError(String(e))
        } finally {
            setResetting(false)
        }
    }

    const selectedGame = games?.find((g) => g.id === selectedId) ?? null

    return (
        <div className="space-y-4">
        <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-5">
            {/* Left: per-game table */}
            <Card className="lg:col-span-3">
                <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <CardTitle className="text-sm">
                                {t('admin.geo.maps.title')}
                            </CardTitle>
                            <CardDescription className="text-xs">
                                {t('admin.geo.maps.subtitle')}
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-1">
                            <Button
                                size="sm"
                                variant="default"
                                onClick={() => void handleRunAll()}
                                disabled={runningAll || runState?.isActive}
                                className="h-7 gap-1.5 text-xs"
                                title={t('admin.geo.run.allTooltip')}
                            >
                                {runningAll || runState?.isActive ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Zap className="h-3.5 w-3.5" />
                                )}
                                {runState?.isActive
                                    ? t('admin.geo.run.running')
                                    : t('admin.geo.run.allCta')}
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void reload()}
                                disabled={loading}
                                aria-label={t('admin.geo.maps.refresh')}
                                className="h-7 w-7 p-0"
                            >
                                <RefreshCw
                                    className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
                                />
                            </Button>
                        </div>
                    </div>
                    {runError && (
                        <p className="text-[11px] text-destructive" role="alert">
                            {runError}
                        </p>
                    )}
                </CardHeader>
                <CardContent className="p-0">
                    {message && (
                        <div className="mx-4 mb-3 rounded border border-success/40 bg-success/10 p-2 text-xs text-success">
                            {message}
                        </div>
                    )}
                    {error && (
                        <div className="mx-4 mb-3 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                            {error}
                        </div>
                    )}
                    {loading && games === null ? (
                        <div
                            className="flex justify-center py-12"
                            role="status"
                            aria-live="polite"
                            aria-busy="true"
                            aria-label={t('admin.geo.maps.loading')}
                        >
                            <Loader2
                                className="h-5 w-5 animate-spin text-muted-foreground"
                                aria-hidden
                            />
                        </div>
                    ) : games && games.length > 0 ? (
                        <ul className="divide-y divide-border/40">
                            {games.map((g) => {
                                const inflight = isGameInFlight(runState, g.id)
                                const isThisRunning = runningGameId === g.id
                                return (
                                <li
                                    key={g.id}
                                    className={`px-4 py-2.5 text-xs cursor-pointer transition-colors ${
                                        selectedId === g.id
                                            ? 'bg-muted/40'
                                            : 'hover:bg-muted/20'
                                    }`}
                                    onClick={() => setSelectedId(g.id)}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-medium truncate">
                                            {g.name}
                                        </span>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            {inflight && (
                                                <Badge
                                                    variant="outline"
                                                    className="gap-1 text-[10px] px-1.5 py-0 border-neon-pink/40 text-neon-pink"
                                                >
                                                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                                    {t('admin.geo.run.inFlight')}
                                                </Badge>
                                            )}
                                            <MapStatusBadge game={g} t={t} />
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                disabled={isThisRunning || inflight}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    void handleRunGame(g)
                                                }}
                                                aria-label={t('admin.geo.run.gameAria', {
                                                    name: g.name,
                                                })}
                                                title={t('admin.geo.run.gameTooltip')}
                                                className="h-6 w-6 p-0"
                                            >
                                                {isThisRunning ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                    <Play className="h-3 w-3" />
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                </li>
                                )
                            })}
                        </ul>
                    ) : (
                        <p className="px-4 py-6 text-xs text-muted-foreground">
                            {t('admin.geo.maps.empty')}
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Desktop: tier-cascade side panel docked next to the list. */}
            <Card className="hidden lg:block lg:col-span-2">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm">
                        {selectedGame
                            ? selectedGame.name
                            : t('admin.geo.maps.sidePanel.empty')}
                    </CardTitle>
                    <SidePanelDescription
                        selected={selectedGame !== null}
                        sources={sources}
                        t={t}
                    />
                </CardHeader>
                <CardContent className="space-y-3">
                    <SidePanelBody
                        selectedGame={selectedGame}
                        sources={sources}
                        sourcesLoading={sourcesLoading}
                        runState={runState}
                        retryingTier={retryingTier}
                        runningTier={runningTier}
                        activatingMapId={activatingMapId}
                        busyAction={busyAction}
                        onRetryTier={handleRetryTier}
                        onRunTierNow={handleRunTierNow}
                        onActivateMap={handleActivateMap}
                        onDisableMap={handleDisableMap}
                        onSetCaptureDefault={handleSetCaptureDefault}
                        onUpdateRegion={handleUpdateRegion}
                        onReimport={reimport}
                        onResearch={setResearchFor}
                        onWandImport={setWandImportFor}
                        onManualUpload={setManualUploadFor}
                        onUncurate={setUncurateFor}
                        onViewCaptures={onViewCaptures}
                        t={t}
                    />
                </CardContent>
            </Card>

            {/* Mobile: same panel surfaced as a bottom drawer when a row is tapped. */}
            <Sheet
                open={isMobile && selectedId !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setSelectedId(null)
                        setSources(null)
                    }
                }}
            >
                <SheetContent
                    side="bottom"
                    className="lg:hidden h-[92vh] p-0 flex flex-col gap-0 rounded-t-xl"
                >
                    <SheetHeader className="px-4 py-3 border-b border-border/40 text-left">
                        <SheetTitle className="text-sm font-semibold">
                            {selectedGame
                                ? selectedGame.name
                                : t('admin.geo.maps.sidePanel.empty')}
                        </SheetTitle>
                        {selectedGame && sources?.activeMap && (
                            <SheetDescription className="text-xs">
                                {t('admin.geo.maps.sidePanel.activeViaTier', {
                                    tier: t(`admin.geo.maps.tiers.${sources.activeMap.source}`),
                                    license: sources.activeMap.license,
                                })}
                                {sources.activeMap.region && (
                                    <span className="ml-1 text-muted-foreground">
                                        {' · '}
                                        {t('admin.geo.maps.sidePanel.region', {
                                            region: sources.activeMap.region,
                                        })}
                                    </span>
                                )}
                            </SheetDescription>
                        )}
                        {selectedGame && sources && !sources.activeMap && (
                            <SheetDescription className="text-xs text-warning">
                                {t('admin.geo.maps.sidePanel.noActive')}
                            </SheetDescription>
                        )}
                    </SheetHeader>
                    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
                        <SidePanelBody
                            selectedGame={selectedGame}
                            sources={sources}
                            sourcesLoading={sourcesLoading}
                            runState={runState}
                            retryingTier={retryingTier}
                            runningTier={runningTier}
                            activatingMapId={activatingMapId}
                            busyAction={busyAction}
                            onRetryTier={handleRetryTier}
                            onRunTierNow={handleRunTierNow}
                            onActivateMap={handleActivateMap}
                            onDisableMap={handleDisableMap}
                            onSetCaptureDefault={handleSetCaptureDefault}
                            onUpdateRegion={handleUpdateRegion}
                            onReimport={reimport}
                            onResearch={setResearchFor}
                            onWandImport={setWandImportFor}
                            onManualUpload={setManualUploadFor}
                            onUncurate={setUncurateFor}
                            onViewCaptures={onViewCaptures}
                            t={t}
                        />
                    </div>
                </SheetContent>
            </Sheet>

            <GeoManualMapDialog
                isOpen={manualUploadFor !== null}
                onClose={() => setManualUploadFor(null)}
                game={
                    manualUploadFor && {
                        id: manualUploadFor.id,
                        name: manualUploadFor.name,
                        hasMap: manualUploadFor.hasMap,
                    }
                }
                onSuccess={onManualSuccess}
            />

            <GeoWandMapDialog
                isOpen={wandImportFor !== null}
                onClose={() => setWandImportFor(null)}
                game={
                    wandImportFor && {
                        id: wandImportFor.id,
                        name: wandImportFor.name,
                        slug: wandImportFor.slug,
                        hasMap: wandImportFor.hasMap,
                    }
                }
                onSuccess={onWandSuccess}
            />

            <GeoResearchAssistantDialog
                isOpen={researchFor !== null}
                onClose={() => setResearchFor(null)}
                game={
                    researchFor && {
                        id: researchFor.id,
                        name: researchFor.name,
                        slug: researchFor.slug,
                    }
                }
                onPickManualUpload={() => setManualUploadFor(researchFor)}
            />
        </div>

        {/* Danger zone: wipes scraping progress + scraped maps so the
            ingestion pipeline starts from zero. Curation flags
            (games.geo_curated) and player scores are preserved. */}
        <Card className="border-destructive/40 bg-destructive/5">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
                    {t('admin.geo.reset.title')}
                </CardTitle>
                <CardDescription className="text-xs">
                    {t('admin.geo.reset.subtitle')}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setResetOpen(true)}
                    disabled={resetting}
                    className="gap-1.5"
                >
                    {resetting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                    )}
                    {t('admin.geo.reset.cta')}
                </Button>
            </CardContent>
        </Card>

        <ResetScrapingDialog
            isOpen={resetOpen}
            onClose={() => setResetOpen(false)}
            onConfirm={handleResetScraping}
            isLoading={resetting}
        />

        <Dialog
            open={uncurateFor !== null}
            onOpenChange={(open) => !uncurating && !open && setUncurateFor(null)}
        >
            <DialogContent className="max-w-sm sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        {t('admin.geo.maps.uncurate.dialog.title')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('admin.geo.maps.uncurate.dialog.description', {
                            name: uncurateFor?.name ?? '',
                        })}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
                    <Button
                        variant="outline"
                        onClick={() => setUncurateFor(null)}
                        disabled={uncurating}
                    >
                        {t('admin.geo.maps.uncurate.dialog.cancel')}
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={() => uncurateFor && void handleUncurate(uncurateFor)}
                        disabled={uncurating}
                    >
                        {uncurating && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                        )}
                        {t('admin.geo.maps.uncurate.dialog.confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        </div>
    )
}

// Renders the description line under the side panel title (active tier +
// license, or "no active map" warning). Shared by the desktop card header
// and the mobile sheet header so both surfaces stay in lock-step.
function SidePanelDescription({
    selected,
    sources,
    t,
}: {
    selected: boolean
    sources: SourcesResponse | null
    t: ReturnType<typeof useTranslation>['t']
}) {
    if (!selected) return null
    if (sources?.activeMap) {
        return (
            <CardDescription className="text-xs">
                {t('admin.geo.maps.sidePanel.activeViaTier', {
                    tier: t(`admin.geo.maps.tiers.${sources.activeMap.source}`),
                    license: sources.activeMap.license,
                })}
                {sources.activeMap.region && (
                    <span className="ml-1 text-muted-foreground">
                        {' · '}
                        {t('admin.geo.maps.sidePanel.region', {
                            region: sources.activeMap.region,
                        })}
                    </span>
                )}
            </CardDescription>
        )
    }
    if (sources && !sources.activeMap) {
        return (
            <CardDescription className="text-xs text-warning">
                {t('admin.geo.maps.sidePanel.noActive')}
            </CardDescription>
        )
    }
    return null
}

interface SidePanelBodyProps {
    selectedGame: CuratedGame | null
    sources: SourcesResponse | null
    sourcesLoading: boolean
    runState: GeoRunStatePayload | null
    retryingTier: string | null
    runningTier: string | null
    activatingMapId: number | null
    busyAction: 'reimport' | null
    onRetryTier: (gameId: number, tier: string) => void | Promise<void>
    onRunTierNow: (gameId: number, tier: string) => void | Promise<void>
    onActivateMap: (gameId: number, mapId: number) => void | Promise<void>
    onDisableMap: (gameId: number, mapId: number) => void | Promise<void>
    onSetCaptureDefault: (gameId: number, mapId: number) => void | Promise<void>
    onUpdateRegion: (
        gameId: number,
        mapId: number,
        region: string | null,
    ) => void | Promise<void>
    onReimport: (game: CuratedGame) => void | Promise<void>
    onResearch: (game: CuratedGame) => void
    onWandImport: (game: CuratedGame) => void
    onManualUpload: (game: CuratedGame) => void
    onUncurate: (game: CuratedGame) => void
    onViewCaptures?: (gameId: number, gameName: string) => void
    t: ReturnType<typeof useTranslation>['t']
}

// Inner content of the tier-cascade side panel — extracted so the desktop
// docked card and the mobile bottom sheet render the exact same body.
function SidePanelBody({
    selectedGame,
    sources,
    sourcesLoading,
    runState,
    retryingTier,
    runningTier,
    activatingMapId,
    busyAction,
    onRetryTier,
    onRunTierNow,
    onActivateMap,
    onDisableMap,
    onSetCaptureDefault,
    onUpdateRegion,
    onReimport,
    onResearch,
    onWandImport,
    onManualUpload,
    onUncurate,
    onViewCaptures,
    t,
}: SidePanelBodyProps) {
    if (!selectedGame) {
        return (
            <p className="text-xs text-muted-foreground">
                {t('admin.geo.maps.sidePanel.hint')}
            </p>
        )
    }
    if (sourcesLoading && !sources) {
        return (
            <div
                className="flex justify-center py-6"
                role="status"
                aria-live="polite"
                aria-busy="true"
                aria-label={t('admin.geo.maps.sidePanel.loading')}
            >
                <Loader2
                    className="h-4 w-4 animate-spin text-muted-foreground"
                    aria-hidden
                />
            </div>
        )
    }
    if (!sources) return null
    const enabledMaps = sources.enabledMaps ?? (sources.activeMap ? [sources.activeMap] : [])
    return (
        <>
            <EnabledMapsPanel
                gameId={sources.gameId}
                enabledMaps={enabledMaps}
                activatingMapId={activatingMapId}
                onDisable={onDisableMap}
                onSetCaptureDefault={onSetCaptureDefault}
                onUpdateRegion={onUpdateRegion}
                t={t}
            />
            <ol className="space-y-2">
                {sources.sources.map((s) => {
                    const tiers = tiersInFlightForGame(runState, sources.gameId)
                    // 'manual' is operator-uploaded, never a background job —
                    // never flag it running.
                    const running =
                        s.tier !== 'manual' &&
                        tiers.has(
                            s.tier as
                                | 'registry'
                                | 'fandom'
                                | 'strategywiki'
                                | 'fextralife'
                                | 'wikidata',
                        )
                    return (
                        <TierRow
                            key={s.tier}
                            state={s}
                            t={t}
                            running={running}
                            onRetry={
                                s.tier !== 'manual'
                                    ? () => void onRetryTier(sources.gameId, s.tier)
                                    : undefined
                            }
                            retrying={retryingTier === s.tier}
                            onRunNow={
                                s.tier !== 'manual'
                                    ? () => void onRunTierNow(sources.gameId, s.tier)
                                    : undefined
                            }
                            runningNow={runningTier === s.tier}
                            onActivate={(mapId) =>
                                void onActivateMap(sources.gameId, mapId)
                            }
                            activatingMapId={activatingMapId}
                        />
                    )
                })}
            </ol>
            <div className="flex flex-col gap-2 border-t border-border/40 pt-3 sm:flex-row">
                <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 border-destructive/40 text-destructive hover:text-destructive hover:bg-destructive/5"
                    disabled={busyAction !== null}
                    onClick={() => void onReimport(selectedGame)}
                    title={t('admin.geo.maps.actions.rerunTooltip')}
                >
                    {busyAction === 'reimport' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : (
                        <RotateCw className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    {t('admin.geo.maps.actions.rerun')}
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => onResearch(selectedGame)}
                    title={t('admin.geo.maps.actions.researchTooltip')}
                >
                    <Search className="h-3.5 w-3.5 mr-1.5" />
                    {t('admin.geo.maps.actions.research')}
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => onWandImport(selectedGame)}
                    title={t('admin.geo.maps.actions.importWandTooltip')}
                >
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    {t('admin.geo.maps.actions.importWand')}
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => onManualUpload(selectedGame)}
                >
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    {t('admin.geo.maps.actions.uploadManual')}
                </Button>
            </div>
            {onViewCaptures && (
                <Button
                    size="sm"
                    variant="ghost"
                    className="w-full justify-center text-xs text-muted-foreground hover:text-foreground"
                    onClick={() =>
                        onViewCaptures(selectedGame.id, selectedGame.name)
                    }
                    title={t('admin.geo.maps.actions.viewCapturesTooltip')}
                >
                    <ListChecks className="h-3.5 w-3.5 mr-1.5" />
                    {t('admin.geo.maps.actions.viewCaptures', {
                        count: selectedGame.candidateCount,
                    })}
                </Button>
            )}
            <Button
                size="sm"
                variant="ghost"
                className="w-full justify-center text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => onUncurate(selectedGame)}
                title={t('admin.geo.maps.actions.uncurateTooltip')}
            >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                {t('admin.geo.maps.actions.uncurate')}
            </Button>
        </>
    )
}

// Multi-map: lists every enabled map for the game with per-map controls
// (disable, promote to capture-default, edit region inline). Renders nothing
// when the game has no enabled map yet — the tier cascade below still
// surfaces the "Use this map" affordance on per-source candidates.
function EnabledMapsPanel({
    gameId,
    enabledMaps,
    activatingMapId,
    onDisable,
    onSetCaptureDefault,
    onUpdateRegion,
    t,
}: {
    gameId: number
    enabledMaps: ActiveMapInfo[]
    activatingMapId: number | null
    onDisable: (gameId: number, mapId: number) => void | Promise<void>
    onSetCaptureDefault: (gameId: number, mapId: number) => void | Promise<void>
    onUpdateRegion: (
        gameId: number,
        mapId: number,
        region: string | null,
    ) => void | Promise<void>
    t: ReturnType<typeof useTranslation>['t']
}) {
    if (enabledMaps.length === 0) return null
    const canDisable = enabledMaps.length > 1
    return (
        <div className="rounded border border-border/40 bg-muted/10 p-2 space-y-2">
            <div className="flex items-baseline justify-between">
                <h4 className="text-xs font-medium">
                    {t('admin.geo.maps.multi.enabledTitle', 'Enabled maps')}
                </h4>
                <span className="text-[10px] text-muted-foreground">
                    {t('admin.geo.maps.multi.enabledCount', {
                        defaultValue: '{{count}} enabled',
                        count: enabledMaps.length,
                    })}
                </span>
            </div>
            <ul className="space-y-1.5">
                {enabledMaps.map((m) => (
                    <EnabledMapRow
                        key={m.id}
                        gameId={gameId}
                        map={m}
                        canDisable={canDisable}
                        busy={activatingMapId === m.id}
                        onDisable={onDisable}
                        onSetCaptureDefault={onSetCaptureDefault}
                        onUpdateRegion={onUpdateRegion}
                        t={t}
                    />
                ))}
            </ul>
        </div>
    )
}

function EnabledMapRow({
    gameId,
    map,
    canDisable,
    busy,
    onDisable,
    onSetCaptureDefault,
    onUpdateRegion,
    t,
}: {
    gameId: number
    map: ActiveMapInfo
    canDisable: boolean
    busy: boolean
    onDisable: (gameId: number, mapId: number) => void | Promise<void>
    onSetCaptureDefault: (gameId: number, mapId: number) => void | Promise<void>
    onUpdateRegion: (
        gameId: number,
        mapId: number,
        region: string | null,
    ) => void | Promise<void>
    t: ReturnType<typeof useTranslation>['t']
}) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(map.region ?? '')
    const commit = async () => {
        const next = draft.trim() || null
        if ((map.region ?? null) === next) {
            setEditing(false)
            return
        }
        await onUpdateRegion(gameId, map.id, next)
        setEditing(false)
    }
    return (
        <li className="flex items-center gap-2 rounded border border-border/30 bg-background/40 px-2 py-1.5 text-xs">
            <img
                src={map.imageUrl}
                alt=""
                loading="lazy"
                className="h-10 w-10 flex-none rounded object-cover bg-black/40"
            />
            <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-1.5">
                    {editing ? (
                        <input
                            autoFocus
                            value={draft}
                            disabled={busy}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={() => void commit()}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') void commit()
                                else if (e.key === 'Escape') {
                                    setDraft(map.region ?? '')
                                    setEditing(false)
                                }
                            }}
                            placeholder={t(
                                'admin.geo.maps.multi.regionEditPlaceholder',
                                'Region — e.g. Act II',
                            )}
                            className="w-full rounded border border-border/60 bg-background px-1.5 py-0.5 text-[11px]"
                        />
                    ) : (
                        <button
                            type="button"
                            className="truncate text-left font-medium hover:underline"
                            onClick={() => setEditing(true)}
                            title={t('admin.geo.maps.multi.regionEdit', 'Edit region')}
                        >
                            {map.region ??
                                t('geo.daily.chooseMap.worldFallback', 'World map')}
                        </button>
                    )}
                    {map.isCaptureDefault && (
                        <span className="rounded-full border border-neon-pink/40 bg-neon-pink/10 px-1.5 py-px text-[9px] uppercase tracking-wide text-neon-pink">
                            {t(
                                'admin.geo.maps.multi.captureDefaultBadge',
                                'Capture default',
                            )}
                        </span>
                    )}
                </div>
                <p className="truncate text-[10px] text-muted-foreground">
                    {t(`admin.geo.maps.tiers.${map.source}`)}
                </p>
            </div>
            <div className="flex flex-none gap-1">
                {!map.isCaptureDefault && (
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        className="h-6 px-2 text-[10px]"
                        onClick={() => void onSetCaptureDefault(gameId, map.id)}
                        title={t(
                            'admin.geo.maps.multi.setCaptureDefault',
                            'Set as capture default',
                        )}
                    >
                        {t('admin.geo.maps.multi.captureDefaultAction', 'Default')}
                    </Button>
                )}
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy || !canDisable}
                    className="h-6 px-2 text-[10px] text-destructive hover:text-destructive"
                    onClick={() => void onDisable(gameId, map.id)}
                    title={
                        canDisable
                            ? t('admin.geo.maps.multi.disable', 'Disable map')
                            : t(
                                  'admin.geo.maps.multi.disableLastBlocked',
                                  'Cannot disable the last enabled map for a game.',
                              )
                    }
                >
                    {t('admin.geo.maps.multi.disableAction', 'Disable')}
                </Button>
            </div>
        </li>
    )
}

function MapStatusBadge({
    game,
    t,
}: {
    game: CuratedGame
    t: ReturnType<typeof useTranslation>['t']
}) {
    if (game.hasMap) {
        return (
            <Badge variant="success" className="gap-1 text-[10px] px-1.5 py-0">
                <CheckCircle2 className="h-3 w-3" aria-hidden />
                {t('admin.geo.maps.row.hasMap')}
            </Badge>
        )
    }
    if (game.metadataStatus === 'unresolved') {
        return (
            <Badge variant="destructive" className="gap-1 text-[10px] px-1.5 py-0">
                <XCircle className="h-3 w-3" aria-hidden />
                {t('admin.geo.maps.row.failed')}
            </Badge>
        )
    }
    return (
        <Badge variant="warning" className="gap-1 text-[10px] px-1.5 py-0">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            {t('admin.geo.maps.row.noMap')}
        </Badge>
    )
}

function TierRow({
    state,
    t,
    running,
    onRetry,
    retrying,
    onRunNow,
    runningNow,
    onActivate,
    activatingMapId,
}: {
    state: TierState
    t: ReturnType<typeof useTranslation>['t']
    running?: boolean
    onRetry?: () => void
    retrying?: boolean
    onRunNow?: () => void
    runningNow?: boolean
    onActivate?: (mapId: number) => void
    activatingMapId?: number | null
}) {
    const tierLabel = t(`admin.geo.maps.tiers.${state.tier}`)

    // While this tier's job is in flight, override status visuals with a
    // "running" badge so the operator sees live movement instead of a stale
    // matched/eligible/tombstoned label.
    if (running) {
        return (
            <li className="rounded border border-neon-pink/40 bg-neon-pink/5 p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                    <span className="font-medium flex items-center gap-1.5">
                        <Loader2 className="h-3 w-3 animate-spin text-neon-pink" aria-hidden />
                        {tierLabel}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-neon-pink">
                        {t('admin.geo.run.tierRunning')}
                    </span>
                </div>
                <p className="pt-1 text-[11px] text-muted-foreground leading-snug">
                    {t('admin.geo.run.tierRunningHint')}
                </p>
            </li>
        )
    }

    if (state.status === 'matched') {
        const candidates = state.candidates ?? []
        return (
            <li className="rounded border border-success/30 bg-success/5 p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                    <span className="font-medium flex items-center gap-1.5">
                        <Sparkles className="h-3 w-3 text-success" aria-hidden />
                        {tierLabel}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-success">
                        {t('admin.geo.maps.tierStatus.matched')}
                    </span>
                </div>
                <p className="pt-1 text-[11px] text-muted-foreground leading-snug">
                    {state.via}
                    {state.license && ` · ${state.license}`}
                </p>
                {candidates.length > 0 && (
                    <ul className="mt-2 space-y-1.5">
                        {candidates.map((c) => {
                            const activating = activatingMapId === c.id
                            return (
                                <li
                                    key={c.id}
                                    className={`flex gap-2 rounded border p-1.5 ${
                                        c.isActive
                                            ? 'border-success/50 bg-success/10'
                                            : 'border-border/40 bg-background/40'
                                    }`}
                                >
                                    <a
                                        href={c.imageUrl}
                                        target="_blank"
                                        rel="noreferrer noopener"
                                        className="block shrink-0 overflow-hidden rounded bg-black/40"
                                        aria-label={t(
                                            'admin.geo.maps.tierStatus.candidatePreviewAria',
                                        )}
                                    >
                                        <img
                                            src={c.imageUrl}
                                            alt=""
                                            loading="lazy"
                                            className="block h-12 w-16 object-contain"
                                        />
                                    </a>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[10px] text-muted-foreground">
                                            {c.widthPx} × {c.heightPx} px
                                            {c.region && ` · ${c.region}`}
                                        </p>
                                        {c.sourceUrl && (
                                            <a
                                                href={c.sourceUrl}
                                                target="_blank"
                                                rel="noreferrer noopener"
                                                className="text-[10px] text-primary hover:underline"
                                            >
                                                {t('admin.geo.maps.viewSource')}
                                            </a>
                                        )}
                                    </div>
                                    <div className="flex shrink-0 items-center">
                                        {c.isActive ? (
                                            <span className="text-[10px] uppercase tracking-wide text-success px-1.5">
                                                {t(
                                                    'admin.geo.maps.tierStatus.active',
                                                )}
                                            </span>
                                        ) : onActivate ? (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={activating}
                                                onClick={() => onActivate(c.id)}
                                                className="h-6 gap-1 px-2 text-[10px]"
                                                title={t(
                                                    'admin.geo.maps.tierStatus.useThisMapTooltip',
                                                )}
                                            >
                                                {activating ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                    <CheckCircle2 className="h-3 w-3" />
                                                )}
                                                {t(
                                                    'admin.geo.maps.tierStatus.useThisMap',
                                                )}
                                            </Button>
                                        ) : null}
                                    </div>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </li>
        )
    }

    if (state.status === 'tombstoned') {
        const retry = new Date(state.retryAfter)
        return (
            <li className="rounded border border-destructive/30 bg-destructive/5 p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                    <span className="font-medium flex items-center gap-1.5">
                        <XCircle className="h-3 w-3 text-destructive" aria-hidden />
                        {tierLabel}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-destructive">
                        {t('admin.geo.maps.tierStatus.tombstoned', { count: state.attempts })}
                    </span>
                </div>
                <p
                    className="pt-1 text-[11px] text-muted-foreground leading-snug break-words"
                    title={state.reason}
                >
                    {state.reason}
                </p>
                <div className="pt-0.5 flex items-center justify-between gap-2">
                    <p className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" aria-hidden />
                        {t('admin.geo.maps.tierStatus.retryAfter', {
                            time: retry.toLocaleString(),
                        })}
                    </p>
                    {onRetry && (
                        <Button
                            size="sm"
                            variant="ghost"
                            disabled={retrying}
                            onClick={onRetry}
                            className="h-6 gap-1 px-2 text-[10px] text-destructive hover:text-destructive"
                            title={t('admin.geo.maps.tierStatus.retryNowTooltip')}
                        >
                            {retrying ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                                <RefreshCcw className="h-3 w-3" />
                            )}
                            {t('admin.geo.maps.tierStatus.retryNow')}
                        </Button>
                    )}
                </div>
            </li>
        )
    }

    if (state.status === 'eligible') {
        return (
            <li className="rounded border border-warning/30 bg-warning/5 p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                    <span className="font-medium flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-warning" aria-hidden />
                        {tierLabel}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-warning">
                        {t('admin.geo.maps.tierStatus.eligible')}
                    </span>
                </div>
                <div className="pt-1 flex items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground leading-snug">
                        {t('admin.geo.maps.tierStatus.eligibleHint')}
                    </p>
                    {onRunNow && (
                        <Button
                            size="sm"
                            variant="ghost"
                            disabled={runningNow}
                            onClick={onRunNow}
                            className="h-6 gap-1 px-2 text-[10px] text-warning hover:text-warning"
                            title={t('admin.geo.maps.tierStatus.runNowTooltip')}
                        >
                            {runningNow ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                                <Play className="h-3 w-3" />
                            )}
                            {t('admin.geo.maps.tierStatus.runNow')}
                        </Button>
                    )}
                </div>
            </li>
        )
    }

    // untried
    return (
        <li className="rounded border border-border/40 bg-muted/10 p-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
                <span className="font-medium flex items-center gap-1.5 text-muted-foreground">
                    <MinusCircle className="h-3 w-3" aria-hidden />
                    {tierLabel}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t('admin.geo.maps.tierStatus.untried')}
                </span>
            </div>
            {state.reason && (
                <p className="pt-1 text-[11px] text-muted-foreground leading-snug">
                    {state.reason}
                </p>
            )}
        </li>
    )
}
