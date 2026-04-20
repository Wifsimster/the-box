import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Trash2 } from 'lucide-react'
import { GeoMap } from '@/components/geo/GeoMap'
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
    const [statusFilter, setStatusFilter] = useState<'pending' | 'collecting' | 'promoted' | 'all'>(
        'collecting',
    )
    const [candidates, setCandidates] = useState<GeoScreenshotCandidate[]>([])
    const [detail, setDetail] = useState<CandidateDetail | null>(null)
    const [pin, setPin] = useState<GeoPoint | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

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

    const handleDeleteMeta = async () => {
        if (!detail?.meta) return
        // Destructive on a public canonical — confirm explicitly.
        if (!window.confirm('Demote this meta? It will become a collecting candidate again.')) return
        setError(null)
        setSaving(true)
        try {
            await deleteMeta(detail.meta.id)
            // Reload the detail (now meta-less) so the admin can re-pin.
            const fresh = await fetchCandidateDetail(detail.candidate.id)
            setDetail(fresh)
            setPin(null)
        } catch (e) {
            setError(String(e))
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="space-y-4">
            <GeoAdminActions />

            <div className="flex items-center gap-2">
                {(['collecting', 'pending', 'promoted', 'all'] as const).map((s) => (
                    <Button
                        key={s}
                        size="sm"
                        variant={statusFilter === s ? 'default' : 'outline'}
                        onClick={() => setStatusFilter(s)}
                    >
                        {s}
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
                                {t('admin.geo.candidates', 'Candidates')} ({candidates.length})
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
                                        <Badge variant="outline">{c.status}</Badge>
                                    </div>
                                    <div className="mt-1 text-muted-foreground">
                                        {c.pinCount} pins · {c.source}
                                    </div>
                                </button>
                            ))}
                            {candidates.length === 0 && (
                                <p className="text-xs text-muted-foreground">
                                    {t('admin.geo.empty', 'No candidates match this filter.')}
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="lg:col-span-2">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm">
                                {detail
                                    ? `#${detail.candidate.id} · ${detail.pins.length} ${t('admin.geo.pins', 'pins')}`
                                    : t('admin.geo.pickOne', 'Pick a candidate')}
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
                                    <GeoMap
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
                                                {t(
                                                    'admin.geo.alreadyPromoted',
                                                    'Already promoted — delete to re-pin with new coords.',
                                                )}
                                            </p>
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                onClick={handleDeleteMeta}
                                                disabled={saving}
                                            >
                                                {saving ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                                                ) : (
                                                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                                                )}
                                                {t('admin.geo.demote', 'Demote canonical')}
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-muted-foreground">
                                                {pin
                                                    ? `(${pin.x.toFixed(3)}, ${pin.y.toFixed(3)})`
                                                    : t(
                                                          'admin.geo.pickPoint',
                                                          'Click the map to set canonical coordinates',
                                                      )}
                                            </span>
                                            <Button
                                                size="sm"
                                                onClick={applyOverride}
                                                disabled={!pin || saving}
                                                className="bg-gradient-to-r from-neon-purple to-neon-pink hover:opacity-90"
                                            >
                                                {saving && (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                                                )}
                                                {t('admin.geo.promote', 'Promote to canonical')}
                                            </Button>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    {t(
                                        'admin.geo.detailHint',
                                        'Select a candidate from the list to review its pins and optionally set canonical coordinates.',
                                    )}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    )
}
