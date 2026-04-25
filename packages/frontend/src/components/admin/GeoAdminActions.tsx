import { useCallback, useEffect, useState } from 'react'
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
import { Progress } from '@/components/ui/progress'
import {
    Loader2,
    RefreshCw,
    AlertTriangle,
    Plus,
    Trash2,
    RotateCw,
    CalendarClock,
    CheckCircle2,
    XCircle,
    Star,
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

interface CuratedGame {
    id: number
    name: string
    slug: string
    releaseYear: number | null
    developer: string | null
    metacritic: number | null
    metadataStatus: 'pending' | 'resolved' | 'unresolved'
    steamAppId: number | null
    wikiSubdomain: string | null
    hasMap: boolean
    candidateCount: number
}

interface SuggestedGame {
    id: number
    name: string
    slug: string
    releaseYear: number | null
    developer: string | null
    metacritic: number | null
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

function formatRelative(iso: string | null, neverLabel: string, lang: string): string {
    if (!iso) return neverLabel
    const d = new Date(iso)
    const diffMs = Date.now() - d.getTime()
    const mins = Math.round(diffMs / 60_000)
    if (mins < 1) return lang.startsWith('fr') ? "à l'instant" : 'just now'
    if (mins < 60) return lang.startsWith('fr') ? `il y a ${mins} min` : `${mins} min ago`
    const hours = Math.round(mins / 60)
    if (hours < 48)
        return lang.startsWith('fr') ? `il y a ${hours} h` : `${hours} h ago`
    return d.toLocaleDateString(lang, { day: '2-digit', month: 'short' })
}

function formatScheduledDate(iso: string | null, noneLabel: string, lang: string): string {
    if (!iso) return noneLabel
    const d = new Date(iso)
    return d.toLocaleString(lang, {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    })
}

/**
 * Read-only "Geo dataset health" panel + curated-set management. The full
 * ingestion pipeline runs automatically (recurring `resolve-metadata` and
 * `ingest-tick` jobs) for games flagged as curated. Admins manage the
 * curated set by curating from a suggestions list and removing existing
 * entries — no game-id typing required.
 */
export function GeoAdminActions() {
    const { t, i18n } = useTranslation()
    const lang = i18n.language

    const [health, setHealth] = useState<HealthData | null>(null)
    const [curated, setCurated] = useState<CuratedGame[] | null>(null)
    const [suggestions, setSuggestions] = useState<SuggestedGame[] | null>(null)

    const [loadingHealth, setLoadingHealth] = useState(true)
    const [loadingCurated, setLoadingCurated] = useState(true)
    const [loadingSuggestions, setLoadingSuggestions] = useState(true)

    const [error, setError] = useState<string | null>(null)
    const [message, setMessage] = useState<string | null>(null)
    const [busyId, setBusyId] = useState<number | null>(null)
    const [busyAction, setBusyAction] = useState<
        'curate' | 'remove' | 'reimport' | 'schedule' | null
    >(null)

    const reloadHealth = useCallback(async () => {
        setLoadingHealth(true)
        try {
            setHealth(await fetchJson<HealthData>('/api/admin/geo/health'))
        } catch (e) {
            setError(String(e))
        } finally {
            setLoadingHealth(false)
        }
    }, [])

    const reloadCurated = useCallback(async () => {
        setLoadingCurated(true)
        try {
            const data = await fetchJson<{ games: CuratedGame[] }>(
                '/api/admin/geo/games?curated=true&limit=50',
            )
            setCurated(data.games)
        } catch (e) {
            setError(String(e))
        } finally {
            setLoadingCurated(false)
        }
    }, [])

    const reloadSuggestions = useCallback(async () => {
        setLoadingSuggestions(true)
        try {
            const data = await fetchJson<{ games: SuggestedGame[] }>(
                '/api/admin/geo/games?curated=false&limit=20',
            )
            setSuggestions(data.games)
        } catch (e) {
            setError(String(e))
        } finally {
            setLoadingSuggestions(false)
        }
    }, [])

    const reloadAll = useCallback(async () => {
        await Promise.all([reloadHealth(), reloadCurated(), reloadSuggestions()])
    }, [reloadHealth, reloadCurated, reloadSuggestions])

    useEffect(() => {
        void reloadAll()
        const interval = window.setInterval(() => void reloadHealth(), 30_000)
        return () => window.clearInterval(interval)
    }, [reloadAll, reloadHealth])

    const setCuration = async (game: { id: number; name: string }, on: boolean) => {
        setBusyId(game.id)
        setBusyAction(on ? 'curate' : 'remove')
        setMessage(null)
        setError(null)
        try {
            await fetchJson('/api/admin/geo/curated', {
                method: 'POST',
                body: JSON.stringify({ gameId: game.id, curated: on }),
            })
            setMessage(
                t(
                    on
                        ? 'admin.geo.health.actions.curatedSet'
                        : 'admin.geo.health.actions.curatedRemoved',
                    { name: game.name },
                ),
            )
            await Promise.all([reloadCurated(), reloadSuggestions(), reloadHealth()])
        } catch (e) {
            setError(String(e))
        } finally {
            setBusyId(null)
            setBusyAction(null)
        }
    }

    const reimport = async (game: CuratedGame) => {
        setBusyId(game.id)
        setBusyAction('reimport')
        setMessage(null)
        setError(null)
        try {
            await fetchJson('/api/admin/geo/reimport', {
                method: 'POST',
                body: JSON.stringify({ gameId: game.id }),
            })
            setMessage(
                t('admin.geo.health.actions.reimportQueued', { name: game.name }),
            )
            await Promise.all([reloadCurated(), reloadHealth()])
        } catch (e) {
            setError(String(e))
        } finally {
            setBusyId(null)
            setBusyAction(null)
        }
    }

    const scheduleNow = async () => {
        setBusyAction('schedule')
        setMessage(null)
        setError(null)
        try {
            const data = await fetchJson<{ jobId: string }>('/api/admin/geo/schedule', {
                method: 'POST',
                body: '{}',
            })
            setMessage(t('admin.geo.health.actions.scheduled', { id: data.jobId }))
            await reloadHealth()
        } catch (e) {
            setError(String(e))
        } finally {
            setBusyAction(null)
        }
    }

    const coveragePct = health?.coverage.curated
        ? Math.round((100 * health.coverage.withMap) / health.coverage.curated)
        : 0
    const failingNow =
        (health?.queue.failed ?? 0) > 0 || (health?.failures.length ?? 0) > 0
    const status: 'healthy' | 'warning' | 'critical' = error
        ? 'critical'
        : failingNow
          ? 'warning'
          : 'healthy'

    const StatusIcon =
        status === 'healthy' ? CheckCircle2 : status === 'warning' ? AlertTriangle : XCircle

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                        <CardTitle className="text-sm">{t('admin.geo.health.title')}</CardTitle>
                        <CardDescription className="text-xs">
                            {t('admin.geo.health.subtitle')}
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <Badge
                            variant={
                                status === 'healthy'
                                    ? 'success'
                                    : status === 'warning'
                                      ? 'warning'
                                      : 'destructive'
                            }
                            className="gap-1"
                        >
                            <StatusIcon className="h-3 w-3" aria-hidden />
                            {t(`admin.geo.health.status.${status}`)}
                        </Badge>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void reloadAll()}
                            disabled={loadingHealth || loadingCurated || loadingSuggestions}
                            aria-label={t('admin.geo.health.refresh')}
                            className="h-7 w-7 p-0"
                        >
                            <RefreshCw
                                className={`h-3.5 w-3.5 ${loadingHealth ? 'animate-spin' : ''}`}
                            />
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-5">
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

                {health && (
                    <>
                        <section className="rounded-lg border border-border/50 bg-muted/20 p-3">
                            <div className="flex items-baseline justify-between gap-2">
                                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                    {t('admin.geo.health.coverage.label')}
                                </span>
                                <span className="text-2xl font-semibold tabular-nums">
                                    {coveragePct}
                                    <span className="text-base text-muted-foreground">%</span>
                                </span>
                            </div>
                            <Progress value={coveragePct} className="mt-2 h-2" />
                            <p className="pt-1.5 text-[11px] text-muted-foreground">
                                {t('admin.geo.health.coverage.value', {
                                    withMap: health.coverage.withMap,
                                    curated: health.coverage.curated,
                                    total: health.coverage.total,
                                })}
                            </p>
                        </section>

                        <section className="grid grid-cols-2 gap-2 text-xs">
                            <Metric
                                label={t('admin.geo.health.metrics.resolved')}
                                value={`${health.coverage.resolved} / ${health.coverage.curated}`}
                            />
                            <Metric
                                label={t('admin.geo.health.metrics.nextChallenge')}
                                value={formatScheduledDate(
                                    health.nextChallenge?.date ?? null,
                                    t('admin.geo.health.metrics.noScheduled'),
                                    lang,
                                )}
                            />
                            <Metric
                                label={t('admin.geo.health.metrics.lastFandom')}
                                value={formatRelative(
                                    health.lastFandomImportAt,
                                    t('admin.geo.health.metrics.never'),
                                    lang,
                                )}
                            />
                            <Metric
                                label={t('admin.geo.health.metrics.lastSteam')}
                                value={formatRelative(
                                    health.lastSteamImportAt,
                                    t('admin.geo.health.metrics.never'),
                                    lang,
                                )}
                            />
                        </section>

                        <section className="space-y-2">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                {t('admin.geo.health.queue.title')}
                            </p>
                            <div className="grid grid-cols-4 gap-1.5">
                                <QueueTile
                                    value={health.queue.active}
                                    label={t('admin.geo.health.queue.active')}
                                />
                                <QueueTile
                                    value={health.queue.waiting}
                                    label={t('admin.geo.health.queue.waiting')}
                                />
                                <QueueTile
                                    value={health.queue.delayed}
                                    label={t('admin.geo.health.queue.delayed')}
                                />
                                <QueueTile
                                    value={health.queue.failed}
                                    label={t('admin.geo.health.queue.failed')}
                                    tone={health.queue.failed > 0 ? 'danger' : 'default'}
                                />
                            </div>
                        </section>

                        {health.failures.length > 0 && (
                            <section className="space-y-1.5 rounded border border-warning/30 bg-warning/5 p-2">
                                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                                    <AlertTriangle className="h-3 w-3" aria-hidden />
                                    {t('admin.geo.health.failures.title')}
                                </h4>
                                <ul className="space-y-1 text-[11px] text-muted-foreground">
                                    {health.failures.slice(0, 8).map((f) => (
                                        <li key={`${f.gameId}-${f.source}`} className="leading-snug">
                                            {t('admin.geo.health.failures.row', {
                                                gameId: f.gameId,
                                                source: f.source,
                                                reason: f.reason,
                                                attempt: f.attemptCount,
                                            })}
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}
                    </>
                )}

                <section className="space-y-2">
                    <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold">
                            {t('admin.geo.health.curatedList.title')}
                            {curated && curated.length > 0 && (
                                <span className="ml-1.5 text-muted-foreground font-normal">
                                    ({curated.length})
                                </span>
                            )}
                        </h4>
                    </div>
                    {loadingCurated && curated === null ? (
                        <p className="text-[11px] text-muted-foreground">
                            {t('admin.geo.health.curatedList.loading')}
                        </p>
                    ) : curated && curated.length > 0 ? (
                        <ul className="space-y-1.5">
                            {curated.map((g) => (
                                <CuratedRow
                                    key={g.id}
                                    game={g}
                                    busy={busyId === g.id ? busyAction : null}
                                    onRemove={() => void setCuration(g, false)}
                                    onReimport={() => void reimport(g)}
                                    t={t}
                                />
                            ))}
                        </ul>
                    ) : (
                        <p className="text-[11px] text-muted-foreground">
                            {t('admin.geo.health.curatedList.empty')}
                        </p>
                    )}
                </section>

                <section className="space-y-2">
                    <div>
                        <h4 className="text-xs font-semibold">
                            {t('admin.geo.health.suggestions.title')}
                        </h4>
                        <p className="text-[11px] text-muted-foreground">
                            {t('admin.geo.health.suggestions.subtitle')}
                        </p>
                    </div>
                    {loadingSuggestions && suggestions === null ? (
                        <p className="text-[11px] text-muted-foreground">
                            {t('admin.geo.health.suggestions.loading')}
                        </p>
                    ) : suggestions && suggestions.length > 0 ? (
                        <ul className="space-y-1.5">
                            {suggestions.map((g) => (
                                <SuggestionRow
                                    key={g.id}
                                    game={g}
                                    busy={busyId === g.id && busyAction === 'curate'}
                                    onAdd={() => void setCuration(g, true)}
                                    t={t}
                                />
                            ))}
                        </ul>
                    ) : (
                        <p className="text-[11px] text-muted-foreground">
                            {t('admin.geo.health.suggestions.empty')}
                        </p>
                    )}
                </section>

                <section className="border-t border-border/50 pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold">
                                {t('admin.geo.health.advanced.title')}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                                {t('admin.geo.health.advanced.subtitle')}
                            </p>
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={busyAction !== null}
                            onClick={() => void scheduleNow()}
                        >
                            {busyAction === 'schedule' ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                            ) : (
                                <CalendarClock className="h-3.5 w-3.5 mr-1.5" />
                            )}
                            {t('admin.geo.health.advanced.scheduleNow')}
                        </Button>
                    </div>
                </section>
            </CardContent>
        </Card>
    )
}

function Metric({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-lg border border-border/50 bg-muted/20 p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {label}
            </p>
            <p className="mt-0.5 text-sm font-medium tabular-nums leading-tight">{value}</p>
        </div>
    )
}

function QueueTile({
    value,
    label,
    tone = 'default',
}: {
    value: number
    label: string
    tone?: 'default' | 'danger'
}) {
    const ring =
        tone === 'danger' && value > 0
            ? 'border-destructive/40 bg-destructive/10'
            : 'border-border/50 bg-muted/20'
    const valueClass =
        tone === 'danger' && value > 0
            ? 'text-destructive'
            : value > 0
              ? 'text-foreground'
              : 'text-muted-foreground'
    return (
        <div className={`rounded-lg border ${ring} p-2 text-center`}>
            <p className={`text-base font-semibold tabular-nums leading-none ${valueClass}`}>
                {value}
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                {label}
            </p>
        </div>
    )
}

interface CuratedRowProps {
    game: CuratedGame
    busy: 'curate' | 'remove' | 'reimport' | 'schedule' | null
    onRemove: () => void
    onReimport: () => void
    t: ReturnType<typeof useTranslation>['t']
}

function CuratedRow({ game, busy, onRemove, onReimport, t }: CuratedRowProps) {
    const statusKey = `admin.geo.health.curatedList.status.${game.metadataStatus}` as const
    return (
        <li className="flex items-start justify-between gap-2 rounded-md border border-border/50 bg-muted/10 p-2.5 text-xs">
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                    <span className="font-medium break-words">{game.name}</span>
                    {game.releaseYear && (
                        <span className="text-[10px] text-muted-foreground">
                            ({game.releaseYear})
                        </span>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-1 pt-1">
                    <Badge
                        variant={
                            game.metadataStatus === 'resolved'
                                ? 'success'
                                : game.metadataStatus === 'unresolved'
                                  ? 'destructive'
                                  : 'secondary'
                        }
                        className="text-[10px] px-1.5 py-0"
                    >
                        {t(statusKey)}
                    </Badge>
                    <Badge
                        variant={game.hasMap ? 'success' : 'outline'}
                        className="text-[10px] px-1.5 py-0"
                    >
                        {game.hasMap
                            ? t('admin.geo.health.curatedList.hasMap')
                            : t('admin.geo.health.curatedList.noMap')}
                    </Badge>
                    {game.candidateCount > 0 && (
                        <Badge variant="info" className="text-[10px] px-1.5 py-0">
                            {t('admin.geo.health.curatedList.candidates', {
                                count: game.candidateCount,
                            })}
                        </Badge>
                    )}
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
                <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy !== null}
                    onClick={onReimport}
                    aria-label={t('admin.geo.health.curatedList.reimport')}
                    title={t('admin.geo.health.curatedList.reimport')}
                    className="h-7 w-7 p-0"
                >
                    {busy === 'reimport' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <RotateCw className="h-3.5 w-3.5" />
                    )}
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy !== null}
                    onClick={onRemove}
                    aria-label={t('admin.geo.health.curatedList.remove')}
                    title={t('admin.geo.health.curatedList.remove')}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                >
                    {busy === 'remove' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                    )}
                </Button>
            </div>
        </li>
    )
}

interface SuggestionRowProps {
    game: SuggestedGame
    busy: boolean
    onAdd: () => void
    t: ReturnType<typeof useTranslation>['t']
}

function SuggestionRow({ game, busy, onAdd, t }: SuggestionRowProps) {
    const score = game.metacritic
    const tone =
        score === null ? 'muted' : score >= 95 ? 'top' : score >= 75 ? 'high' : 'neutral'
    return (
        <li className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-muted/10 p-2.5 text-xs hover:bg-muted/20 transition-colors">
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                    <span className="font-medium break-words">{game.name}</span>
                    {game.releaseYear && (
                        <span className="text-[10px] text-muted-foreground">
                            ({game.releaseYear})
                        </span>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[10px] text-muted-foreground">
                    {game.developer && <span className="truncate">{game.developer}</span>}
                    {score !== null && (
                        <span
                            className={[
                                'inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0 font-semibold tabular-nums',
                                tone === 'top' || tone === 'high'
                                    ? 'border-score-high/40 bg-score-high/15 text-score-high'
                                    : 'border-border/60 text-muted-foreground',
                            ].join(' ')}
                        >
                            {tone === 'top' && (
                                <Star className="h-2.5 w-2.5 fill-current" aria-hidden />
                            )}
                            {score}
                        </span>
                    )}
                </div>
            </div>
            <Button size="sm" variant="outline" disabled={busy} onClick={onAdd} className="shrink-0">
                {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                )}
                {t('admin.geo.health.suggestions.add')}
            </Button>
        </li>
    )
}
