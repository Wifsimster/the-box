import { useEffect, useReducer } from 'react'
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
import { Loader2, HelpCircle, X, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ReviewWorkspace } from './geo-review/ReviewWorkspace'
import { geoFetchApi } from '@/lib/api/geo-fetch'
import { useIsMobile } from '@/hooks/useIsMobile'
import { getApiErrorMessage } from '@/lib/api-errors'
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

export type StatusFilter = 'collecting' | 'pending' | 'promoted' | 'all'
export const STATUS_FILTERS: StatusFilter[] = ['collecting', 'pending', 'promoted', 'all']

export interface GameFilter {
    gameId: number
    gameName: string
}

interface CandidateGroup {
    gameId: number
    gameName: string | null
    candidates: GeoScreenshotCandidate[]
}

// Bucket candidates by their owning game so the Pins list renders one
// section per game instead of a flat #id list.
function groupCandidatesByGame(candidates: GeoScreenshotCandidate[]): CandidateGroup[] {
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
    return [...groups.values()].toSorted(
        (a, b) => b.candidates.length - a.candidates.length || a.gameId - b.gameId,
    )
}

async function fetchCandidates(args: { status?: string; gameId?: number }): Promise<GeoScreenshotCandidate[]> {
    const params = new URLSearchParams()
    if (args.status) params.set('status', args.status)
    if (args.gameId !== undefined) params.set('gameId', String(args.gameId))
    const qs = params.toString() ? `?${params.toString()}` : ''
    const res = await fetch(`/api/admin/geo/candidates${qs}`, { credentials: 'include' })
    if (!res.ok) throw new Error(`list failed: ${res.status}`)
    const json = await res.json()
    return json.data
}

async function fetchGameSummaries(args: { status?: string }): Promise<GeoCandidateGameSummary[]> {
    const params = new URLSearchParams()
    if (args.status) params.set('status', args.status)
    const qs = params.toString() ? `?${params.toString()}` : ''
    const res = await fetch(`/api/admin/geo/candidates/by-game${qs}`, { credentials: 'include' })
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
        body: JSON.stringify(pin ? { canonicalX: pin.x, canonicalY: pin.y } : {}),
    })
    if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error?.code ?? `override failed: ${res.status}`)
    }
}

async function deleteMeta(metaId: number): Promise<void> {
    const res = await fetch(`/api/admin/geo/meta/${metaId}`, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error?.code ?? `delete meta failed: ${res.status}`)
    }
}

async function rejectCandidate(id: number): Promise<void> {
    const res = await fetch(`/api/admin/geo/candidates/${id}/reject`, { method: 'POST', credentials: 'include' })
    if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error?.code ?? `reject failed: ${res.status}`)
    }
}

// Returns the candidate the moderator should triage *after* `currentId`, using
// the same flat (group-aware) ordering the UI renders.
function pickNextAfter(
    rows: GeoScreenshotCandidate[],
    currentId: number,
    previousFlat: GeoScreenshotCandidate[],
): GeoScreenshotCandidate | null {
    const flat: GeoScreenshotCandidate[] = []
    for (const group of groupCandidatesByGame(rows)) {
        for (const c of group.candidates) {
            if (c.id !== currentId) flat.push(c)
        }
    }
    if (flat.length === 0) return null
    const oldIdx = previousFlat.findIndex((c) => c.id === currentId)
    if (oldIdx >= 0) return flat[Math.min(oldIdx, flat.length - 1)]
    return flat[0]
}

