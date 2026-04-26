import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'
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
    Info,
    MapPin,
    ChevronDown,
    Map,
    ListChecks,
    Library,
    X,
} from 'lucide-react'
import { GeoMapCanvas } from '@/components/geo/GeoMapCanvas'
import { GeoMapsTab } from './GeoMapsTab'
import { GeoGamesTab } from './GeoGamesTab'
import { GeoHeaderStrip } from './GeoHeaderStrip'
import { GeoRunStateBanner } from './GeoRunStateBanner'
import { GeoColdStartBanner } from './GeoColdStartBanner'
import { useGeoRunPolling } from '@/hooks/useGeoRunPolling'
import { useGeoHealth } from '@/hooks/useGeoHealth'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type {
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

async function fetchCandidateDetail(id: number): Promise<CandidateDetail> {
    const res = await fetch(`/api/admin/geo/candidates/${id}`, { credentials: 'include' })
    if (!res.ok) throw new Error(`detail failed: ${res.status}`)
    const json = await res.json()
    return json.data
}

async function overrideCandidate(id: number, pin: GeoPoint): Promise<void> {
    const res = await fetch(`/api/admin/geo/candidates/${id}/override`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonicalX: pin.x, canonicalY: pin.y }),
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

export function GeoReviewPanel() {
    const { t } = useTranslation()
    const [activeTab, setActiveTab] = useState<'pins' | 'maps' | 'games'>('pins')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('collecting')
    // Per-game filter for the Pins tab. Set when the operator clicks "Voir
    // les captures" on a Maps row so the candidate list narrows to that game.
    // Cleared via the badge in the Pins header.
    const [gameFilter, setGameFilter] = useState<{
        gameId: number
        gameName: string
    } | null>(null)
    const [candidates, setCandidates] = useState<GeoScreenshotCandidate[]>([])
    const [detail, setDetail] = useState<CandidateDetail | null>(null)
    const [pin, setPin] = useState<GeoPoint | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [demoteOpen, setDemoteOpen] = useState(false)
    const [introOpen, setIntroOpen] = useState(false)
    const [scheduling, setScheduling] = useState(false)
    // Owned here (not inside GeoMapsTab) so an in-flight manual run keeps
    // polling and the live banner stays visible when the operator switches
    // between Pins / Maps / Games tabs.
    const { state: runState, error: runError, arm: armRunPolling } = useGeoRunPolling()
    // Single health subscription shared between the counter strip and the
    // cold-start banner — keeps them in sync without a duplicate poll.
    const { data: health, loading: healthLoading, error: healthError } = useGeoHealth()

    const triggerSchedule = async () => {
        setScheduling(true)
        setError(null)
        try {
            const res = await fetch('/api/admin/geo/schedule', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: '{}',
            })
            if (!res.ok) {
                const json = await res.json().catch(() => ({}))
                throw new Error(json?.error?.code ?? `schedule failed: ${res.status}`)
            }
        } catch (e) {
            setError(String(e))
        } finally {
            setScheduling(false)
        }
    }

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        fetchCandidates({
            status: statusFilter === 'all' ? undefined : statusFilter,
            gameId: gameFilter?.gameId,
        })
            .then((rows) => !cancelled && setCandidates(rows))
            .catch((e) => !cancelled && setError(String(e)))
            .finally(() => !cancelled && setLoading(false))
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

    const applyOverride = async () => {
        if (!detail || !pin) return
        setSaving(true)
        try {
            await overrideCandidate(detail.candidate.id, pin)
            // Refresh the list + clear the detail pane.
            setDetail(null)
            setPin(null)
            const rows = await fetchCandidates({
                status: statusFilter === 'all' ? undefined : statusFilter,
                gameId: gameFilter?.gameId,
            })
            setCandidates(rows)
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
        setActiveTab('pins')
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

    const statusLabel = (status: string): string => {
        // Translate known statuses; fall back to the raw value for unknown statuses
        // (rejected, archived, etc.) so we never silently hide data.
        const key = `admin.geo.statusBadge.${status}`
        const translated = t(key)
        return translated === key ? status : translated
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

            <GeoHeaderStrip
                onScheduleClick={() => void triggerSchedule()}
                scheduling={scheduling}
                health={health}
                loading={healthLoading}
                error={healthError}
            />

            <GeoColdStartBanner health={health} />

            <GeoRunStateBanner state={runState} />

            <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as 'pins' | 'maps' | 'games')}
                className="space-y-4"
            >
                <TabsList className="w-full overflow-x-auto justify-start scrollbar-hide">
                    <TabsTrigger value="pins" className="gap-1.5 shrink-0">
                        <ListChecks className="h-3.5 w-3.5" />
                        {t('admin.geo.tabs.pins')}
                    </TabsTrigger>
                    <TabsTrigger value="maps" className="gap-1.5 shrink-0">
                        <Map className="h-3.5 w-3.5" />
                        {t('admin.geo.tabs.maps')}
                    </TabsTrigger>
                    <TabsTrigger value="games" className="gap-1.5 shrink-0">
                        <Library className="h-3.5 w-3.5" />
                        {t('admin.geo.tabs.games')}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="maps" className="space-y-4">
                    <GeoMapsTab
                        runState={runState}
                        runError={runError}
                        armRunPolling={armRunPolling}
                        onViewCaptures={viewCapturesForGame}
                    />
                </TabsContent>

                <TabsContent value="games" className="space-y-4">
                    <GeoGamesTab />
                </TabsContent>

                <TabsContent value="pins" className="space-y-4">
            {/* Workflow explainer */}
            <Collapsible open={introOpen} onOpenChange={setIntroOpen}>
                <Card className="border-neon-pink/30 bg-linear-to-r from-neon-pink/5 via-neon-purple/5 to-transparent">
                    <CollapsibleTrigger asChild>
                        <button
                            type="button"
                            className="flex w-full items-center justify-between gap-2 px-6 py-3 text-left"
                            aria-expanded={introOpen}
                        >
                            <span className="text-sm font-semibold flex items-center gap-2">
                                <Info className="h-4 w-4 text-neon-pink" />
                                {t('admin.geo.intro.title')}
                            </span>
                            <ChevronDown
                                className={`h-4 w-4 text-muted-foreground transition-transform ${introOpen ? 'rotate-180' : ''}`}
                                aria-hidden
                            />
                        </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <CardContent className="pt-0">
                            <ol className="grid gap-3 sm:grid-cols-3 text-sm">
                                {(['step1', 'step2', 'step3'] as const).map((step) => (
                                    <li key={step} className="space-y-1">
                                        <p className="font-semibold text-foreground">
                                            {t(`admin.geo.intro.${step}Title`)}
                                        </p>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            {t(`admin.geo.intro.${step}Body`)}
                                        </p>
                                    </li>
                                ))}
                            </ol>
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

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
                    aria-label={t('admin.geo.candidatesLoading')}
                >
                    <Loader2
                        className="h-6 w-6 animate-spin text-neon-pink"
                        aria-hidden
                    />
                </div>
            ) : (
                <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-3">
                    <Card className="lg:col-span-1">
                        <CardHeader className="pb-2 p-4 sm:p-6">
                            <CardTitle className="text-sm">
                                {t('admin.geo.candidates')} ({candidates.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 max-h-[300px] sm:max-h-[520px] overflow-auto p-4 sm:p-6 pt-0 sm:pt-0">
                            {candidates.map((c) => (
                                <button
                                    key={c.id}
                                    onClick={() => openDetail(c.id)}
                                    className={`w-full text-left rounded border p-2 text-xs hover:bg-muted/40 ${
                                        detail?.candidate.id === c.id ? 'border-neon-pink' : ''
                                    }`}
                                >
                                    <div className="flex justify-between items-center gap-2">
                                        <span className="truncate font-medium">
                                            {c.gameName ?? `#${c.id}`}
                                        </span>
                                        <Badge variant="outline">{statusLabel(c.status)}</Badge>
                                    </div>
                                    <div className="mt-1 text-muted-foreground">
                                        <span className="font-mono">#{c.id}</span>
                                        {' · '}
                                        {t('admin.geo.candidateRow.pinCount', { count: c.pinCount })}
                                        {' · '}
                                        {t('admin.geo.candidateRow.source', { source: c.source })}
                                    </div>
                                </button>
                            ))}
                            {candidates.length === 0 && (
                                <p className="text-xs text-muted-foreground">
                                    {t('admin.geo.empty')}
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="lg:col-span-2">
                        <CardHeader className="pb-2 p-4 sm:p-6">
                            <CardTitle className="text-sm">
                                {detail
                                    ? `#${detail.candidate.id} · ${t('admin.geo.candidateRow.pinCount', { count: detail.pins.length })}`
                                    : t('admin.geo.pickOne')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 p-4 sm:p-6 pt-0 sm:pt-0">
                            {detail && detail.map ? (
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
                                                {t('admin.geo.alreadyPromoted')}
                                            </p>
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                onClick={() => setDemoteOpen(true)}
                                                disabled={saving}
                                                className="w-full sm:w-auto"
                                            >
                                                <Trash2 className="h-3.5 w-3.5 mr-2" />
                                                {t('admin.geo.demote')}
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                            <span className="text-xs text-muted-foreground">
                                                {pin
                                                    ? `(${pin.x.toFixed(3)}, ${pin.y.toFixed(3)})`
                                                    : t('admin.geo.pickPoint')}
                                            </span>
                                            <Button
                                                size="sm"
                                                onClick={applyOverride}
                                                disabled={!pin || saving}
                                                className="gradient-gaming hover:opacity-90 w-full sm:w-auto"
                                            >
                                                {saving && (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                                                )}
                                                {t('admin.geo.promote')}
                                            </Button>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    {t('admin.geo.detailHint')}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            <Dialog open={demoteOpen} onOpenChange={(open) => !saving && setDemoteOpen(open)}>
                <DialogContent className="max-w-sm sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('admin.geo.demoteDialog.title')}</DialogTitle>
                        <DialogDescription>
                            {t('admin.geo.demoteDialog.description')}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setDemoteOpen(false)}
                            disabled={saving}
                        >
                            {t('admin.geo.demoteDialog.cancel')}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={confirmDemote}
                            disabled={saving}
                        >
                            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />}
                            {t('admin.geo.demoteDialog.confirm')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
                </TabsContent>
            </Tabs>
        </div>
    )
}
