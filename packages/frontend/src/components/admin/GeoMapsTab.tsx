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
    ArrowUpRight,
    Clock,
    MinusCircle,
    Sparkles,
    Trash2,
    Play,
    Search,
    RefreshCcw,
    ListChecks,
    MoreHorizontal,
    Target,
} from 'lucide-react'
import { AddMapDialog, type AddMapStrategy } from './AddMapDialog'
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
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    isGameInFlight,
    tiersInFlightForGame,
    type GeoRunStatePayload,
} from '@/hooks/useGeoRunPolling'
import { useIsMobile } from '@/hooks/useIsMobile'
import { fetchAdminJson as fetchJson } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api-errors'
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
    mapCount: number
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
    /**
     * Deep-link out of the Catalog into the Acquisition sub-tab. Replaces
     * the bulk "Tout lancer" + per-row ▶ controls that used to live here
     * and duplicated the Acquisition entry-point — the Catalog stays a
     * read-and-curate surface; ingestion is run from one place.
     */
    onGoToAcquisition?: () => void
}

export function GeoMapsTab({
    runState,
    runError,
    armRunPolling,
    onViewCaptures,
    onGoToAcquisition,
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
    // One state for the unified Add-Map dialog. The three side-panel
    // buttons (Research, Wand, Manual) all open it, each at its preferred
    // strategy tab; the operator can switch tabs without closing.
    const [addMapFor, setAddMapFor] = useState<
        { game: CuratedGame; strategy: AddMapStrategy } | null
    >(null)
    const [resetOpen, setResetOpen] = useState(false)
    const [resetting, setResetting] = useState(false)
    const [uncurateFor, setUncurateFor] = useState<CuratedGame | null>(null)
    const [uncurating, setUncurating] = useState(false)
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
            setError(getApiErrorMessage(e))
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
            setError(getApiErrorMessage(e))
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
            setError(getApiErrorMessage(e))
        } finally {
            setBusyAction(null)
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
            setError(getApiErrorMessage(e))
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
            setError(getApiErrorMessage(e))
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
            setError(getApiErrorMessage(e))
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
            setError(getApiErrorMessage(e))
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
            setError(getApiErrorMessage(e))
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
            setError(getApiErrorMessage(e))
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
            setError(getApiErrorMessage(e))
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
                            {onGoToAcquisition && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={onGoToAcquisition}
                                    className="h-7 gap-1.5 text-xs"
                                    title={t('admin.geo.maps.goToAcquisitionTooltip')}
                                >
                                    <ArrowUpRight className="h-3.5 w-3.5" />
                                    {t('admin.geo.maps.goToAcquisition')}
                                </Button>
                            )}
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
                                        <span className="font-medium truncate flex items-baseline gap-1.5 min-w-0">
                                            <span className="truncate">{g.name}</span>
                                            <span
                                                className="shrink-0 text-[10px] font-normal text-muted-foreground tabular-nums"
                                                title={t('admin.geo.maps.row.mapCountTooltip')}
                                            >
                                                {t('admin.geo.maps.row.mapCount', {
                                                    count: g.mapCount,
                                                })}
                                            </span>
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
                        onResearch={openAddMap('research')}
                        onWandImport={openAddMap('wand')}
                        onManualUpload={openAddMap('manual')}
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
                            onResearch={openAddMap('research')}
                            onWandImport={openAddMap('wand')}
                            onManualUpload={openAddMap('manual')}
                            onUncurate={setUncurateFor}
                            onViewCaptures={onViewCaptures}
                            t={t}
                        />
                    </div>
                </SheetContent>
            </Sheet>

            <AddMapDialog
                isOpen={addMapFor !== null}
                onClose={() => setAddMapFor(null)}
                game={
                    addMapFor && {
                        id: addMapFor.game.id,
                        name: addMapFor.game.name,
                        slug: addMapFor.game.slug,
                        hasMap: addMapFor.game.hasMap,
                    }
                }
                strategy={addMapFor?.strategy ?? 'research'}
                onStrategyChange={(s) =>
                    setAddMapFor((prev) => (prev ? { ...prev, strategy: s } : prev))
                }
                onSuccess={onAddMapSuccess}
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

// Description line under the side panel title. The active source/license
// is now rendered inside the ActiveMapHero block below, so this only
// surfaces the empty-state warning when no map is active yet.
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
    const captureCount = selectedGame.candidateCount
    return (
        <>
            <ActiveMapHero
                gameId={sources.gameId}
                gameName={selectedGame.name}
                enabledMaps={enabledMaps}
                activatingMapId={activatingMapId}
                captureCount={captureCount}
                onDisable={onDisableMap}
                onSetCaptureDefault={onSetCaptureDefault}
                onUpdateRegion={onUpdateRegion}
                onViewCaptures={
                    onViewCaptures
                        ? () => onViewCaptures(selectedGame.id, selectedGame.name)
                        : undefined
                }
                t={t}
            />

            <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                    <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {t('admin.geo.maps.sidePanel.pipelineTitle')}
                    </h4>
                </div>
                <ol className="overflow-hidden rounded-md border border-border/40 divide-y divide-border/40">
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
            </div>

            <div className="flex items-center gap-2 border-t border-border/40 pt-3">
                <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => onManualUpload(selectedGame)}
                >
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    {t('admin.geo.maps.actions.uploadManual')}
                </Button>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0"
                            aria-label={t('admin.geo.maps.sidePanel.moreActions')}
                            title={t('admin.geo.maps.sidePanel.moreActions')}
                        >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem onSelect={() => onWandImport(selectedGame)}>
                            <Sparkles className="h-3.5 w-3.5 mr-2" />
                            {t('admin.geo.maps.actions.importWand')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onResearch(selectedGame)}>
                            <Search className="h-3.5 w-3.5 mr-2" />
                            {t('admin.geo.maps.actions.research')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            disabled={busyAction !== null}
                            onSelect={() => void onReimport(selectedGame)}
                            className="text-destructive focus:text-destructive"
                        >
                            {busyAction === 'reimport' ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                            ) : (
                                <RotateCw className="h-3.5 w-3.5 mr-2" />
                            )}
                            {t('admin.geo.maps.actions.rerun')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onSelect={() => onUncurate(selectedGame)}
                            className="text-destructive focus:text-destructive"
                        >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            {t('admin.geo.maps.actions.uncurate')}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </>
    )
}

