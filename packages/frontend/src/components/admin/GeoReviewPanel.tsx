import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Loader2,
    Trash2,
    HelpCircle,
    MapPin,
    Map as MapIcon,
    ListChecks,
    Library,
    Flag,
    X,
    ChevronLeft,
    ChevronRight,
    ArrowLeft,
    Workflow,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { GeoMapCanvas } from '@/components/geo/GeoMapCanvas'
import { GeoMapsTab } from './GeoMapsTab'
import { GeoGamesTab } from './GeoGamesTab'
import { ModerationStatusRail } from './ModerationStatusRail'
import { ReportsModerationPanel } from './ReportsModerationPanel'
import GeoFetchPanel from './geo-fetch/GeoFetchPanel'
import { useGeoRunPolling } from '@/hooks/useGeoRunPolling'
import { useGeoHealth } from '@/hooks/useGeoHealth'
import { useIsMobile } from '@/hooks/useIsMobile'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type {
    GeoCandidateGameSummary,
    GeoMap,
    GeoPinSubmission,
    GeoPoint,
    GeoScreenshotCandidate,
    GeoScreenshotMeta,
} from '@the-box/types'

interface CandidateDetail {
    candidate: GeoScreenshotCandidate
    pins: GeoPinSubmission[]
    map: GeoMap | null
    meta: GeoScreenshotMeta | null
}

type StatusFilter = 'collecting' | 'pending' | 'promoted' | 'all'
const STATUS_FILTERS: StatusFilter[] = ['collecting', 'pending', 'promoted', 'all']

interface CandidateGroup {
    gameId: number
    gameName: string | null
    candidates: GeoScreenshotCandidate[]
}

// Bucket candidates by their owning game so the Pins list renders one
// section per game instead of a flat #id list. The repository already
// orders candidates by pin_count desc; we keep that ordering inside each
// group, then sort groups by size (most candidates first) so the
// busiest games stay at the top of the panel.
function groupCandidatesByGame(
    candidates: GeoScreenshotCandidate[],
): CandidateGroup[] {
    const groups = new Map<number, CandidateGroup>()
    for (const c of candidates) {
        const existing = groups.get(c.gameId)
        if (existing) {
            existing.candidates.push(c)
        } else {
            groups.set(c.gameId, {
                gameId: c.gameId,
                gameName: c.gameName ?? null,
                candidates: [c],
            })
        }
    }
    return [...groups.values()].sort(
        (a, b) =>
            b.candidates.length - a.candidates.length || a.gameId - b.gameId,
    )
}

async function fetchCandidates(args: {
    status?: string
    gameId?: number
}): Promise<GeoScreenshotCandidate[]> {
    const params = new URLSearchParams()
    if (args.status) params.set('status', args.status)
    if (args.gameId !== undefined) params.set('gameId', String(args.gameId))
    const qs = params.toString() ? `?${params.toString()}` : ''
    const res = await fetch(`/api/admin/geo/candidates${qs}`, { credentials: 'include' })
    if (!res.ok) throw new Error(`list failed: ${res.status}`)
    const json = await res.json()
    return json.data
}

async function fetchGameSummaries(args: {
    status?: string
}): Promise<GeoCandidateGameSummary[]> {
    const params = new URLSearchParams()
    if (args.status) params.set('status', args.status)
    const qs = params.toString() ? `?${params.toString()}` : ''
    const res = await fetch(`/api/admin/geo/candidates/by-game${qs}`, {
        credentials: 'include',
    })
    if (!res.ok) throw new Error(`summary failed: ${res.status}`)
    const json = await res.json()
    return json.data
}

async function fetchCandidateDetail(id: number): Promise<CandidateDetail> {
    const res = await fetch(`/api/admin/geo/candidates/${id}`, { credentials: 'include' })
    if (!res.ok) throw new Error(`detail failed: ${res.status}`)
    const json = await res.json()
    return json.data
}

async function overrideCandidate(id: number, pin: GeoPoint | null): Promise<void> {
    const res = await fetch(`/api/admin/geo/candidates/${id}/override`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
            pin ? { canonicalX: pin.x, canonicalY: pin.y } : {},
        ),
    })
    if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error?.code ?? `override failed: ${res.status}`)
    }
}

