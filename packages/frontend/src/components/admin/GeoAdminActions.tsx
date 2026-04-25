import { useCallback, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
    Loader2,
    RefreshCw,
    ChevronsUpDown,
    AlertTriangle,
} from 'lucide-react'

interface HealthData {
    coverage: { curated: number; resolved: number; withMap: number; total: number }
    lastFandomImportAt: string | null
    lastSteamImportAt: string | null
    nextChallenge: { id: number; date: string } | null
    queue: { active: number; waiting: number; delayed: number; failed: number }
    failures: Array<{
        gameId: number
        source: string
        reason: string
        attemptCount: number
        lastAttemptAt: string
        retryAfter: string
    }>
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

function relative(iso: string | null, neverLabel: string): string {
    if (!iso) return neverLabel
    const d = new Date(iso)
    const diffMs = Date.now() - d.getTime()
    const mins = Math.round(diffMs / 60_000)
    if (mins < 60) return `il y a ${mins} min`
    const hours = Math.round(mins / 60)
    if (hours < 48) return `il y a ${hours} h`
    return d.toISOString().slice(0, 10)
}

/**
 * Read-only "Geo dataset health" panel. The full ingestion pipeline runs
 * automatically (recurring `resolve-metadata` and `ingest-tick` jobs) for
 * games flagged as curated. The collapsible "Advanced" section exposes the
 * three rare overrides admins might still need: toggling curation, forcing
 * a re-ingestion, and triggering the daily-challenge scheduler immediately.
 */
export function GeoAdminActions() {
    const { t } = useTranslation()
    const formId = useId()
    const [health, setHealth] = useState<HealthData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState<'reimport' | 'curated' | 'schedule' | null>(null)
    const [message, setMessage] = useState<string | null>(null)
    const [advancedGameId, setAdvancedGameId] = useState('')

    const reload = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const data = await fetchJson<HealthData>('/api/admin/geo/health')
            setHealth(data)
        } catch (e) {
            setError(String(e))
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void reload()
        const interval = window.setInterval(() => void reload(), 30_000)
        return () => window.clearInterval(interval)
    }, [reload])

    const runAdvanced = async (
        kind: 'reimport' | 'curated' | 'schedule',
        fn: () => Promise<string>,
    ) => {
        setBusy(kind)
        setMessage(null)
        setError(null)
        try {
            const msg = await fn()
            setMessage(msg)
            await reload()
        } catch (e) {
            setError(String(e))
        } finally {
            setBusy(null)
        }
    }

    const coveragePct = health?.coverage.curated
        ? Math.round((100 * health.coverage.withMap) / health.coverage.curated)
        : 0
    const failingNow = (health?.queue.failed ?? 0) > 0 || (health?.failures.length ?? 0) > 0
    const status: 'healthy' | 'warning' | 'critical' = error
        ? 'critical'
        : failingNow
          ? 'warning'
          : 'healthy'

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <CardTitle className="text-sm">{t('admin.geo.health.title')}</CardTitle>
                        <CardDescription className="text-xs">
                            {t('admin.geo.health.subtitle')}
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge
                            variant={
                                status === 'healthy'
                                    ? 'default'
                                    : status === 'warning'
                                      ? 'secondary'
                                      : 'destructive'
                            }
                        >
                            {t(`admin.geo.health.status.${status}`)}
                        </Badge>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void reload()}
                            disabled={loading}
                            aria-label={t('admin.geo.health.refresh')}
                        >
                            <RefreshCw
                                className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
                            />
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {message && (
                    <div className="rounded border border-success/40 bg-success/10 p-2 text-xs text-success">
                        {message}
                    </div>
                )}
                {error && (
                    <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                        {error}
                    </div>
                )}
                {loading && !health && (
                    <p className="text-xs text-muted-foreground">
                        {t('admin.geo.health.loading')}
                    </p>
                )}

                {health && (
                    <>
                        <section className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-medium">
                                    {t('admin.geo.health.coverage.label')}
                                </span>
                                <span className="text-muted-foreground">{coveragePct}%</span>
                            </div>
                            <Progress value={coveragePct} className="h-2" />
                            <p className="text-[11px] text-muted-foreground">
                                {t('admin.geo.health.coverage.value', {
                                    withMap: health.coverage.withMap,
                                    curated: health.coverage.curated,
                                    total: health.coverage.total,
                                })}
                            </p>
                        </section>

                        <section className="grid grid-cols-2 gap-3 text-xs">
                            <Metric
                                label={t('admin.geo.health.metrics.resolved')}
                                value={`${health.coverage.resolved} / ${health.coverage.curated}`}
                            />
                            <Metric
                                label={t('admin.geo.health.metrics.nextChallenge')}
                                value={
                                    health.nextChallenge?.date ??
                                    t('admin.geo.health.metrics.noScheduled')
                                }
                            />
                            <Metric
                                label={t('admin.geo.health.metrics.lastFandom')}
                                value={relative(
                                    health.lastFandomImportAt,
                                    t('admin.geo.health.metrics.never'),
                                )}
                            />
                            <Metric
                                label={t('admin.geo.health.metrics.lastSteam')}
                                value={relative(
                                    health.lastSteamImportAt,
                                    t('admin.geo.health.metrics.never'),
                                )}
                            />
                        </section>

                        <section className="flex flex-wrap gap-2">
                            <span className="text-[11px] text-muted-foreground">
                                {t('admin.geo.health.queue.title')} —
                            </span>
                            <Badge variant="outline">
                                {health.queue.active} {t('admin.geo.health.queue.active')}
                            </Badge>
                            <Badge variant="outline">
                                {health.queue.waiting} {t('admin.geo.health.queue.waiting')}
                            </Badge>
                            <Badge variant="outline">
                                {health.queue.delayed} {t('admin.geo.health.queue.delayed')}
                            </Badge>
                            <Badge
                                variant={health.queue.failed ? 'destructive' : 'outline'}
                            >
                                {health.queue.failed} {t('admin.geo.health.queue.failed')}
                            </Badge>
                        </section>

                        <section className="space-y-1.5">
                            <h4 className="text-xs font-semibold flex items-center gap-1.5">
                                <AlertTriangle className="h-3 w-3" aria-hidden />
                                {t('admin.geo.health.failures.title')}
                            </h4>
                            {health.failures.length === 0 ? (
                                <p className="text-[11px] text-muted-foreground">
                                    {t('admin.geo.health.failures.empty')}
                                </p>
                            ) : (
                                <ul className="space-y-1 text-[11px] text-muted-foreground">
                                    {health.failures.slice(0, 8).map((f) => (
                                        <li
                                            key={`${f.gameId}-${f.source}`}
                                            className="leading-snug"
                                        >
                                            {t('admin.geo.health.failures.row', {
                                                gameId: f.gameId,
                                                source: f.source,
                                                reason: f.reason,
                                                attempt: f.attemptCount,
                                            })}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </>
                )}

                <Collapsible>
                    <CollapsibleTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-between text-xs"
                        >
                            {t('admin.geo.health.advanced.title')}
                            <ChevronsUpDown className="h-3 w-3" aria-hidden />
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-3 pt-2">
                        <p className="text-[11px] text-muted-foreground">
                            {t('admin.geo.health.advanced.subtitle')}
                        </p>
                        <div className="space-y-1">
                            <Label htmlFor={`${formId}-advanced-gameid`} className="text-xs">
                                {t('admin.geo.health.advanced.gameIdLabel')}
                            </Label>
                            <Input
                                id={`${formId}-advanced-gameid`}
                                inputMode="numeric"
                                value={advancedGameId}
                                onChange={(e) => setAdvancedGameId(e.target.value)}
                                placeholder="123"
                            />
                            <p className="text-[11px] text-muted-foreground">
                                {t('admin.geo.health.advanced.gameIdHint')}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={busy !== null || !advancedGameId}
                                onClick={() =>
                                    runAdvanced('curated', async () => {
                                        const id = Number(advancedGameId)
                                        const data = await fetchJson<{
                                            gameId: number
                                            curated: boolean
                                        }>('/api/admin/geo/curated', {
                                            method: 'POST',
                                            body: JSON.stringify({ gameId: id, curated: true }),
                                        })
                                        return t('admin.geo.health.actions.curatedSet', {
                                            id: data.gameId,
                                            curated: data.curated,
                                        })
                                    })
                                }
                            >
                                {busy === 'curated' && (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                )}
                                {t('admin.geo.health.advanced.curatedOn')}
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={busy !== null || !advancedGameId}
                                onClick={() =>
                                    runAdvanced('reimport', async () => {
                                        const id = Number(advancedGameId)
                                        const data = await fetchJson<{ jobId: string }>(
                                            '/api/admin/geo/reimport',
                                            {
                                                method: 'POST',
                                                body: JSON.stringify({ gameId: id }),
                                            },
                                        )
                                        return t('admin.geo.health.actions.reimportQueued', {
                                            id,
                                            jobId: data.jobId,
                                        })
                                    })
                                }
                            >
                                {busy === 'reimport' && (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                )}
                                {t('admin.geo.health.advanced.reimport')}
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={busy !== null}
                                onClick={() =>
                                    runAdvanced('schedule', async () => {
                                        const data = await fetchJson<{ jobId: string }>(
                                            '/api/admin/geo/schedule',
                                            { method: 'POST', body: '{}' },
                                        )
                                        return t('admin.geo.health.actions.scheduled', {
                                            id: data.jobId,
                                        })
                                    })
                                }
                            >
                                {busy === 'schedule' && (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                )}
                                {t('admin.geo.health.advanced.scheduleNow')}
                            </Button>
                        </div>
                    </CollapsibleContent>
                </Collapsible>
            </CardContent>
        </Card>
    )
}

function Metric({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded border border-border/50 bg-muted/20 p-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {label}
            </p>
            <p className="font-mono text-xs">{value}</p>
        </div>
    )
}