// Hero block at the top of the side panel. Replaces the framed "Cartes
// activées" sub-panel + the redundant "Actif via Niveau X" header line:
// shows a thumbnail-led row for each enabled map with inline region edit,
// capture-target indicator, "Voir captures" link, and an overflow menu
// (set as capture default, disable). Empty when no map is enabled — the
// tier cascade below still surfaces "Use this map" on per-source candidates.
function ActiveMapHero({
    gameId,
    gameName,
    enabledMaps,
    activatingMapId,
    captureCount,
    onDisable,
    onSetCaptureDefault,
    onUpdateRegion,
    onViewCaptures,
    t,
}: {
    gameId: number
    gameName: string
    enabledMaps: ActiveMapInfo[]
    activatingMapId: number | null
    captureCount: number
    onDisable: (gameId: number, mapId: number) => void | Promise<void>
    onSetCaptureDefault: (gameId: number, mapId: number) => void | Promise<void>
    onUpdateRegion: (
        gameId: number,
        mapId: number,
        region: string | null,
    ) => void | Promise<void>
    onViewCaptures?: () => void
    t: ReturnType<typeof useTranslation>['t']
}) {
    if (enabledMaps.length === 0) return null
    const canDisable = enabledMaps.length > 1
    return (
        <ul className="space-y-1.5">
            {enabledMaps.map((m) => (
                <ActiveMapHeroRow
                    key={m.id}
                    gameId={gameId}
                    gameName={gameName}
                    map={m}
                    canDisable={canDisable}
                    busy={activatingMapId === m.id}
                    captureCount={captureCount}
                    onDisable={onDisable}
                    onSetCaptureDefault={onSetCaptureDefault}
                    onUpdateRegion={onUpdateRegion}
                    onViewCaptures={onViewCaptures}
                    t={t}
                />
            ))}
        </ul>
    )
}