async function deleteMeta(metaId: number): Promise<void> {
    const res = await fetch(`/api/admin/geo/meta/${metaId}`, {
        method: 'DELETE',
        credentials: 'include',
    })
    if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error?.code ?? `delete meta failed: ${res.status}`)
    }
}

async function rejectCandidate(id: number): Promise<void> {
    const res = await fetch(`/api/admin/geo/candidates/${id}/reject`, {
        method: 'POST',
        credentials: 'include',
    })
    if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error?.code ?? `reject failed: ${res.status}`)
    }
}

type GeoSubTab = 'queue' | 'acquisition' | 'reports' | 'catalog'
const SUB_TABS: GeoSubTab[] = ['queue', 'acquisition', 'reports', 'catalog']

export function GeoReviewPanel() {
    const { t } = useTranslation()
    const isMobile = useIsMobile()
    // Sub-tab state lives in the URL (`?sub=…`) so AdminPage's redirect
    // map can deep-link `?tab=geoFetch` straight into Acquisition and so
    // the moderator's tab choice survives a refresh.
    const [searchParams, setSearchParams] = useSearchParams()
    const subFromUrl = searchParams.get('sub')
    const activeTab: GeoSubTab =
        subFromUrl && (SUB_TABS as string[]).includes(subFromUrl)
            ? (subFromUrl as GeoSubTab)
            : 'queue'
    const setActiveTab = useCallback(
        (next: GeoSubTab) => {
            const params = new URLSearchParams(searchParams)
            if (next === 'queue') params.delete('sub')
            else params.set('sub', next)
            setSearchParams(params, { replace: true })
        },
        [searchParams, setSearchParams],
    )
    const [catalogView, setCatalogView] = useState<'maps' | 'games'>('maps')
    // Default to the only status that needs the moderator's attention. The
    // other statuses are still reachable via the chip row, but the page
    // should not open on `collecting` (no decision possible) or `all` (mixes
    // already-handled rows into the queue).
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
    // Per-game filter for the Pins tab. Set when the operator clicks "Voir
    // les captures" on a Maps row so the candidate list narrows to that game.
    // Cleared via the badge in the Pins header.
    const [gameFilter, setGameFilter] = useState<{
        gameId: number
        gameName: string
    } | null>(null)
    const [candidates, setCandidates] = useState<GeoScreenshotCandidate[]>([])
    // Per-game summary for the overview list (one row per game, with the
    // honest count of captures per status). Fetched whenever no `gameFilter`
    // is active; the per-candidate list takes over once the moderator drills
    // into a specific game.
    const [summaries, setSummaries] = useState<GeoCandidateGameSummary[]>([])
    const [detail, setDetail] = useState<CandidateDetail | null>(null)
    const [pin, setPin] = useState<GeoPoint | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [demoteOpen, setDemoteOpen] = useState(false)
    const [rejectOpen, setRejectOpen] = useState(false)
    const [introOpen, setIntroOpen] = useState(false)
    // Owned here (not inside GeoMapsTab) so an in-flight manual run keeps
    // polling and the live banner stays visible when the operator switches
    // between Pins / Maps / Games tabs.
    const { state: runState, error: runError, arm: armRunPolling } = useGeoRunPolling()
    // Single health subscription shared between the counter strip and the
    // cold-start banner — keeps them in sync without a duplicate poll.
    const { data: health, loading: healthLoading, error: healthError } = useGeoHealth()

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        // Two modes:
        //  - No game selected → fetch per-game summary (the "Propositions"
        //    list shows one row per game with its capture counts).
        //  - Game selected (drill-down) → fetch the candidates of that game
        //    so the moderator can act on individual captures.
        const status = statusFilter === 'all' ? undefined : statusFilter
        const gameId = gameFilter?.gameId
        if (gameId !== undefined) {
            fetchCandidates({ status, gameId })
                .then((rows) => !cancelled && setCandidates(rows))
                .catch((e) => !cancelled && setError(String(e)))
                .finally(() => !cancelled && setLoading(false))
        } else {
            fetchGameSummaries({ status })
                .then((rows) => {
                    if (cancelled) return
                    setSummaries(rows)
                    // Keep `candidates` empty in summary mode so the
                    // detail/prev-next bookkeeping (which reads candidates)
                    // doesn't carry stale rows from a previous drill-down.
                    setCandidates([])
                })
                .catch((e) => !cancelled && setError(String(e)))
                .finally(() => !cancelled && setLoading(false))
        }
        return () => {
            cancelled = true
        }
    }, [statusFilter, gameFilter?.gameId])

    const openDetail = async (id: number) => {
        setError(null)
        setPin(null)
        try {
            const d = await fetchCandidateDetail(id)
            setDetail(d)
        } catch (e) {
            setError(String(e))
        }
    }

    // Returns the candidate the moderator should triage *after* `currentId`
    // is removed from the visible list. Uses the same flat (group-aware)
    // ordering the UI renders, so "next" mirrors what the eye expects.
    // Falls back to the first row, then to nothing when the queue empties.
    const pickNextAfter = (
        rows: GeoScreenshotCandidate[],
        currentId: number,
        previousFlat: GeoScreenshotCandidate[],
    ): GeoScreenshotCandidate | null => {
        const flat = groupCandidatesByGame(rows).flatMap((g) => g.candidates)
        if (flat.length === 0) return null
        const oldIdx = previousFlat.findIndex((c) => c.id === currentId)
        // After a successful action the row drops out of the filtered list,
        // so the candidate now sitting at `oldIdx` IS the next one.
        if (oldIdx >= 0 && oldIdx < flat.length) return flat[oldIdx]
        return flat[0]
    }

    const applyOverride = async () => {
        if (!detail) return
        setSaving(true)
        try {
            const previousFlat = groupCandidatesByGame(candidates).flatMap(
                (g) => g.candidates,
            )
            const currentId = detail.candidate.id
            await overrideCandidate(currentId, pin)
            const rows = await fetchCandidates({
                status: statusFilter === 'all' ? undefined : statusFilter,
                gameId: gameFilter?.gameId,
            })
            setCandidates(rows)
            const next = pickNextAfter(rows, currentId, previousFlat)
            setPin(null)
            if (next) {
                await openDetail(next.id)
            } else {
                setDetail(null)
                // Game has no more captures matching the active filter —
                // bounce back to the per-game summary so the moderator can
                // pick the next game to triage.
                if (rows.length === 0 && gameFilter) setGameFilter(null)
            }
        } catch (e) {
            setError(String(e))
        } finally {
            setSaving(false)
        }
    }

    const viewCapturesForGame = (gameId: number, gameName: string) => {
        setGameFilter({ gameId, gameName })
        setStatusFilter('all')
        setDetail(null)
        setActiveTab('queue')
    }

    const confirmReject = async () => {
        if (!detail) return
        setError(null)
        setSaving(true)
        try {
            const previousFlat = groupCandidatesByGame(candidates).flatMap(
                (g) => g.candidates,
            )
            const currentId = detail.candidate.id
            await rejectCandidate(currentId)
            setRejectOpen(false)
            const rows = await fetchCandidates({
                status: statusFilter === 'all' ? undefined : statusFilter,
                gameId: gameFilter?.gameId,
            })
            setCandidates(rows)
            const next = pickNextAfter(rows, currentId, previousFlat)
            setPin(null)
            if (next) {
                await openDetail(next.id)
            } else {
                setDetail(null)
                if (rows.length === 0 && gameFilter) setGameFilter(null)
            }
        } catch (e) {
            setError(String(e))
        } finally {
            setSaving(false)
        }
    }

    const confirmDemote = async () => {
        if (!detail?.meta) return
        setError(null)
        setSaving(true)
        try {
            await deleteMeta(detail.meta.id)
            // Reload the detail (now meta-less) so the admin can re-pin.
            const fresh = await fetchCandidateDetail(detail.candidate.id)
            setDetail(fresh)
            setPin(null)
            setDemoteOpen(false)
        } catch (e) {
            setError(String(e))
        } finally {
            setSaving(false)
        }
    }

    // Flat list of currently visible candidates, in the same order the
    // sidebar renders them. Used to drive prev/next navigation in the detail
    // view so the moderator can step through captures without bouncing back
    // to the sidebar to tap another row.
    const flatCandidates = groupCandidatesByGame(candidates).flatMap(
        (g) => g.candidates,
    )
    const currentIndex = detail
        ? flatCandidates.findIndex((c) => c.id === detail.candidate.id)
        : -1
    const prevCandidate =
        currentIndex > 0 ? flatCandidates[currentIndex - 1] : null
    const nextCandidate =
        currentIndex >= 0 && currentIndex < flatCandidates.length - 1
            ? flatCandidates[currentIndex + 1]
            : null

    const statusLabel = (status: string): string => {
        // Translate known statuses; fall back to the raw value for unknown statuses
        // (rejected, archived, etc.) so we never silently hide data.
        const key = `admin.geo.statusBadge.${status}`
        const translated = t(key)
        return translated === key ? status : translated
    }

    // Pick which count drives a summary row's primary number based on the
    // active status filter. `all` shows the total so the row never hides
    // captures when the moderator switches to the audit view.
    const summaryCountFor = (s: GeoCandidateGameSummary): number => {
        switch (statusFilter) {
            case 'collecting':
                return s.collectingCount
            case 'pending':
                return s.pendingCount
            case 'promoted':
                return s.promotedCount
            case 'all':
                return s.totalCount
        }
    }

    // Days between `iso` and now, rounded down to whole days. Used to label
    // the oldest pending capture per game so triage can prioritise stale
    // ones. Returns null for invalid input so callers can skip the badge.
    const daysSince = (iso: string | null): number | null => {
        if (!iso) return null
        const ts = Date.parse(iso)
        if (Number.isNaN(ts)) return null
        const ms = Date.now() - ts
        if (ms <= 0) return 0
        return Math.floor(ms / (1000 * 60 * 60 * 24))
    }

    return (
        <div className="space-y-4">
            {/* Page header */}
            <header className="space-y-1">
                <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-neon-pink" />
                    {t('admin.geo.title')}
                </h2>
                <p className="text-sm text-muted-foreground">{t('admin.geo.subtitle')}</p>
            </header>

            <ModerationStatusRail
                health={health}
                healthLoading={healthLoading}
                healthError={healthError}
                runState={runState}
                onMapsClick={() => {
                    setActiveTab('catalog')
                    setCatalogView('maps')
                }}
                onPinsClick={() => {
                    setActiveTab('queue')
                    setStatusFilter('pending')
                    setGameFilter(null)
                }}
            />

            <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as GeoSubTab)}
                className="space-y-4"
            >
                <TabsList className="w-full overflow-x-auto justify-start scrollbar-hide">
                    <TabsTrigger value="queue" className="gap-1.5 shrink-0">
                        <ListChecks className="h-3.5 w-3.5" />
                        {t('admin.geo.tabs.queue')}
                    </TabsTrigger>
                    <TabsTrigger value="acquisition" className="gap-1.5 shrink-0">
                        <Workflow className="h-3.5 w-3.5" />
                        {t('admin.geo.tabs.acquisition')}
                    </TabsTrigger>
                    <TabsTrigger value="reports" className="gap-1.5 shrink-0">
                        <Flag className="h-3.5 w-3.5" />
                        {t('admin.geo.tabs.reports')}
                    </TabsTrigger>
                    <TabsTrigger value="catalog" className="gap-1.5 shrink-0">
                        <Library className="h-3.5 w-3.5" />
                        {t('admin.geo.tabs.catalog')}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="acquisition" className="space-y-4">
                    {/* Folded the standalone "Cartes" admin tab in here so
                        ingestion controls live next door to the moderation
                        queue and the catalog they feed. The previous tab
                        duplicated triggers already exposed in
                        Catalogue › Cartes; the IA now keeps a single
                        ingestion entry-point. */}
                    <GeoFetchPanel />
                </TabsContent>

                <TabsContent value="reports" className="space-y-4">
                    <ReportsModerationPanel />
                </TabsContent>

                <TabsContent value="catalog" className="space-y-4">
                    {/* Maps and Games are both reference data; previously
                        they each had a top-level tab. Collapsed into one
                        Catalogue tab with a segmented sub-control so the
                        two top tabs map to the moderator's task split:
                        "today's queue" vs. "everything else". */}
                    <div
                        className="inline-flex rounded-md border border-border/40 bg-muted/20 p-0.5"
                        role="tablist"
                        aria-label={t('admin.geo.catalog.subtoggleLabel')}
                    >
                        {(['maps', 'games'] as const).map((view) => {
                            const Icon = view === 'maps' ? MapIcon : Library
                            const active = catalogView === view
                            return (
                                <button
                                    key={view}
                                    type="button"
                                    role="tab"
                                    aria-selected={active}
                                    onClick={() => setCatalogView(view)}
                                    className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition-colors ${
                                        active
                                            ? 'bg-background shadow-sm text-foreground'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    <Icon className="h-3.5 w-3.5" aria-hidden />
                                    {t(`admin.geo.catalog.${view}`)}
                                </button>
                            )
                        })}
                    </div>
                    {catalogView === 'maps' ? (
                        <GeoMapsTab
                            runState={runState}
                            runError={runError}
                            armRunPolling={armRunPolling}
                            onViewCaptures={viewCapturesForGame}
                            onGoToAcquisition={() => setActiveTab('acquisition')}
                        />
                    ) : (
                        <GeoGamesTab />
                    )}
                </TabsContent>

                <TabsContent value="queue" className="space-y-4">
            {/* Status filter */}
            <div
                className="flex flex-wrap items-center gap-2"
                role="group"
                aria-label={t('admin.geo.statusFilter.label')}
            >
                {STATUS_FILTERS.map((s) => (
                    <Button
                        key={s}
                        size="sm"
                        variant={statusFilter === s ? 'default' : 'outline'}
                        onClick={() => setStatusFilter(s)}
                    >
                        {t(`admin.geo.statusFilter.${s}`)}
                    </Button>
                ))}
                {gameFilter && (
                    <Badge
                        variant="outline"
                        className="ml-1 gap-1.5 border-neon-pink/40 bg-neon-pink/5 text-neon-pink"
                    >
                        {t('admin.geo.gameFilter.active', {
                            name: gameFilter.gameName,
                        })}
                        <button
                            type="button"
                            onClick={() => setGameFilter(null)}
                            aria-label={t('admin.geo.gameFilter.clear')}
                            className="rounded hover:bg-neon-pink/10"
                        >
                            <X className="h-3 w-3" aria-hidden />
                        </button>
                    </Badge>
                )}
            </div>

            {error && (
                <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                    {error}
                </div>
            )}

            {loading ? (
                <div
                    className="flex justify-center py-16"
                    role="status"
                    aria-live="polite"
                    aria-busy="true"
                    aria-label={t('admin.geo.submissionsLoading')}
                >
                    <Loader2
                        className="h-6 w-6 animate-spin text-neon-pink"
                        aria-hidden
                    />
                </div>
            ) : (
                <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-3">
                    {/* List card — hidden on mobile while a candidate is open
                        so the page reverts to a single column and the sticky
                        Header stays reachable. On lg+, both cards sit
                        side-by-side as before. */}
                    <Card
                        className={cn(
                            'lg:col-span-1',
                            detail && 'hidden lg:block',
                        )}
                    >
                        <CardHeader className="pb-2 p-4 sm:p-6">
                            <div className="flex items-center justify-between gap-2">
                                <CardTitle className="text-sm">
                                    {gameFilter
                                        ? `${t('admin.geo.submissions')} (${candidates.length})`
                                        : t('admin.geo.gamesList.header', {
                                              count: summaries.length,
                                          })}
                                </CardTitle>
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-muted-foreground hover:text-neon-pink"
                                    onClick={() => setIntroOpen(true)}
                                    aria-label={t('admin.geo.guide.title')}
                                >
                                    <HelpCircle className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3 lg:max-h-[520px] overflow-auto p-4 sm:p-6 pt-0 sm:pt-0">
                            {gameFilter ? (
                                <>
                                    {candidates.map((c) => (
                                        <button
                                            key={c.id}
                                            onClick={() => openDetail(c.id)}
                                            className={`w-full text-left rounded border p-2 text-xs hover:bg-muted/40 active:bg-muted/60 ${
                                                detail?.candidate.id === c.id && !isMobile
                                                    ? 'border-neon-pink'
                                                    : ''
                                            }`}
                                        >
                                            <div className="flex justify-between items-center gap-2">
                                                <span className="truncate font-mono font-medium">
                                                    #{c.id}
                                                </span>
                                                <Badge variant="outline">
                                                    {statusLabel(c.status)}
                                                </Badge>
                                            </div>
                                            <div className="mt-1 text-muted-foreground">
                                                {t('admin.geo.submissionRow.pinCount', {
                                                    count: c.pinCount,
                                                })}
                                                {' · '}
                                                {t('admin.geo.submissionRow.source', {
                                                    source: c.source,
                                                })}
                                            </div>
                                        </button>
                                    ))}
                                    {candidates.length === 0 && (
                                        <p className="text-xs text-muted-foreground">
                                            {t('admin.geo.emptyQueue')}
                                        </p>
                                    )}
                                </>
                            ) : (
                                <>
                                    {summaries
                                        .filter((s) => summaryCountFor(s) > 0)
                                        .map((s) => {
                                            const primary = summaryCountFor(s)
                                            const days = daysSince(s.oldestPendingAt)
                                            return (
                                                <button
                                                    key={s.gameId}
                                                    onClick={() =>
                                                        viewCapturesForGame(
                                                            s.gameId,
                                                            s.gameName ??
                                                                t(
                                                                    'admin.geo.groupHeader.unknownGame',
                                                                    { id: s.gameId },
                                                                ),
                                                        )
                                                    }
                                                    className="w-full text-left rounded border p-3 text-xs hover:bg-muted/40 active:bg-muted/60 transition-colors"
                                                >
                                                    <div className="flex items-baseline justify-between gap-2">
                                                        <h3 className="truncate text-sm font-semibold text-foreground">
                                                            {s.gameName ??
                                                                t(
                                                                    'admin.geo.groupHeader.unknownGame',
                                                                    { id: s.gameId },
                                                                )}
                                                        </h3>
                                                        <span className="shrink-0 font-mono text-sm font-bold text-neon-pink">
                                                            {primary}
                                                        </span>
                                                    </div>
                                                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                                                        <span>
                                                            {t(
                                                                `admin.geo.gamesList.count.${statusFilter}`,
                                                                { count: primary },
                                                            )}
                                                        </span>
                                                        {statusFilter !== 'pending' &&
                                                            s.pendingCount > 0 && (
                                                                <Badge
                                                                    variant="outline"
                                                                    className="h-4 px-1 text-[10px]"
                                                                >
                                                                    {t(
                                                                        'admin.geo.gamesList.count.pending',
                                                                        {
                                                                            count: s.pendingCount,
                                                                        },
                                                                    )}
                                                                </Badge>
                                                            )}
                                                        {days !== null && s.pendingCount > 0 && (
                                                            <span>
                                                                {' · '}
                                                                {t(
                                                                    'admin.geo.gamesList.oldestPending',
                                                                    {
                                                                        relative:
                                                                            days === 0
                                                                                ? t(
                                                                                      'admin.geo.gamesList.relative.today',
                                                                                  )
                                                                                : t(
                                                                                      'admin.geo.gamesList.relative.daysAgo',
                                                                                      {
                                                                                          count: days,
                                                                                      },
                                                                                  ),
                                                                    },
                                                                )}
                                                            </span>
                                                        )}
                                                    </div>
                                                </button>
                                            )
                                        })}
                                    {summaries.filter((s) => summaryCountFor(s) > 0).length ===
                                        0 && (
                                        <p className="text-xs text-muted-foreground">
                                            {t('admin.geo.emptyQueue')}
                                        </p>
                                    )}
                                </>
                            )}
                        </CardContent>
                    </Card>

                    {/* Detail card — on mobile, only renders when a
                        candidate is selected (replacing the list). On lg+,
                        always visible alongside the list. The Header stays
                        sticky throughout because nothing is rendered as a
                        modal/portal anymore. */}
                    <Card
                        className={cn(
                            'lg:col-span-2',
                            !detail && 'hidden lg:block',
                        )}
                    >
                        <CardHeader className="pb-2 p-4 sm:p-6">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    {/* Mobile back button — pops the detail
                                        view so the user is returned to the
                                        list. Hidden on lg+ where both cards
                                        are visible side-by-side. */}
                                    {detail && (
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 shrink-0 lg:hidden"
                                            onClick={() => {
                                                setDetail(null)
                                                setPin(null)
                                            }}
                                            aria-label={t(
                                                'admin.geo.nav.backToList',
                                                'Retour à la liste',
                                            )}
                                        >
                                            <ArrowLeft className="h-4 w-4" />
                                        </Button>
                                    )}
                                    <CardTitle className="text-sm truncate">
                                        {detail
                                            ? `#${detail.candidate.id} · ${t('admin.geo.submissionRow.pinCount', { count: detail.pins.length })}`
                                            : t('admin.geo.pickSubmission')}
                                    </CardTitle>
                                </div>
                                {detail && (
                                    <CandidateNavControls
                                        prev={prevCandidate}
                                        next={nextCandidate}
                                        currentIndex={currentIndex}
                                        total={flatCandidates.length}
                                        disabled={saving}
                                        onNavigate={openDetail}
                                        t={t}
                                    />
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3 p-4 sm:p-6 pt-0 sm:pt-0">
                            <CandidateDetailBody
                                detail={detail}
                                pin={pin}
                                setPin={setPin}
                                saving={saving}
                                onPromote={applyOverride}
                                onReject={() => setRejectOpen(true)}
                                onDemote={() => setDemoteOpen(true)}
                                t={t}
                            />
                        </CardContent>
                    </Card>
                </div>
            )}

            <Dialog open={introOpen} onOpenChange={setIntroOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{t('admin.geo.guide.title')}</DialogTitle>
                    </DialogHeader>
                    <ol className="grid gap-3 text-sm">
                        {(['step1', 'step2', 'step3'] as const).map((step) => (
                            <li key={step} className="space-y-1">
                                <p className="font-semibold text-foreground">
                                    {t(`admin.geo.guide.${step}Title`)}
                                </p>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    {t(`admin.geo.guide.${step}Body`)}
                                </p>
                            </li>
                        ))}
                    </ol>
                    <DialogFooter>
                        <Button onClick={() => setIntroOpen(false)}>
                            {t('admin.geo.guide.close')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={rejectOpen} onOpenChange={(open) => !saving && setRejectOpen(open)}>
                <DialogContent className="max-w-sm sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('admin.geo.declineDialog.title')}</DialogTitle>
                        <DialogDescription>
                            {t('admin.geo.declineDialog.description')}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setRejectOpen(false)}
                            disabled={saving}
                        >
                            {t('admin.geo.declineDialog.cancel')}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={confirmReject}
                            disabled={saving}
                        >
                            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />}
                            {t('admin.geo.declineDialog.confirm')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={demoteOpen} onOpenChange={(open) => !saving && setDemoteOpen(open)}>
                <DialogContent className="max-w-sm sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('admin.geo.removeOfficialDialog.title')}</DialogTitle>
                        <DialogDescription>
                            {t('admin.geo.removeOfficialDialog.description')}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setDemoteOpen(false)}
                            disabled={saving}
                        >
                            {t('admin.geo.removeOfficialDialog.cancel')}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={confirmDemote}
                            disabled={saving}
                        >
                            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />}
                            {t('admin.geo.removeOfficialDialog.confirm')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
                </TabsContent>
            </Tabs>
        </div>
    )
}

interface CandidateNavControlsProps {
    prev: GeoScreenshotCandidate | null
    next: GeoScreenshotCandidate | null
    currentIndex: number
    total: number
    disabled: boolean
    onNavigate: (id: number) => void | Promise<void>
    t: ReturnType<typeof useTranslation>['t']
}

function CandidateNavControls({
    prev,
    next,
    currentIndex,
    total,
    disabled,
    onNavigate,
    t,
}: CandidateNavControlsProps) {
    return (
        <div className="flex items-center gap-1 shrink-0">
            <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                disabled={!prev || disabled}
                onClick={() => prev && void onNavigate(prev.id)}
                aria-label={t('admin.geo.nav.previous')}
                title={t('admin.geo.nav.previous')}
            >
                <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            {currentIndex >= 0 && total > 0 && (
                <span
                    className="text-[10px] tabular-nums text-muted-foreground min-w-[2.5rem] text-center"
                    aria-live="polite"
                >
                    {t('admin.geo.nav.position', {
                        current: currentIndex + 1,
                        total,
                    })}
                </span>
            )}
            <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                disabled={!next || disabled}
                onClick={() => next && void onNavigate(next.id)}
                aria-label={t('admin.geo.nav.next')}
                title={t('admin.geo.nav.next')}
            >
                <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
        </div>
    )
}

interface CandidateDetailBodyProps {
    detail: CandidateDetail | null
    pin: GeoPoint | null
    setPin: (p: GeoPoint | null) => void
    saving: boolean
    onPromote: () => void | Promise<void>
    onReject: () => void
    onDemote: () => void
    t: ReturnType<typeof useTranslation>['t']
}

// Shared body for the candidate detail view — rendered inside the desktop
// side-card and the mobile bottom sheet. Keeps the pin canvas, image,
// status text and action buttons in one place so the two surfaces never
// drift.
function CandidateDetailBody({
    detail,
    pin,
    setPin,
    saving,
    onPromote,
    onReject,
    onDemote,
    t,
}: CandidateDetailBodyProps) {
    if (!detail || !detail.map) {
        return (
            <p className="text-xs text-muted-foreground">
                {t('admin.geo.detailHintOfficial')}
            </p>
        )
    }
    return (
        <>
            <img
                src={detail.candidate.imageUrl}
                alt={`Candidate ${detail.candidate.id}`}
                className="w-full rounded border max-h-48 object-contain bg-black/20"
            />
            <GeoMapCanvas
                imageUrl={detail.map.imageUrl}
                widthPx={detail.map.widthPx}
                heightPx={detail.map.heightPx}
                pin={pin}
                canonical={
                    detail.meta
                        ? {
                              x: detail.meta.canonical.x,
                              y: detail.meta.canonical.y,
                          }
                        : null
                }
                onPin={setPin}
                disabled={!!detail.meta}
            />
            {detail.meta ? (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
                    <p className="text-xs text-warning">
                        {t('admin.geo.alreadyOfficial')}
                    </p>
                    <Button
                        size="sm"
                        variant="destructive"
                        onClick={onDemote}
                        disabled={saving}
                        className="w-full sm:w-auto"
                    >
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        {t('admin.geo.actions.removeOfficial')}
                    </Button>
                </div>
            ) : (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                        {pin
                            ? `(${pin.x.toFixed(3)}, ${pin.y.toFixed(3)})`
                            : t(
                                  detail.pins.length === 0
                                      ? 'admin.geo.pickPointRequired'
                                      : 'admin.geo.pickPointForOfficial',
                              )}
                    </span>
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={onReject}
                            disabled={saving}
                            className="w-full sm:w-auto text-destructive border-destructive/40 hover:bg-destructive/10"
                        >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            {t('admin.geo.actions.decline')}
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => void onPromote()}
                            disabled={saving || (!pin && detail.pins.length === 0)}
                            className="gradient-gaming hover:opacity-90 w-full sm:w-auto"
                        >
                            {saving && (
                                <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                            )}
                            {t(
                                pin
                                    ? 'admin.geo.actions.makeOfficial'
                                    : 'admin.geo.actions.makeOfficialNoPin',
                            )}
                        </Button>
                    </div>
                </div>
            )}
        </>
    )
}
