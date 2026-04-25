import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from '@/lib/toast'
import { Loader2, RefreshCw, Undo2, Flag, ImageOff } from 'lucide-react'
import type { ScreenshotReportReason } from '@the-box/types'

interface ReportSummary {
    screenshotId?: number
    geoScreenshotCandidateId?: number
    reportCount: number
    lastReportedAt: string
    isActive: boolean
    imageUrl?: string
    thumbnailUrl?: string
    gameName?: string
    reasons: Partial<Record<ScreenshotReportReason, number>>
}

async function fetchReports(onlyDeactivated: boolean): Promise<ReportSummary[]> {
    const url = `/api/admin/screenshot-reports${onlyDeactivated ? '?onlyDeactivated=true' : ''}`
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) throw new Error(`list failed: ${res.status}`)
    const json = await res.json()
    return json.data as ReportSummary[]
}

async function reactivate(target: {
    screenshotId?: number
    geoScreenshotCandidateId?: number
}): Promise<{ reactivated: boolean }> {
    const res = await fetch('/api/admin/screenshot-reports/reactivate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(target),
    })
    if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error?.code ?? `reactivate failed: ${res.status}`)
    }
    const json = await res.json()
    return json.data
}

export function ReportsModerationPanel() {
    const { t, i18n } = useTranslation()
    const [reports, setReports] = useState<ReportSummary[] | null>(null)
    const [onlyDeactivated, setOnlyDeactivated] = useState(false)
    const [loading, setLoading] = useState(true)
    const [pendingKey, setPendingKey] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const data = await fetchReports(onlyDeactivated)
            setReports(data)
        } catch (err) {
            toast.error(String(err instanceof Error ? err.message : err))
            setReports([])
        } finally {
            setLoading(false)
        }
    }, [onlyDeactivated])

    useEffect(() => {
        void load()
    }, [load])

    const handleReactivate = async (row: ReportSummary) => {
        const key = rowKey(row)
        setPendingKey(key)
        try {
            const target = row.screenshotId
                ? { screenshotId: row.screenshotId }
                : { geoScreenshotCandidateId: row.geoScreenshotCandidateId! }
            const result = await reactivate(target)
            toast.success(
                result.reactivated
                    ? t('admin.reports.reactivated')
                    : t('admin.reports.reactivatedNoop'),
            )
            await load()
        } catch (err) {
            toast.error(String(err instanceof Error ? err.message : err))
        } finally {
            setPendingKey(null)
        }
    }

    return (
        <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 space-y-0 p-4 sm:p-6">
                <CardTitle className="flex items-center gap-2 text-base min-w-0">
                    <Flag className="h-4 w-4 text-neon-pink shrink-0" />
                    <span className="truncate">{t('admin.reports.title')}</span>
                </CardTitle>
                <div className="flex items-center justify-between sm:justify-end gap-3 sm:shrink-0">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                        <Checkbox
                            checked={onlyDeactivated}
                            onCheckedChange={(v) => setOnlyDeactivated(v === true)}
                        />
                        {t('admin.reports.onlyDeactivated')}
                    </label>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void load()}
                        disabled={loading}
                        title={t('common.retry')}
                    >
                        <RefreshCw
                            className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
                        />
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
                {loading && reports === null ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-neon-pink" />
                    </div>
                ) : reports && reports.length > 0 ? (
                    <ul className="divide-y divide-border">
                        {reports.map((row) => (
                            <li
                                key={rowKey(row)}
                                className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 py-3"
                            >
                                <div className="flex items-start gap-3 min-w-0 flex-1">
                                    <ReportThumbnail
                                        src={row.thumbnailUrl ?? row.imageUrl}
                                        alt={row.gameName ?? ''}
                                    />
                                    <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Badge
                                                variant={
                                                    row.screenshotId ? 'default' : 'secondary'
                                                }
                                            >
                                                {row.screenshotId
                                                    ? t('admin.reports.targetMain')
                                                    : t('admin.reports.targetGeo')}
                                            </Badge>
                                            <span className="text-sm font-mono">
                                                #{row.screenshotId ?? row.geoScreenshotCandidateId}
                                            </span>
                                            {row.gameName && (
                                                <span className="text-sm font-medium truncate">
                                                    {row.gameName}
                                                </span>
                                            )}
                                            {!row.isActive && (
                                                <Badge variant="destructive">
                                                    {t('admin.reports.deactivated')}
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                            {(Object.entries(row.reasons) as [
                                                ScreenshotReportReason,
                                                number,
                                            ][])
                                                .sort((a, b) => b[1] - a[1])
                                                .map(([reason, n]) => (
                                                    <Badge
                                                        key={reason}
                                                        variant="outline"
                                                        className="text-[10px] font-normal"
                                                    >
                                                        {t(`report.reasons.${reason}`)} · {n}
                                                    </Badge>
                                                ))}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {t('admin.reports.count', {
                                                count: row.reportCount,
                                            })}
                                            {' · '}
                                            {t('admin.reports.lastReported', {
                                                when: formatWhen(
                                                    row.lastReportedAt,
                                                    i18n.language,
                                                ),
                                            })}
                                        </div>
                                    </div>
                                </div>
                                {!row.isActive && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => void handleReactivate(row)}
                                        disabled={pendingKey === rowKey(row)}
                                        className="w-full sm:w-auto sm:shrink-0"
                                    >
                                        {pendingKey === rowKey(row) ? (
                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        ) : (
                                            <Undo2 className="h-4 w-4 mr-2" />
                                        )}
                                        {t('admin.reports.reactivate')}
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                        {t('admin.reports.empty')}
                    </p>
                )}
            </CardContent>
        </Card>
    )
}

function rowKey(row: ReportSummary): string {
    return row.screenshotId
        ? `s:${row.screenshotId}`
        : `g:${row.geoScreenshotCandidateId}`
}

function ReportThumbnail({ src, alt }: { src?: string; alt: string }) {
    const [errored, setErrored] = useState(false)
    if (!src || errored) {
        return (
            <div className="h-16 w-24 shrink-0 rounded-md bg-muted/40 flex items-center justify-center">
                <ImageOff className="h-4 w-4 text-muted-foreground" />
            </div>
        )
    }
    return (
        <img
            src={src}
            alt={alt}
            loading="lazy"
            onError={() => setErrored(true)}
            className="h-16 w-24 shrink-0 rounded-md object-cover border border-border"
        />
    )
}

function formatWhen(iso: string, locale: string): string {
    try {
        return new Date(iso).toLocaleString(locale)
    } catch {
        return iso
    }
}