function ActiveMapHeroRow({
    gameId,
    gameName,
    map,
    canDisable,
    busy,
    captureCount,
    onDisable,
    onSetCaptureDefault,
    onUpdateRegion,
    onViewCaptures,
    t,
}: {
    gameId: number
    gameName: string
    map: ActiveMapInfo
    canDisable: boolean
    busy: boolean
    captureCount: number
    onDisable: (gameId: number, mapId: number) => void | Promise<void>
    onSetCaptureDefault: (gameId: number, mapId: number) => void | Promise<void>
    onUpdateRegion: (
        gameId: number,
        mapId: number,
        region: string | null,
    ) => void | Promise<void>
    onViewCaptures?: () => void
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
        <li className="flex items-center gap-3 rounded-md border border-success/30 bg-success/5 p-2.5 text-xs">
            <a
                href={map.imageUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="block shrink-0 overflow-hidden rounded bg-black/40"
                aria-label={t('admin.geo.maps.sidePanel.previewAlt', { name: gameName })}
            >
                <img
                    src={map.imageUrl}
                    alt=""
                    loading="lazy"
                    className="h-14 w-20 object-cover"
                />
            </a>
            <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-1.5">
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
                            className="truncate text-left text-sm font-medium hover:underline"
                            onClick={() => setEditing(true)}
                            title={t('admin.geo.maps.multi.regionEdit', 'Edit region')}
                        >
                            {map.region ??
                                t('geo.daily.chooseMap.worldFallback', 'World map')}
                        </button>
                    )}
                    {map.isCaptureDefault && (
                        <span
                            className="inline-flex items-center gap-0.5 rounded-full border border-neon-pink/40 bg-neon-pink/10 px-1.5 py-px text-[9px] uppercase tracking-wide text-neon-pink"
                            title={t(
                                'admin.geo.maps.multi.setCaptureDefault',
                                'Set as capture default',
                            )}
                        >
                            <Target className="h-2.5 w-2.5" aria-hidden />
                            {t(
                                'admin.geo.maps.multi.captureDefaultBadge',
                                'Capture default',
                            )}
                        </span>
                    )}
                </div>
                <p className="truncate text-[10px] text-muted-foreground">
                    {t(`admin.geo.maps.tiers.${map.source}`)}
                    {map.license && ` · ${map.license}`}
                </p>
                {onViewCaptures && (
                    <button
                        type="button"
                        onClick={onViewCaptures}
                        className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                        title={t('admin.geo.maps.actions.viewCapturesTooltip')}
                    >
                        <ListChecks className="h-2.5 w-2.5" aria-hidden />
                        {t('admin.geo.maps.actions.viewCaptures', {
                            count: captureCount,
                        })}
                    </button>
                )}
            </div>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        className="h-7 w-7 flex-none p-0"
                        aria-label={t('admin.geo.maps.sidePanel.moreActions')}
                        title={t('admin.geo.maps.sidePanel.moreActions')}
                    >
                        {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <MoreHorizontal className="h-3.5 w-3.5" />
                        )}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                    {!map.isCaptureDefault && (
                        <DropdownMenuItem
                            onSelect={() => void onSetCaptureDefault(gameId, map.id)}
                        >
                            <Target className="h-3.5 w-3.5 mr-2" />
                            {t(
                                'admin.geo.maps.multi.setCaptureDefault',
                                'Set as capture default',
                            )}
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                        disabled={!canDisable}
                        onSelect={() => void onDisable(gameId, map.id)}
                        className="text-destructive focus:text-destructive"
                    >
                        <XCircle className="h-3.5 w-3.5 mr-2" />
                        {canDisable
                            ? t('admin.geo.maps.multi.disable', 'Disable map')
                            : t(
                                  'admin.geo.maps.multi.disableLastBlocked',
                                  'Cannot disable the last enabled map for a game.',
                              )}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
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

// Visual style for the row's status indicator. One source of truth keeps
// the dot, label color, row tint, and icon aligned across all 5 branches.
type TierVisual = {
    icon: typeof Sparkles
    rowBg: string
    iconColor: string
    labelColor: string
    label: string
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

    // Resolve visual style first so the row chrome stays uniform; per-branch
    // affordances (retry, run-now, candidate list) are layered below.
    let visual: TierVisual
    if (running) {
        visual = {
            icon: Loader2,
            rowBg: 'bg-neon-pink/5',
            iconColor: 'text-neon-pink',
            labelColor: 'text-neon-pink',
            label: t('admin.geo.run.tierRunning'),
        }
    } else if (state.status === 'matched') {
        visual = {
            icon: Sparkles,
            rowBg: 'bg-success/5',
            iconColor: 'text-success',
            labelColor: 'text-success',
            label: t('admin.geo.maps.tierStatus.matched'),
        }
    } else if (state.status === 'tombstoned') {
        visual = {
            icon: XCircle,
            rowBg: '',
            iconColor: 'text-destructive',
            labelColor: 'text-destructive',
            label: t('admin.geo.maps.tierStatus.tombstoned', {
                count: state.attempts,
            }),
        }
    } else if (state.status === 'eligible') {
        visual = {
            icon: Clock,
            rowBg: '',
            iconColor: 'text-warning',
            labelColor: 'text-warning',
            label: t('admin.geo.maps.tierStatus.eligible'),
        }
    } else {
        visual = {
            icon: MinusCircle,
            rowBg: '',
            iconColor: 'text-muted-foreground',
            labelColor: 'text-muted-foreground',
            label: t('admin.geo.maps.tierStatus.untried'),
        }
    }

    const Icon = visual.icon
    const showAction =
        running ||
        (state.status === 'tombstoned' && onRetry) ||
        (state.status === 'eligible' && onRunNow)

    return (
        <li className={`text-xs ${visual.rowBg}`}>
            <div className="flex items-center gap-2 px-2.5 py-1.5">
                <Icon
                    className={`h-3 w-3 shrink-0 ${visual.iconColor} ${
                        running ? 'animate-spin' : ''
                    }`}
                    aria-hidden
                />
                <span className="truncate text-[11px] font-medium">{tierLabel}</span>
                <span
                    className={`ml-auto shrink-0 text-[10px] uppercase tracking-wide ${visual.labelColor}`}
                >
                    {visual.label}
                </span>
                {showAction && (
                    <span className="shrink-0">
                        {state.status === 'tombstoned' && onRetry && !running && (
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
                        {state.status === 'eligible' && onRunNow && !running && (
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
                    </span>
                )}
            </div>
            {/* Per-branch detail line: kept on a second line only when it's
                load-bearing (running hint, matched candidates, tombstone reason +
                retry timer). Untried/eligible remain single-line by default. */}
            {running && (
                <p className="px-2.5 pb-1.5 text-[11px] text-muted-foreground leading-snug">
                    {t('admin.geo.run.tierRunningHint')}
                </p>
            )}
            {!running && state.status === 'matched' && (
                <MatchedTierDetails
                    state={state}
                    onActivate={onActivate}
                    activatingMapId={activatingMapId}
                    t={t}
                />
            )}
            {!running && state.status === 'tombstoned' && (
                <div className="px-2.5 pb-1.5">
                    <p
                        className="text-[11px] text-muted-foreground leading-snug break-words"
                        title={state.reason}
                    >
                        {state.reason}
                    </p>
                    <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="h-2.5 w-2.5" aria-hidden />
                        {t('admin.geo.maps.tierStatus.retryAfter', {
                            time: new Date(state.retryAfter).toLocaleString(),
                        })}
                    </p>
                </div>
            )}
            {!running && state.status === 'untried' && state.reason && (
                <p className="px-2.5 pb-1.5 text-[11px] text-muted-foreground leading-snug">
                    {state.reason}
                </p>
            )}
        </li>
    )
}

// Inline expansion of the matched tier — preserves the candidate list with
// per-row "Use this map" affordance. Lives in its own component so the
// status-row chrome of TierRow stays compact and uniform.
function MatchedTierDetails({
    state,
    onActivate,
    activatingMapId,
    t,
}: {
    state: Extract<TierState, { status: 'matched' }>
    onActivate?: (mapId: number) => void
    activatingMapId?: number | null
    t: ReturnType<typeof useTranslation>['t']
}) {
    const candidates = state.candidates ?? []
    return (
        <div className="px-2.5 pb-2">
            <p className="text-[11px] text-muted-foreground leading-snug">
                {state.via}
                {state.license && ` · ${state.license}`}
            </p>
            {candidates.length > 0 && (
                <ul className="mt-1.5 space-y-1.5">
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
                                            {t('admin.geo.maps.tierStatus.active')}
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
        </div>
    )
}
