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
    HelpCircle,
    MapPin,
    ListChecks,
    Library,
    Flag,
    X,
    Workflow,
    Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { GeoMapsTab } from './GeoMapsTab'
import { ModerationStatusRail } from './ModerationStatusRail'
import { ReportsModerationPanel } from './ReportsModerationPanel'
import { ReviewWorkspace } from './geo-review/ReviewWorkspace'
import GeoFetchPanel from './geo-fetch/GeoFetchPanel'
import { geoFetchApi } from '@/lib/api/geo-fetch'
import { useGeoRunPolling } from '@/hooks/useGeoRunPolling'
import { useGeoHealth } from '@/hooks/useGeoHealth'
import { useIsMobile } from '@/hooks/useIsMobile'
import { getApiErrorMessage } from '@/lib/api-errors'
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

type GeoSubTab = 'catalog' | 'acquisition' | 'queue' | 'reports'
const SUB_TABS: GeoSubTab[] = ['catalog', 'acquisition', 'queue', 'reports']
// Cold-start CTAs ("Activer un jeu") deep-link straight to the Candidats
// filter so the moderator lands on the curation funnel without a second
// click. Anything else just falls back to the default Activés filter.
type CatalogFilter = 'enabled' | 'no-map' | 'candidates' | 'all'
const CATALOG_FILTERS: CatalogFilter[] = ['enabled', 'no-map', 'candidates', 'all']

