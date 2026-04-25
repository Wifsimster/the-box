import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from '@/lib/toast'
import { Loader2, RefreshCw, Undo2, Flag } from 'lucide-react'

interface ReportSummary {
    screenshotId?: number
    geoScreenshotCandidateId?: number
    reportCount: number
    lastReportedAt: string
    isActive: boolean
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
            <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="flex items-center gap-2 text-base">
                    <Flag className="h-4 w-4 text-neon-pink" />
                    {t('admin.reports.title')}
                </CardTitle>
                <div className="flex items-center gap-3">
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
            <CardContent>
                {loading && reports === null ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-neon-pink" />
                    </div>
                ) : reports && reports.length > 0 ? (
                    <ul className="divide-y divide-border">
                        {reports.map((row) => (
                            <li
                                key={rowKey(row)}
                                className="flex items-center justify-between gap-3 py-3"
                            >
                                <div className="flex flex-col gap-1 min-w-0">
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
                                        {!row.isActive && (
                                            <Badge variant="destructive">
                                                {t('admin.reports.deactivated')}
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {t('admin.reports.count', {
                                            count: row.reportCount,
                                        })}
                                        {' · '}
                                        {t('admin.reports.lastReported', {
                                            when: formatWhen(row.lastReportedAt, i18n.language),
                                        })}
                                    </div>
                                </div>
                                {!row.isActive && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => void handleReactivate(row)}
                                        disabled={pendingKey === rowKey(row)}
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

function formatWhen(iso: string, locale: string): string {
    try {
        return new Date(iso).toLocaleString(locale)
    } catch {
        return iso
    }
}