// Map each candidate status to a Badge variant.
function statusVariant(status: string): 'success' | 'warning' | 'destructive' | 'outline' {
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

// Days between `iso` and now, rounded down to whole days.
function daysSince(iso: string | null): number | null {
    if (!iso) return null
    const ts = Date.parse(iso)
    if (Number.isNaN(ts)) return null
    const ms = Date.now() - ts
    if (ms <= 0) return 0
    return Math.floor(ms / (1000 * 60 * 60 * 24))
}

function summaryCountFor(s: GeoCandidateGameSummary, statusFilter: StatusFilter): number {
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

// The candidate list / detail / dialog flags are one cohesive review slice that
// must update atomically (e.g. promoting advances to the next candidate while
// clearing the pin and error), so they live in a single reducer.
type ReviewDialog = 'reject' | 'demote' | 'intro' | null

interface QueueState {
    candidates: GeoScreenshotCandidate[]
    summaries: GeoCandidateGameSummary[]
    detail: CandidateDetail | null
    pin: GeoPoint | null
    loading: boolean
    saving: boolean
    error: string | null
    dialog: ReviewDialog
    fetchingMore: boolean
    fetchMoreNotice: string | null
}

type QueueAction =
    | { type: 'loadStart' }
    | { type: 'loadCandidates'; rows: GeoScreenshotCandidate[] }
    | { type: 'loadSummaries'; rows: GeoCandidateGameSummary[] }
    | { type: 'loadError'; error: string }
    | { type: 'setCandidates'; rows: GeoScreenshotCandidate[] }
    | { type: 'setDetail'; detail: CandidateDetail | null }
    | { type: 'setPin'; pin: GeoPoint | null }
    | { type: 'setError'; error: string | null }
    | { type: 'setSaving'; saving: boolean }
    | { type: 'openDialog'; dialog: ReviewDialog }
    | { type: 'fetchMoreStart' }
    | { type: 'fetchMoreDone'; notice: string | null }

const INITIAL_QUEUE: QueueState = {
    candidates: [],
    summaries: [],
    detail: null,
    pin: null,
    loading: true,
    saving: false,
    error: null,
    dialog: null,
    fetchingMore: false,
    fetchMoreNotice: null,
}

function queueReducer(state: QueueState, action: QueueAction): QueueState {
    switch (action.type) {
        case 'loadStart':
            return { ...state, loading: true, fetchMoreNotice: null }
        case 'loadCandidates':
            return { ...state, candidates: action.rows, loading: false }
        case 'loadSummaries':
            return { ...state, summaries: action.rows, candidates: [], loading: false }
        case 'loadError':
            return { ...state, error: action.error, loading: false }
        case 'setCandidates':
            return { ...state, candidates: action.rows }
        case 'setDetail':
            return { ...state, detail: action.detail }
        case 'setPin':
            return { ...state, pin: action.pin }
        case 'setError':
            return { ...state, error: action.error }
        case 'setSaving':
            return { ...state, saving: action.saving }
        case 'openDialog':
            return { ...state, dialog: action.dialog }
        case 'fetchMoreStart':
            return { ...state, fetchingMore: true, fetchMoreNotice: null, error: null }
        case 'fetchMoreDone':
            return { ...state, fetchingMore: false, fetchMoreNotice: action.notice }
    }
}

interface GeoReviewQueueProps {
    statusFilter: StatusFilter
    onStatusFilterChange: (s: StatusFilter) => void
    gameFilter: GameFilter | null
    onGameFilterChange: (g: GameFilter | null) => void
}

export function GeoReviewQueue({
    statusFilter,
    onStatusFilterChange,
    gameFilter,
    onGameFilterChange,
}: GeoReviewQueueProps) {
    const { t } = useTranslation()
    const isMobile = useIsMobile()
    const [state, dispatch] = useReducer(queueReducer, INITIAL_QUEUE)
    const {
        candidates,
        summaries,
        detail,
        pin,
        loading,
        saving,
        error,
        dialog,
        fetchingMore,
        fetchMoreNotice,
    } = state

    useEffect(() => {
        let cancelled = false
        dispatch({ type: 'loadStart' })
        const status = statusFilter === 'all' ? undefined : statusFilter
        const gameId = gameFilter?.gameId
        if (gameId !== undefined) {
            fetchCandidates({ status, gameId })
                .then((rows) => !cancelled && dispatch({ type: 'loadCandidates', rows }))
                .catch((e) => !cancelled && dispatch({ type: 'loadError', error: getApiErrorMessage(e) }))
        } else {
            fetchGameSummaries({ status })
                .then((rows) => !cancelled && dispatch({ type: 'loadSummaries', rows }))
                .catch((e) => !cancelled && dispatch({ type: 'loadError', error: getApiErrorMessage(e) }))
        }
        return () => {
            cancelled = true
        }
    }, [statusFilter, gameFilter?.gameId])

    const openDetail = async (id: number) => {
        dispatch({ type: 'setError', error: null })
        dispatch({ type: 'setPin', pin: null })
        try {
            const d = await fetchCandidateDetail(id)
            dispatch({ type: 'setDetail', detail: d })
        } catch (e) {
            dispatch({ type: 'setError', error: getApiErrorMessage(e) })
        }
    }

    const advanceAfterAction = async (currentId: number, previousFlat: GeoScreenshotCandidate[]) => {
        const rows = await fetchCandidates({
            status: statusFilter === 'all' ? undefined : statusFilter,
            gameId: gameFilter?.gameId,
        })
        dispatch({ type: 'setCandidates', rows })
        const next = pickNextAfter(rows, currentId, previousFlat)
        dispatch({ type: 'setPin', pin: null })
        if (next) {
            await openDetail(next.id)
        } else {
            dispatch({ type: 'setDetail', detail: null })
            if (rows.length === 0 && gameFilter) onGameFilterChange(null)
        }
    }

    const applyOverride = async () => {
        if (!detail) return
        dispatch({ type: 'setSaving', saving: true })
        try {
            const previousFlat = groupCandidatesByGame(candidates).flatMap((g) => g.candidates)
            const currentId = detail.candidate.id
            await overrideCandidate(currentId, pin)
            await advanceAfterAction(currentId, previousFlat)
        } catch (e) {
            dispatch({ type: 'setError', error: getApiErrorMessage(e) })
        } finally {
            dispatch({ type: 'setSaving', saving: false })
        }
    }

    const fetchMoreCaptures = async () => {
        if (!gameFilter || fetchingMore) return
        dispatch({ type: 'fetchMoreStart' })
        try {
            await geoFetchApi.retry(gameFilter.gameId)
            dispatch({ type: 'fetchMoreDone', notice: t('admin.geo.fetchMoreQueued') })
        } catch (e) {
            dispatch({ type: 'fetchMoreDone', notice: null })
            dispatch({ type: 'setError', error: getApiErrorMessage(e) })
        }
    }

    const confirmReject = async () => {
        if (!detail) return
        dispatch({ type: 'setError', error: null })
        dispatch({ type: 'setSaving', saving: true })
        try {
            const previousFlat = groupCandidatesByGame(candidates).flatMap((g) => g.candidates)
            const currentId = detail.candidate.id
            await rejectCandidate(currentId)
            dispatch({ type: 'openDialog', dialog: null })
            await advanceAfterAction(currentId, previousFlat)
        } catch (e) {
            dispatch({ type: 'setError', error: getApiErrorMessage(e) })
        } finally {
            dispatch({ type: 'setSaving', saving: false })
        }
    }

    const confirmDemote = async () => {
        if (!detail?.meta) return
        dispatch({ type: 'setError', error: null })
        dispatch({ type: 'setSaving', saving: true })
        try {
            await deleteMeta(detail.meta.id)
            const fresh = await fetchCandidateDetail(detail.candidate.id)
            dispatch({ type: 'setDetail', detail: fresh })
            dispatch({ type: 'setPin', pin: null })
            dispatch({ type: 'openDialog', dialog: null })
        } catch (e) {
            dispatch({ type: 'setError', error: getApiErrorMessage(e) })
        } finally {
            dispatch({ type: 'setSaving', saving: false })
        }
    }

    const viewCapturesForGame = (gameId: number, gameName: string) => {
        onGameFilterChange({ gameId, gameName })
        onStatusFilterChange('all')
        dispatch({ type: 'setDetail', detail: null })
    }

    const flatCandidates = groupCandidatesByGame(candidates).flatMap((g) => g.candidates)
    const currentIndex = detail ? flatCandidates.findIndex((c) => c.id === detail.candidate.id) : -1
    const prevCandidate = currentIndex > 0 ? flatCandidates[currentIndex - 1] : null
    const nextCandidate =
        currentIndex >= 0 && currentIndex < flatCandidates.length - 1
            ? flatCandidates[currentIndex + 1]
            : null

    const visibleSummaries = summaries.filter((s) => summaryCountFor(s, statusFilter) > 0)

    return (
        <>
            <p className="text-xs text-muted-foreground">{t('admin.geo.tabs.queueDescription')}</p>
            {/* Status filter */}
            <fieldset
                className="m-0 flex flex-wrap items-center gap-2 border-0 p-0"
                aria-label={t('admin.geo.statusFilter.label')}
            >
                {STATUS_FILTERS.map((s) => (
                    <Button
                        key={s}
                        type="button"
                        size="sm"
                        variant={statusFilter === s ? 'default' : 'outline'}
                        onClick={() => onStatusFilterChange(s)}
                    >
                        {t(`admin.geo.statusFilter.${s}`)}
                    </Button>
                ))}
                {gameFilter && (
                    <Badge
                        variant="outline"
                        className="ml-1 gap-1.5 border-neon-pink/40 bg-neon-pink/5 text-neon-pink"
                    >
                        {t('admin.geo.gameFilter.active', { name: gameFilter.gameName })}
                        <button
                            type="button"
                            onClick={() => onGameFilterChange(null)}
                            aria-label={t('admin.geo.gameFilter.clear')}
                            className="rounded hover:bg-neon-pink/10"
                        >
                            <X className="size-3" aria-hidden />
                        </button>
                    </Badge>
                )}
            </fieldset>

            {error && (
                <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                    {error}
                </div>
            )}

            {loading ? (
                <output
                    className="flex justify-center py-16"
                    aria-live="polite"
                    aria-busy="true"
                    aria-label={t('admin.geo.submissionsLoading')}
                >
                    <Loader2 className="size-6 animate-spin text-neon-pink" aria-hidden />
                </output>
            ) : (
                <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-3">
                    <QueueSidebar
                        gameFilter={gameFilter}
                        candidates={candidates}
                        summariesCount={summaries.length}
                        visibleSummaries={visibleSummaries}
                        detail={detail}
                        isMobile={isMobile}
                        statusFilter={statusFilter}
                        fetchingMore={fetchingMore}
                        fetchMoreNotice={fetchMoreNotice}
                        onOpenDetail={openDetail}
                        onFetchMore={fetchMoreCaptures}
                        onViewCaptures={viewCapturesForGame}
                        onOpenIntro={() => dispatch({ type: 'openDialog', dialog: 'intro' })}
                    />

                    <div className={cn('lg:col-span-2', !detail && 'hidden lg:block')}>
                        <ReviewWorkspace
                            detail={detail}
                            pin={pin}
                            onPinChange={(p) => dispatch({ type: 'setPin', pin: p })}
                            saving={saving}
                            onPromote={applyOverride}
                            onReject={() => dispatch({ type: 'openDialog', dialog: 'reject' })}
                            onDemote={() => dispatch({ type: 'openDialog', dialog: 'demote' })}
                            onCloseDetail={() => {
                                dispatch({ type: 'setDetail', detail: null })
                                dispatch({ type: 'setPin', pin: null })
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

            <QueueDialogs
                dialog={dialog}
                saving={saving}
                onClose={() => dispatch({ type: 'openDialog', dialog: null })}
                onConfirmReject={confirmReject}
                onConfirmDemote={confirmDemote}
            />
        </>
    )
}

function QueueDialogs({
    dialog,
    saving,
    onClose,
    onConfirmReject,
    onConfirmDemote,
}: {
    dialog: ReviewDialog
    saving: boolean
    onClose: () => void
    onConfirmReject: () => void
    onConfirmDemote: () => void
}) {
    const { t } = useTranslation()
    return (
        <>
            <Dialog open={dialog === 'intro'} onOpenChange={(open) => !open && onClose()}>
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
                        <Button onClick={onClose}>{t('admin.geo.guide.close')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={dialog === 'reject'} onOpenChange={(open) => !saving && !open && onClose()}>
                <DialogContent className="max-w-sm sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('admin.geo.declineDialog.title')}</DialogTitle>
                        <DialogDescription>{t('admin.geo.declineDialog.description')}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
                        <Button variant="outline" onClick={onClose} disabled={saving}>
                            {t('admin.geo.declineDialog.cancel')}
                        </Button>
                        <Button variant="destructive" onClick={onConfirmReject} disabled={saving}>
                            {saving && <Loader2 className="size-3.5 animate-spin mr-2" />}
                            {t('admin.geo.declineDialog.confirm')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={dialog === 'demote'} onOpenChange={(open) => !saving && !open && onClose()}>
                <DialogContent className="max-w-sm sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('admin.geo.removeOfficialDialog.title')}</DialogTitle>
                        <DialogDescription>
                            {t('admin.geo.removeOfficialDialog.description')}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
                        <Button variant="outline" onClick={onClose} disabled={saving}>
                            {t('admin.geo.removeOfficialDialog.cancel')}
                        </Button>
                        <Button variant="destructive" onClick={onConfirmDemote} disabled={saving}>
                            {saving && <Loader2 className="size-3.5 animate-spin mr-2" />}
                            {t('admin.geo.removeOfficialDialog.confirm')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}

function QueueSidebar({
    gameFilter,
    candidates,
    summariesCount,
    visibleSummaries,
    detail,
    isMobile,
    statusFilter,
    fetchingMore,
    fetchMoreNotice,
    onOpenDetail,
    onFetchMore,
    onViewCaptures,
    onOpenIntro,
}: {
    gameFilter: GameFilter | null
    candidates: GeoScreenshotCandidate[]
    summariesCount: number
    visibleSummaries: GeoCandidateGameSummary[]
    detail: CandidateDetail | null
    isMobile: boolean
    statusFilter: StatusFilter
    fetchingMore: boolean
    fetchMoreNotice: string | null
    onOpenDetail: (id: number) => void
    onFetchMore: () => void | Promise<void>
    onViewCaptures: (gameId: number, gameName: string) => void
    onOpenIntro: () => void
}) {
    const { t } = useTranslation()
    const statusLabel = (status: string): string => {
        const key = `admin.geo.statusBadge.${status}`
        const translated = t(key)
        return translated === key ? status : translated
    }
    return (
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
                                        : t('admin.geo.gamesList.header', { count: summariesCount })}
                                </CardTitle>
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="size-7 text-muted-foreground hover:text-neon-pink"
                                    onClick={onOpenIntro}
                                    aria-label={t('admin.geo.guide.title')}
                                >
                                    <HelpCircle className="size-4" />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3 lg:max-h-[calc(100vh-14rem)] overflow-auto p-4 sm:p-6 pt-0 sm:pt-0">
                            {gameFilter ? (
                                <>
                                    {candidates.map((c) => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => onOpenDetail(c.id)}
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
                                                {t('admin.geo.submissionRow.pinCount', { count: c.pinCount })}
                                                {' · '}
                                                {t('admin.geo.submissionRow.source', { source: c.source })}
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
                                            onClick={() => void onFetchMore()}
                                            disabled={fetchingMore}
                                            className="w-full justify-center gap-1.5 border-neon-pink/40 text-neon-pink hover:bg-neon-pink/10"
                                        >
                                            {fetchingMore ? (
                                                <Loader2 className="size-3.5 animate-spin" />
                                            ) : (
                                                <Sparkles className="size-3.5" aria-hidden />
                                            )}
                                            {t('admin.geo.fetchMore')}
                                        </Button>
                                        {fetchMoreNotice && (
                                            <output className="block text-[11px] text-muted-foreground" aria-live="polite">
                                                {fetchMoreNotice}
                                            </output>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <>
                                    {visibleSummaries.map((s) => {
                                        const primary = summaryCountFor(s, statusFilter)
                                        const days = daysSince(s.oldestPendingAt)
                                        return (
                                            <button
                                                key={s.gameId}
                                                type="button"
                                                onClick={() =>
                                                    onViewCaptures(
                                                        s.gameId,
                                                        s.gameName ??
                                                            t('admin.geo.groupHeader.unknownGame', { id: s.gameId }),
                                                    )
                                                }
                                                className="w-full text-left rounded border p-3 text-xs hover:bg-muted/40 active:bg-muted/60 transition-colors"
                                            >
                                                <div className="flex items-baseline justify-between gap-2">
                                                    <h3 className="truncate text-sm font-semibold text-foreground">
                                                        {s.gameName ??
                                                            t('admin.geo.groupHeader.unknownGame', { id: s.gameId })}
                                                    </h3>
                                                    <span className="shrink-0 font-mono text-sm font-bold text-neon-pink">
                                                        {primary}
                                                    </span>
                                                </div>
                                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                                                    <span>
                                                        {t(`admin.geo.gamesList.count.${statusFilter}`, {
                                                            count: primary,
                                                        })}
                                                    </span>
                                                    {statusFilter !== 'pending' && s.pendingCount > 0 && (
                                                        <Badge variant="outline" className="h-4 px-1 text-[10px]">
                                                            {t('admin.geo.gamesList.count.pending', {
                                                                count: s.pendingCount,
                                                            })}
                                                        </Badge>
                                                    )}
                                                    {days !== null && s.pendingCount > 0 && (
                                                        <span>
                                                            {' · '}
                                                            {t('admin.geo.gamesList.oldestPending', {
                                                                relative:
                                                                    days === 0
                                                                        ? t('admin.geo.gamesList.relative.today')
                                                                        : t('admin.geo.gamesList.relative.daysAgo', {
                                                                              count: days,
                                                                          }),
                                                            })}
                                                        </span>
                                                    )}
                                                </div>
                                            </button>
                                        )
                                    })}
                                    {visibleSummaries.length === 0 && (
                                        <p className="text-xs text-muted-foreground">
                                            {t('admin.geo.emptyQueue')}
                                        </p>
                                    )}
                                </>
                            )}
                        </CardContent>
                    </Card>
    )
}
