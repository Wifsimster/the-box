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
 * Read-only "Geo dataset health" panel + curated-set management. The full
 * ingestion pipeline runs automatically (recurring `resolve-metadata` and
 * `ingest-tick` jobs) for games flagged as curated. Admins manage the
 * curated set by curating from a suggestions list and removing existing
 * entries — no game-id typing required.
 */
export function GeoAdminActions() {
    const { t } = useTranslation()

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
                            onClick={() => void reloadAll()}
                            disabled={loadingHealth || loadingCurated || loadingSuggestions}
                            aria-label={t('admin.geo.health.refresh')}
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
                            <Badge variant={health.queue.failed ? 'destructive' : 'outline'}>
                                {health.queue.failed} {t('admin.geo.health.queue.failed')}
                            </Badge>
                        </section>

                        {health.failures.length > 0 && (
                            <section className="space-y-1.5">
                                <h4 className="text-xs font-semibold flex items-center gap-1.5">
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
                    <div className="flex items-center justify-between gap-2">
                        <div>
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
        <div className="rounded border border-border/50 bg-muted/20 p-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {label}
            </p>
            <p className="font-mono text-xs">{value}</p>
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
        <li className="flex items-center justify-between gap-2 rounded border border-border/50 bg-muted/10 p-2 text-xs">
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <span className="font-medium truncate">{game.name}</span>
                    {game.releaseYear && (
                        <span className="text-[10px] text-muted-foreground">
                            ({game.releaseYear})
                        </span>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-1 pt-0.5">
                    <Badge
                        variant={
                            game.metadataStatus === 'resolved'
                                ? 'default'
                                : game.metadataStatus === 'unresolved'
                                  ? 'destructive'
                                  : 'secondary'
                        }
                        className="text-[10px]"
                    >
                        {t(statusKey)}
                    </Badge>
                    <Badge variant={game.hasMap ? 'default' : 'outline'} className="text-[10px]">
                        {game.hasMap
                            ? t('admin.geo.health.curatedList.hasMap')
                            : t('admin.geo.health.curatedList.noMap')}
                    </Badge>
                    {game.candidateCount > 0 && (
                        <Badge variant="outline" className="text-[10px]">
                            {t('admin.geo.health.curatedList.candidates', {
                                count: game.candidateCount,
                            })}
                        </Badge>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-1">
                <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy !== null}
                    onClick={onReimport}
                    aria-label={t('admin.geo.health.curatedList.reimport')}
                    title={t('admin.geo.health.curatedList.reimport')}
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
    return (
        <li className="flex items-center justify-between gap-2 rounded border border-border/50 bg-muted/10 p-2 text-xs">
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <span className="font-medium truncate">{game.name}</span>
                    {game.releaseYear && (
                        <span className="text-[10px] text-muted-foreground">
                            ({game.releaseYear})
                        </span>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                    {game.developer && <span>{game.developer}</span>}
                    {game.metacritic !== null && (
                        <Badge variant="outline" className="text-[10px]">
                            {t('admin.geo.health.suggestions.metacritic', {
                                score: game.metacritic,
                            })}
                        </Badge>
                    )}
                </div>
            </div>
            <Button size="sm" variant="outline" disabled={busy} onClick={onAdd}>
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