export function GeoReviewPanel() {
    const { t } = useTranslation()
    const isMobile = useIsMobile()
    // Sub-tab lives in the URL (`?sub=…`) so AdminPage's redirect map can
    // deep-link `?tab=geoFetch` straight into Acquisition and the
    // moderator's tab choice survives a refresh. The legacy `?view=…`
    // segment is read once for backward compatibility (cold-start CTAs)
    // but no longer written.
    const [searchParams, setSearchParams] = useSearchParams()
    const subFromUrl = searchParams.get('sub')
    const subInUrl: GeoSubTab | null =
        subFromUrl && (SUB_TABS as string[]).includes(subFromUrl)
            ? (subFromUrl as GeoSubTab)
            : null
    const viewFromUrl = searchParams.get('view')
    const filterFromUrl = searchParams.get('filter')
    const catalogFilterFromUrl: CatalogFilter | undefined =
        filterFromUrl && (CATALOG_FILTERS as string[]).includes(filterFromUrl)
            ? (filterFromUrl as CatalogFilter)
            : viewFromUrl === 'games'
              ? 'candidates'
              : undefined
    const setActiveTab = useCallback(
        (next: GeoSubTab) => {
            const params = new URLSearchParams(searchParams)
            if (next === 'queue') params.delete('sub')
            else params.set('sub', next)
            // `filter`/`view` are meaningful only on the Catalogue tab —
            // strip them when navigating away so URLs stay clean.
            if (next !== 'catalog') {
                params.delete('view')
                params.delete('filter')
            }
            setSearchParams(params, { replace: true })
        },
        [searchParams, setSearchParams],
    )
    const goToCatalogWithFilter = useCallback(
        (next: CatalogFilter) => {
            const params = new URLSearchParams(searchParams)
            params.set('sub', 'catalog')
            params.delete('view')
            if (next === 'enabled') params.delete('filter')
            else params.set('filter', next)
            setSearchParams(params, { replace: true })
        },
        [searchParams, setSearchParams],
    )
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
    const [fetchingMore, setFetchingMore] = useState(false)
    const [fetchMoreNotice, setFetchMoreNotice] = useState<string | null>(null)
    // Owned here (not inside GeoMapsTab) so an in-flight manual run keeps
    // polling and the live banner stays visible when the operator switches
    // between Pins / Maps / Games tabs.
    const { state: runState, error: runError, arm: armRunPolling } = useGeoRunPolling()
    // Single health subscription shared between the counter strip and the
    // cold-start banner — keeps them in sync without a duplicate poll.
    const { data: health, loading: healthLoading, error: healthError } = useGeoHealth()

    // When the URL doesn't pin a `sub`, route the moderator to the tab
    // where their next action lives, derived from the live health snapshot:
    //   queue.pending > 0       → queue        (steady-state daily routine)
    //   curated === 0           → catalog      (cold start: activate a game)
    //   withMap === 0           → acquisition  (games activated, ingest maps)
    //   otherwise               → queue        (empty queue is diagnostic)
    // We DON'T rewrite the URL — `subInUrl === null` keeps the URL clean
    // and explicit clicks still set `?sub=…` as before.
    const resolvedDefault: GeoSubTab | null = (() => {
        if (!health) return null
        const queueCount = health.queue.active + health.queue.waiting
        if (queueCount > 0) return 'queue'
        if (health.coverage.curated === 0) return 'catalog'
        if (health.coverage.withMap === 0) return 'acquisition'
        return 'queue'
    })()
    const activeTab: GeoSubTab = subInUrl ?? resolvedDefault ?? 'queue'
    // When the cold-start state-machine routes to `catalog`, pre-select the
    // Candidats filter so the CTA the moderator sees in the empty state is
    // the curation funnel (the actual first action they need to take).
    const effectiveCatalogFilter: CatalogFilter =
        !subInUrl && resolvedDefault === 'catalog' && !catalogFilterFromUrl
            ? 'candidates'
            : (catalogFilterFromUrl ?? 'enabled')

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setFetchMoreNotice(null)
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
                .catch((e) => !cancelled && setError(getApiErrorMessage(e)))
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
                .catch((e) => !cancelled && setError(getApiErrorMessage(e)))
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
            setError(getApiErrorMessage(e))
        }
    }

    // Returns the candidate the moderator should triage *after* `currentId`.
    // Uses the same flat (group-aware) ordering the UI renders, so "next"
    // mirrors what the eye expects. Filters out `currentId` first so the
    // advance still works on the `all` filter (where rejected/promoted
    // rows stay visible) — without this, `flat[oldIdx]` would re-open the
    // candidate we just acted on.
    const pickNextAfter = (
        rows: GeoScreenshotCandidate[],
        currentId: number,
        previousFlat: GeoScreenshotCandidate[],
    ): GeoScreenshotCandidate | null => {
        const flat = groupCandidatesByGame(rows)
            .flatMap((g) => g.candidates)
            .filter((c) => c.id !== currentId)
        if (flat.length === 0) return null
        const oldIdx = previousFlat.findIndex((c) => c.id === currentId)
        if (oldIdx >= 0) return flat[Math.min(oldIdx, flat.length - 1)]
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
            setError(getApiErrorMessage(e))
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

    // Re-runs the maps:pipeline for the currently filtered game so the
    // ingestion sources fetch a fresh batch of candidate captures. Uses the
    // same retry endpoint as the Acquisition tab — the orchestrator clears
    // the cooldown gate and re-queries every configured source. New
    // candidates flow back into this list as soon as the workers persist
    // them; the moderator can hit Refresh on the status filter to see them.
    const fetchMoreCaptures = async () => {
        if (!gameFilter || fetchingMore) return
        setFetchingMore(true)
        setFetchMoreNotice(null)
        setError(null)
        try {
            await geoFetchApi.retry(gameFilter.gameId)
            setFetchMoreNotice(t('admin.geo.fetchMoreQueued'))
        } catch (e) {
            setError(getApiErrorMessage(e))
        } finally {
            setFetchingMore(false)
        }
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
            setError(getApiErrorMessage(e))
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
            setError(getApiErrorMessage(e))
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

    // Map each candidate status to a Badge variant so the operator can
    // tell at a glance which rows are awaiting their action vs. already
    // resolved. Variants come from the design tokens (success/warning/
    // destructive) — no raw Tailwind palette.
    const statusVariant = (
        status: string,
    ): 'success' | 'warning' | 'destructive' | 'outline' => {
        switch (status) {
            case 'promoted':
                return 'success'
            case 'pending':
                return 'warning'
            case 'rejected':
                return 'destructive'
            default:
                return 'outline'
        }
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
                onMapsClick={() => goToCatalogWithFilter('enabled')}
                onPinsClick={() => {
                    setActiveTab('queue')
                    setStatusFilter('pending')
                    setGameFilter(null)
                }}
                onActivateGames={() => goToCatalogWithFilter('candidates')}
                onGoToAcquisition={() => setActiveTab('acquisition')}
            />

            <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as GeoSubTab)}
                className="space-y-4"
            >
                <TabsList className="w-full overflow-x-auto justify-start scrollbar-hide">
                    <TabsTrigger value="catalog" className="gap-1.5 shrink-0">
                        <Library className="h-3.5 w-3.5" />
                        {t('admin.geo.tabs.catalog')}
                    </TabsTrigger>
                    <TabsTrigger value="acquisition" className="gap-1.5 shrink-0">
                        <Workflow className="h-3.5 w-3.5" />
                        {t('admin.geo.tabs.acquisition')}
                    </TabsTrigger>
                    <TabsTrigger value="queue" className="gap-1.5 shrink-0">
                        <ListChecks className="h-3.5 w-3.5" />
                        {t('admin.geo.tabs.queue')}
                    </TabsTrigger>
                    <TabsTrigger value="reports" className="gap-1.5 shrink-0">
                        <Flag className="h-3.5 w-3.5" />
                        {t('admin.geo.tabs.reports')}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="acquisition" className="space-y-4">
                    <p className="text-xs text-muted-foreground">
                        {t('admin.geo.tabs.acquisitionDescription')}
                    </p>
                    {/* Folded the standalone "Cartes" admin tab in here so
                        ingestion controls live next door to the moderation
                        queue and the catalog they feed. The previous tab
                        duplicated triggers already exposed in
                        Catalogue › Cartes; the IA now keeps a single
                        ingestion entry-point. */}
                    <GeoFetchPanel />
                </TabsContent>

                <TabsContent value="reports" className="space-y-4">
                    <p className="text-xs text-muted-foreground">
                        {t('admin.geo.tabs.reportsDescription')}
                    </p>
                    <ReportsModerationPanel />
                </TabsContent>

                <TabsContent value="catalog" className="space-y-4">
                    <p className="text-xs text-muted-foreground">
                        {t('admin.geo.tabs.catalogDescription')}
                    </p>
                    {/* Maps + Games used to live behind a [Cartes | Jeux]
                        sub-toggle; the unified Catalogue datatable below
                        absorbs both surfaces with filter pills (Activés /
                        Sans carte / Candidats / Tous). The cold-start CTA
                        deep-links into the Candidats filter. */}
                    <GeoMapsTab
                        runState={runState}
                        runError={runError}
                        armRunPolling={armRunPolling}
                        onViewCaptures={viewCapturesForGame}
                        onGoToAcquisition={() => setActiveTab('acquisition')}
                        initialFilter={effectiveCatalogFilter}
                    />
                </TabsContent>

                <TabsContent value="queue" className="space-y-4">
            <p className="text-xs text-muted-foreground">
                {t('admin.geo.tabs.queueDescription')}
            </p>
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
                            'lg:col-span-1 lg:sticky lg:top-4 lg:self-start',
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
                        <CardContent className="space-y-3 lg:max-h-[calc(100vh-14rem)] overflow-auto p-4 sm:p-6 pt-0 sm:pt-0">
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
                                                <Badge variant={statusVariant(c.status)}>
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
                                    <div className="pt-2 border-t border-border/40 space-y-2">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => void fetchMoreCaptures()}
                                            disabled={fetchingMore}
                                            className="w-full justify-center gap-1.5 border-neon-pink/40 text-neon-pink hover:bg-neon-pink/10"
                                        >
                                            {fetchingMore ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                                            )}
                                            {t('admin.geo.fetchMore')}
                                        </Button>
                                        {fetchMoreNotice && (
                                            <p
                                                className="text-[11px] text-muted-foreground"
                                                role="status"
                                                aria-live="polite"
                                            >
                                                {fetchMoreNotice}
                                            </p>
                                        )}
                                    </div>
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

                    {/* Review workspace — side-by-side capture + map with
                        sticky action bar and keyboard shortcuts. On mobile
                        the workspace replaces the list (back-button restores
                        it); on lg+ both surfaces sit side-by-side. */}
                    <div
                        className={cn(
                            'lg:col-span-2',
                            !detail && 'hidden lg:block',
                        )}
                    >
                        <ReviewWorkspace
                            detail={detail}
                            pin={pin}
                            onPinChange={setPin}
                            saving={saving}
                            onPromote={applyOverride}
                            onReject={() => setRejectOpen(true)}
                            onDemote={() => setDemoteOpen(true)}
                            onCloseDetail={() => {
                                setDetail(null)
                                setPin(null)
                            }}
                            prevCandidate={prevCandidate}
                            nextCandidate={nextCandidate}
                            currentIndex={currentIndex}
                            total={flatCandidates.length}
                            onNavigate={openDetail}
                        />
                    </div>
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

