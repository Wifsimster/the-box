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
} from 'lucide-react'
import { GeoManualMapDialog } from './GeoManualMapDialog'
import { ResetScrapingDialog } from './ResetScrapingDialog'
import {
    isGameInFlight,
    tiersInFlightForGame,
    useGeoRunPolling,
    type GeoRunStatePayload,
} from '@/hooks/useGeoRunPolling'

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
    source: 'registry' | 'fandom' | 'wikidata' | 'steam' | 'manual'
    imageUrl: string
    license: string
    attribution: string | null
    widthPx: number
    heightPx: number
    region?: string | null
}

type TierKey = 'registry' | 'fandom' | 'wikidata' | 'manual'

type TierStateBase = { tier: TierKey }
type TierState =
    | (TierStateBase & {
          status: 'matched'
          via: string
          license?: string
          sourceUrl?: string
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
    activeMap: ActiveMapInfo | null
    sources: TierState[]
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(path, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        ...init,
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json?.success) {
        throw new Error(json?.error?.code ?? `request failed: ${res.status}`)
    }
    return json.data as T
}

export function GeoMapsTab() {
    const { t } = useTranslation()
    const [games, setGames] = useState<CuratedGame[] | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [selectedId, setSelectedId] = useState<number | null>(null)
    const [sources, setSources] = useState<SourcesResponse | null>(null)
    const [sourcesLoading, setSourcesLoading] = useState(false)
    const [busyAction, setBusyAction] = useState<'reimport' | null>(null)
    const [message, setMessage] = useState<string | null>(null)
    const [manualUploadFor, setManualUploadFor] = useState<CuratedGame | null>(null)
    const [resetOpen, setResetOpen] = useState(false)
    const [resetting, setResetting] = useState(false)
    const [runningAll, setRunningAll] = useState(false)
    const [runningGameId, setRunningGameId] = useState<number | null>(null)
    const { state: runState, error: runError, arm: armRunPolling } = useGeoRunPolling()

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
        if (selectedId !== null) void reloadSources(selectedId)
        else setSources(null)
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
                    <RunStateBanner state={runState} t={t} />
                    {runError && (
                        <p className="text-[11px] text-destructive">{runError}</p>
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
                        <div className="flex justify-center py-12">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
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

            {/* Right: tier-cascade side panel */}
            <Card className="lg:col-span-2">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm">
                        {selectedGame
                            ? selectedGame.name
                            : t('admin.geo.maps.sidePanel.empty')}
                    </CardTitle>
                    {selectedGame && sources?.activeMap && (
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
                    )}
                    {selectedGame && sources && !sources.activeMap && (
                        <CardDescription className="text-xs text-warning">
                            {t('admin.geo.maps.sidePanel.noActive')}
                        </CardDescription>
                    )}
                </CardHeader>
                <CardContent className="space-y-3">
                    {!selectedGame ? (
                        <p className="text-xs text-muted-foreground">
                            {t('admin.geo.maps.sidePanel.hint')}
                        </p>
                    ) : sourcesLoading && !sources ? (
                        <div className="flex justify-center py-6">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                    ) : sources ? (
                        <>
                            {sources.activeMap && (
                                <a
                                    href={sources.activeMap.imageUrl}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="block overflow-hidden rounded border border-border/40 bg-muted/10"
                                    aria-label={t('admin.geo.maps.sidePanel.previewAlt', {
                                        name: sources.gameName,
                                    })}
                                >
                                    <img
                                        src={sources.activeMap.imageUrl}
                                        alt={t('admin.geo.maps.sidePanel.previewAlt', {
                                            name: sources.gameName,
                                        })}
                                        loading="lazy"
                                        className="block max-h-48 w-full object-contain bg-black/40"
                                    />
                                    <p className="px-2 py-1 text-[10px] text-muted-foreground">
                                        {t('admin.geo.maps.sidePanel.previewDimensions', {
                                            width: sources.activeMap.widthPx,
                                            height: sources.activeMap.heightPx,
                                        })}
                                    </p>
                                </a>
                            )}
                            <ol className="space-y-2">
                                {sources.sources.map((s) => {
                                    const tiers = tiersInFlightForGame(
                                        runState,
                                        sources.gameId,
                                    )
                                    // 'manual' is operator-uploaded, never a
                                    // background job — never flag it running.
                                    const running =
                                        s.tier !== 'manual' &&
                                        tiers.has(
                                            s.tier as
                                                | 'registry'
                                                | 'fandom'
                                                | 'wikidata',
                                        )
                                    return (
                                        <TierRow
                                            key={s.tier}
                                            state={s}
                                            t={t}
                                            running={running}
                                        />
                                    )
                                })}
                            </ol>
                            <div className="flex flex-col gap-2 border-t border-border/40 pt-3 sm:flex-row">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="flex-1"
                                    disabled={busyAction !== null}
                                    onClick={() => void reimport(selectedGame)}
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
                                    onClick={() => setManualUploadFor(selectedGame)}
                                >
                                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                                    {t('admin.geo.maps.actions.uploadManual')}
                                </Button>
                            </div>
                        </>
                    ) : null}
                </CardContent>
            </Card>

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
        </div>
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
}: {
    state: TierState
    t: ReturnType<typeof useTranslation>['t']
    running?: boolean
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
                {state.sourceUrl && (
                    <a
                        href={state.sourceUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-[11px] text-primary hover:underline"
                    >
                        {t('admin.geo.maps.viewSource')}
                    </a>
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
                <p className="pt-0.5 text-[10px] text-muted-foreground inline-flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5" aria-hidden />
                    {t('admin.geo.maps.tierStatus.retryAfter', {
                        time: retry.toLocaleString(),
                    })}
                </p>
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
                <p className="pt-1 text-[11px] text-muted-foreground leading-snug">
                    {t('admin.geo.maps.tierStatus.eligibleHint')}
                </p>
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

// Compact summary line that shows BullMQ in-flight counts during a manual
// run. Hidden while the queue is idle so it doesn't clutter the header.
function RunStateBanner({
    state,
    t,
}: {
    state: GeoRunStatePayload | null
    t: ReturnType<typeof useTranslation>['t']
}) {
    if (!state || !state.isActive) return null
    const { active, waiting, delayed, failed } = state.counts
    return (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1 text-neon-pink">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                {t('admin.geo.run.banner.active', { count: active })}
            </span>
            <span className="text-muted-foreground">
                · {t('admin.geo.run.banner.waiting', { count: waiting + delayed })}
            </span>
            {failed > 0 && (
                <span className="text-destructive">
                    · {t('admin.geo.run.banner.failed', { count: failed })}
                </span>
            )}
        </div>
    )
}
