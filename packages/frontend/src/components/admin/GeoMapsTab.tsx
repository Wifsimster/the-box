import { useCallback, useState } from 'react'
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
import { Input } from '@/components/ui/input'
import {
    Loader2,
    RefreshCw,
    Upload,
    RotateCw,
    CheckCircle2,
    CheckSquare,
    XCircle,
    AlertTriangle,
    ArrowUpRight,
    Clock,
    MinusCircle,
    Sparkles,
    Square,
    Trash2,
    Play,
    Search,
    RefreshCcw,
    ListChecks,
    MoreHorizontal,
    Target,
} from 'lucide-react'
import { AddMapDialog } from './AddMapDialog'
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
import { cn } from '@/lib/utils'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet'
import {
    FILTER_MODES,
    type ActiveMapInfo,
    type CatalogRow,
    type CuratedGame,
    type FilterMode,
    type SourcesResponse,
    type TierState,
} from './geo-catalog-types'
import { useGeoCatalog } from './useGeoCatalog'

// Single Catalogue surface. Absorbs the former Maps + Games sub-tabs into one
// datatable: default view shows curated games with at least one enabled map,
// and filter pills (Activés / Sans carte / Candidats / Tous) reach the rest of
// the catalog without changing screens. Curated rows still open the per-tier
// cascade side panel; non-curated rows participate in bulk curate via the
// row checkbox + bulk action bar.

// Used by the side panel and the row-action helpers — all of those only
// operate on curated games, where map count / candidate count are known.


interface GeoMapsTabProps {
    // The run-progress hook is owned by the parent (GeoReviewPanel) so that
    // polling and the live banner survive when an admin switches between
    // Pins / Maps / Catalogue tabs mid-run.
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
    /**
     * Pre-selected filter when the parent state-machine routes here from a
     * cold-start CTA (e.g. "Activer un jeu" → opens with the Candidats pill
     * pre-applied so the moderator lands directly on the curation funnel).
     */
    initialFilter?: FilterMode
}

