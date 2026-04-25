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
import { Loader2, Trash2, Info, MapPin, ChevronDown } from 'lucide-react'
import { GeoMapCanvas } from '@/components/geo/GeoMapCanvas'
import { GeoAdminActions } from './GeoAdminActions'
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

async function fetchCandidates(status?: string): Promise<GeoScreenshotCandidate[]> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : ''
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
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('collecting')
    const [candidates, setCandidates] = useState<GeoScreenshotCandidate[]>([])
    const [detail, setDetail] = useState<CandidateDetail | null>(null)
    const [pin, setPin] = useState<GeoPoint | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [demoteOpen, setDemoteOpen] = useState(false)
    const [introOpen, setIntroOpen] = useState(false)

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        fetchCandidates(statusFilter === 'all' ? undefined : statusFilter)
            .then((rows) => !cancelled && setCandidates(rows))
            .catch((e) => !cancelled && setError(String(e)))
            .finally(() => !cancelled && setLoading(false))
        return () => {
            cancelled = true
        }
    }, [statusFilter])

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
            const rows = await fetchCandidates(statusFilter === 'all' ? undefined : statusFilter)
            setCandidates(rows)
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

            <GeoAdminActions />

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
            </div>

            {error && (
                <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="flex justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-neon-pink" />
                </div>
            ) : (
                <div className="grid gap-4 lg:grid-cols-3">
                    <Card className="lg:col-span-1">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm">
                                {t('admin.geo.candidates')} ({candidates.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 max-h-[520px] overflow-auto">
                            {candidates.map((c) => (
                                <button
                                    key={c.id}
                                    onClick={() => openDetail(c.id)}
                                    className={`w-full text-left rounded border p-2 text-xs hover:bg-muted/40 ${
                                        detail?.candidate.id === c.id ? 'border-neon-pink' : ''
                                    }`}
                                >
                                    <div className="flex justify-between items-center">
                                        <span className="font-mono">#{c.id}</span>
                                        <Badge variant="outline">{statusLabel(c.status)}</Badge>
                                    </div>
                                    <div className="mt-1 text-muted-foreground">
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
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm">
                                {detail
                                    ? `#${detail.candidate.id} · ${t('admin.geo.candidateRow.pinCount', { count: detail.pins.length })}`
                                    : t('admin.geo.pickOne')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
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
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-xs text-warning">
                                                {t('admin.geo.alreadyPromoted')}
                                            </p>
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                onClick={() => setDemoteOpen(true)}
                                                disabled={saving}
                                            >
                                                <Trash2 className="h-3.5 w-3.5 mr-2" />
                                                {t('admin.geo.demote')}
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-muted-foreground">
                                                {pin
                                                    ? `(${pin.x.toFixed(3)}, ${pin.y.toFixed(3)})`
                                                    : t('admin.geo.pickPoint')}
                                            </span>
                                            <Button
                                                size="sm"
                                                onClick={applyOverride}
                                                disabled={!pin || saving}
                                                className="gradient-gaming hover:opacity-90"
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
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('admin.geo.demoteDialog.title')}</DialogTitle>
                        <DialogDescription>
                            {t('admin.geo.demoteDialog.description')}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
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
        </div>
    )
}