// Mutually-exclusive "operation in flight" flags for the catalog.
export function GeoMapsTab({
    runState,
    runError,
    armRunPolling,
    onViewCaptures,
    onGoToAcquisition,
    initialFilter,
}: GeoMapsTabProps) {
    const { t } = useTranslation()
    const isMobile = useIsMobile()
    const catalog = useGeoCatalog({ runState, armRunPolling, initialFilter })
    const {
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
        counts,
        visibleRows,
        reload,
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
    } = catalog
    const { message, error } = feedback
    const { busyAction, retryingTier, runningTier, activatingMapId, bulkBusy, resetting, uncurating } = ops

    const isLoadingInitial = loading && curated === null && candidates === null

    // Identical prop bundle for the desktop side panel and the mobile sheet.
    const sidePanelProps = {
        selectedGame,
        sources,
        sourcesLoading,
        runState,
        retryingTier,
        runningTier,
        activatingMapId,
        busyAction,
        onRetryTier: handleRetryTier,
        onRunTierNow: handleRunTierNow,
        onActivateMap: handleActivateMap,
        onDisableMap: handleDisableMap,
        onSetCaptureDefault: handleSetCaptureDefault,
        onUpdateRegion: handleUpdateRegion,
        onReimport: reimport,
        onResearch: openAddMap('research'),
        onWandImport: openAddMap('wand'),
        onManualUpload: openAddMap('manual'),
        onUncurate: setUncurateFor,
        onViewCaptures,
        t,
    }

    return (
        <div className="space-y-4">
        <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-5">
            {/* Left: per-game table */}
            <CatalogTableCard
                filter={filter}
                search={search}
                counts={counts}
                message={message}
                error={error}
                selected={selected}
                visibleRows={visibleRows}
                bulkBusy={bulkBusy}
                isLoadingInitial={isLoadingInitial}
                selectedId={selectedId}
                runState={runState}
                runError={runError}
                loading={loading}
                onGoToAcquisition={onGoToAcquisition}
                onReload={() => void reload()}
                onSetFilter={setFilter}
                onSetSearch={setSearch}
                onClearSelected={() => setSelected(new Set())}
                onApplyBulk={applyBulk}
                onSelectAllVisible={selectAllVisible}
                onToggleSelect={toggleSelect}
                onSelectGame={selectGame}
                t={t}
            />

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
                    <SidePanelBody {...sidePanelProps} />
                </CardContent>
            </Card>

            {/* Mobile: same panel surfaced as a bottom drawer when a row is tapped. */}
            <Sheet
                open={isMobile && selectedId !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        clearSelection()
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
                        <SidePanelBody {...sidePanelProps} />
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
                    <AlertTriangle className="size-4 text-destructive" aria-hidden />
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
                        <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                        <Trash2 className="size-3.5" />
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
                            <Loader2 className="size-3.5 animate-spin mr-2" />
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
            <output
                className="flex justify-center py-6"
                aria-live="polite"
                aria-busy="true"
                aria-label={t('admin.geo.maps.sidePanel.loading')}
            >
                <Loader2
                    className="size-4 animate-spin text-muted-foreground"
                    aria-hidden
                />
            </output>
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
                    <Upload className="size-3.5 mr-1.5" />
                    {t('admin.geo.maps.actions.uploadManual')}
                </Button>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            size="sm"
                            variant="outline"
                            className="size-8 p-0"
                            aria-label={t('admin.geo.maps.sidePanel.moreActions')}
                            title={t('admin.geo.maps.sidePanel.moreActions')}
                        >
                            <MoreHorizontal className="size-3.5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem onSelect={() => onWandImport(selectedGame)}>
                            <Sparkles className="size-3.5 mr-2" />
                            {t('admin.geo.maps.actions.importWand')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onResearch(selectedGame)}>
                            <Search className="size-3.5 mr-2" />
                            {t('admin.geo.maps.actions.research')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            disabled={busyAction !== null}
                            onSelect={() => void onReimport(selectedGame)}
                            className="text-destructive focus:text-destructive"
                        >
                            {busyAction === 'reimport' ? (
                                <Loader2 className="size-3.5 animate-spin mr-2" />
                            ) : (
                                <RotateCw className="size-3.5 mr-2" />
                            )}
                            {t('admin.geo.maps.actions.rerun')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onSelect={() => onUncurate(selectedGame)}
                            className="text-destructive focus:text-destructive"
                        >
                            <Trash2 className="size-3.5 mr-2" />
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
    // Focus the region field when the operator opens it. Driven by the edit
    // click via a callback ref (focusing the node as it mounts) rather than
    // autoFocus (which fires on document load) or a focus effect.
    const focusOnMount = useCallback((node: HTMLInputElement | null) => {
        node?.focus()
    }, [])
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
                            ref={focusOnMount}
                            value={draft}
                            disabled={busy}
                            aria-label={t('admin.geo.maps.multi.regionEdit', 'Edit region')}
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
                            <Target className="size-2.5" aria-hidden />
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
                        <ListChecks className="size-2.5" aria-hidden />
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
                        className="size-7 flex-none p-0"
                        aria-label={t('admin.geo.maps.sidePanel.moreActions')}
                        title={t('admin.geo.maps.sidePanel.moreActions')}
                    >
                        {busy ? (
                            <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                            <MoreHorizontal className="size-3.5" />
                        )}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                    {!map.isCaptureDefault && (
                        <DropdownMenuItem
                            onSelect={() => void onSetCaptureDefault(gameId, map.id)}
                        >
                            <Target className="size-3.5 mr-2" />
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
                        <XCircle className="size-3.5 mr-2" />
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

function CatalogRowItem({
    row,
    selected,
    isOpen,
    inflight,
    onToggleSelect,
    onOpen,
    t,
}: {
    row: CatalogRow
    selected: boolean
    isOpen: boolean
    inflight: boolean
    onToggleSelect: () => void
    onOpen: () => void
    t: ReturnType<typeof useTranslation>['t']
}) {
    const noMapLikely = !row.curated && row.mapEligibility === false
    const rowClickable = row.curated
    return (
        <tr
            className={cn(
                'text-xs transition-colors',
                rowClickable && 'cursor-pointer',
                isOpen
                    ? 'bg-muted/40'
                    : selected
                      ? 'bg-primary/5'
                      : rowClickable
                        ? 'hover:bg-muted/20'
                        : '',
            )}
            onClick={(e) => {
                // Skip when the click landed on the checkbox cell — it has
                // its own handler and we don't want it to also toggle the
                // side panel.
                const target = e.target as HTMLElement
                if (target.closest('[data-row-checkbox]')) return
                if (rowClickable) onOpen()
            }}
        >
            <td className="px-3 py-2 align-middle" data-row-checkbox>
                <button
                    type="button"
                    onClick={onToggleSelect}
                    className="flex size-4 items-center justify-center"
                    aria-label={
                        selected
                            ? t('admin.geo.catalog.deselect')
                            : t('admin.geo.catalog.select')
                    }
                >
                    {selected ? (
                        <CheckSquare className="size-3.5 text-primary" />
                    ) : (
                        <Square className="size-3.5 text-muted-foreground" />
                    )}
                </button>
            </td>
            <td className="px-3 py-2 align-middle">
                <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                    <span className="font-medium truncate">{row.name}</span>
                    {row.releaseYear && (
                        <span className="text-[10px] text-muted-foreground">
                            ({row.releaseYear})
                        </span>
                    )}
                    {noMapLikely && (
                        <span
                            className="inline-flex items-center gap-0.5 rounded-full border border-warning/40 bg-warning/10 px-1.5 py-0 text-[10px] text-warning"
                            title={t('admin.geo.games.noMapLikelyTooltip', {
                                genres: (row.genres ?? []).join(', '),
                            })}
                        >
                            <AlertTriangle className="size-2.5" aria-hidden />
                            {t('admin.geo.games.noMapLikely')}
                        </span>
                    )}
                </div>
                {row.developer && (
                    <p className="text-[10px] text-muted-foreground truncate">
                        {row.developer}
                    </p>
                )}
            </td>
            <td className="px-3 py-2 align-middle text-right tabular-nums text-muted-foreground">
                {row.curated && row.mapCount !== undefined
                    ? t('admin.geo.maps.row.mapCount', { count: row.mapCount })
                    : '—'}
            </td>
            <td className="px-3 py-2 align-middle text-right">
                <div className="inline-flex items-center gap-1.5">
                    {inflight && (
                        <Badge
                            variant="outline"
                            className="gap-1 text-[10px] px-1.5 py-0 border-neon-pink/40 text-neon-pink"
                        >
                            <Loader2 className="size-2.5 animate-spin" />
                            {t('admin.geo.run.inFlight')}
                        </Badge>
                    )}
                    <CatalogStatusBadge row={row} t={t} />
                </div>
            </td>
        </tr>
    )
}

function CatalogStatusBadge({
    row,
    t,
}: {
    row: CatalogRow
    t: ReturnType<typeof useTranslation>['t']
}) {
    if (!row.curated) {
        return (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {t('admin.geo.catalog.status.candidate')}
            </Badge>
        )
    }
    if (row.hasMap) {
        return (
            <Badge variant="success" className="gap-1 text-[10px] px-1.5 py-0">
                <CheckCircle2 className="size-3" aria-hidden />
                {t('admin.geo.maps.row.hasMap')}
            </Badge>
        )
    }
    if (row.metadataStatus === 'unresolved') {
        return (
            <Badge variant="destructive" className="gap-1 text-[10px] px-1.5 py-0">
                <XCircle className="size-3" aria-hidden />
                {t('admin.geo.maps.row.failed')}
            </Badge>
        )
    }
    return (
        <Badge variant="warning" className="gap-1 text-[10px] px-1.5 py-0">
            <AlertTriangle className="size-3" aria-hidden />
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
                    className={`size-3 shrink-0 ${visual.iconColor} ${
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
                                    <Loader2 className="size-3 animate-spin" />
                                ) : (
                                    <RefreshCcw className="size-3" />
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
                                    <Loader2 className="size-3 animate-spin" />
                                ) : (
                                    <Play className="size-3" />
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
                        <Clock className="size-2.5" aria-hidden />
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
                                                <Loader2 className="size-3 animate-spin" />
                                            ) : (
                                                <CheckCircle2 className="size-3" />
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

interface CatalogTableCardProps {
    filter: FilterMode
    search: string
    counts: Record<FilterMode, number>
    message: string | null
    error: string | null
    selected: Set<number>
    visibleRows: CatalogRow[]
    bulkBusy: boolean
    isLoadingInitial: boolean
    selectedId: number | null
    runState: GeoRunStatePayload | null
    runError: string | null
    loading: boolean
    onGoToAcquisition?: () => void
    onReload: () => void
    onSetFilter: (f: FilterMode) => void
    onSetSearch: (s: string) => void
    onClearSelected: () => void
    onApplyBulk: (target: boolean) => Promise<void> | void
    onSelectAllVisible: () => void
    onToggleSelect: (id: number) => void
    onSelectGame: (id: number) => void
    t: ReturnType<typeof useTranslation>['t']
}

function CatalogTableCard({
    filter,
    search,
    counts,
    message,
    error,
    selected,
    visibleRows,
    bulkBusy,
    isLoadingInitial,
    selectedId,
    runState,
    runError,
    loading,
    onGoToAcquisition,
    onReload,
    onSetFilter,
    onSetSearch,
    onClearSelected,
    onApplyBulk,
    onSelectAllVisible,
    onToggleSelect,
    onSelectGame,
    t,
}: CatalogTableCardProps) {
    return (
            <Card className="lg:col-span-3">
                <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <CardTitle className="text-sm">
                                {t('admin.geo.catalog.title')}
                            </CardTitle>
                            <CardDescription className="text-xs">
                                {t('admin.geo.catalog.subtitle')}
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
                                    <ArrowUpRight className="size-3.5" />
                                    {t('admin.geo.maps.goToAcquisition')}
                                </Button>
                            )}
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={onReload}
                                disabled={loading}
                                aria-label={t('admin.geo.maps.refresh')}
                                className="size-7 p-0"
                            >
                                <RefreshCw
                                    className={`size-3.5 ${loading ? 'animate-spin' : ''}`}
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
                    {/* Filter pills + search live above the table so the
                        operator can pivot between Activés / Sans carte /
                        Candidats / Tous without leaving the page. */}
                    <div className="px-4 pb-3 space-y-2">
                        <fieldset
                            className="m-0 flex flex-wrap items-center gap-1.5 border-0 p-0"
                            aria-label={t('admin.geo.catalog.filter.label')}
                        >
                            {FILTER_MODES.map((f) => (
                                <Button
                                    key={f}
                                    type="button"
                                    size="sm"
                                    variant={filter === f ? 'default' : 'outline'}
                                    onClick={() => onSetFilter(f)}
                                    className="h-7 text-xs"
                                >
                                    {t(`admin.geo.catalog.filter.${f}`)}
                                    {` (${counts[f]})`}
                                </Button>
                            ))}
                        </fieldset>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                type="search"
                                className="h-8 pl-9 text-xs"
                                placeholder={t('admin.geo.catalog.searchPlaceholder')}
                                value={search}
                                onChange={(e) => onSetSearch(e.target.value)}
                                aria-label={t('admin.geo.catalog.searchPlaceholder')}
                            />
                        </div>
                    </div>
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
                    {selected.size > 0 && (
                        <div className="mx-4 mb-3 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 p-2 text-xs">
                            <span className="font-medium">
                                {t('admin.geo.catalog.bulk.selected', {
                                    count: selected.size,
                                })}
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={bulkBusy}
                                    onClick={() => void onApplyBulk(true)}
                                    className="h-7 text-xs"
                                >
                                    {bulkBusy && (
                                        <Loader2 className="size-3 animate-spin mr-1" />
                                    )}
                                    {t('admin.geo.catalog.bulk.curate')}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={bulkBusy}
                                    onClick={() => void onApplyBulk(false)}
                                    className="h-7 text-xs"
                                >
                                    {bulkBusy && (
                                        <Loader2 className="size-3 animate-spin mr-1" />
                                    )}
                                    {t('admin.geo.catalog.bulk.remove')}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={onClearSelected}
                                    disabled={bulkBusy}
                                    className="h-7 text-xs"
                                >
                                    {t('admin.geo.catalog.bulk.clear')}
                                </Button>
                            </div>
                        </div>
                    )}
                    {isLoadingInitial ? (
                        <output
                            className="flex justify-center py-12"
                            aria-live="polite"
                            aria-busy="true"
                            aria-label={t('admin.geo.maps.loading')}
                        >
                            <Loader2
                                className="size-5 animate-spin text-muted-foreground"
                                aria-hidden
                            />
                        </output>
                    ) : visibleRows.length > 0 ? (
                        <div className="overflow-hidden border-t border-border/40">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-border/40 bg-muted/20 text-[10px] uppercase tracking-wide text-muted-foreground">
                                        <th
                                            scope="col"
                                            className="w-8 px-3 py-2 text-left font-medium"
                                        >
                                            <button
                                                type="button"
                                                onClick={onSelectAllVisible}
                                                className="flex size-4 items-center justify-center"
                                                aria-label={
                                                    selected.size === visibleRows.length &&
                                                    visibleRows.length > 0
                                                        ? t('admin.geo.catalog.deselectAll')
                                                        : t('admin.geo.catalog.selectAll')
                                                }
                                            >
                                                {selected.size === visibleRows.length &&
                                                visibleRows.length > 0 ? (
                                                    <CheckSquare className="size-3.5" />
                                                ) : (
                                                    <Square className="size-3.5" />
                                                )}
                                            </button>
                                        </th>
                                        <th
                                            scope="col"
                                            className="px-3 py-2 text-left font-medium"
                                        >
                                            {t('admin.geo.catalog.col.name')}
                                        </th>
                                        <th
                                            scope="col"
                                            className="px-3 py-2 text-right font-medium w-28"
                                        >
                                            {t('admin.geo.catalog.col.maps')}
                                        </th>
                                        <th
                                            scope="col"
                                            className="px-3 py-2 text-right font-medium w-32"
                                        >
                                            {t('admin.geo.catalog.col.status')}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/40">
                                    {visibleRows.map((row) => (
                                        <CatalogRowItem
                                            key={row.id}
                                            row={row}
                                            selected={selected.has(row.id)}
                                            isOpen={selectedId === row.id}
                                            inflight={isGameInFlight(
                                                runState,
                                                row.id,
                                            )}
                                            onToggleSelect={() => onToggleSelect(row.id)}
                                            onOpen={() => {
                                                if (row.curated) onSelectGame(row.id)
                                            }}
                                            t={t}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="px-4 py-6 text-xs text-muted-foreground">
                            {t('admin.geo.catalog.empty')}
                        </p>
                    )}
                </CardContent>
            </Card>
    )
}
