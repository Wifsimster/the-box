import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { Loader2, RefreshCw, CheckSquare, Square, Star, AlertTriangle } from 'lucide-react'

// Unified curated-set + suggestions surface. Replaces the two stacked
// sections in GeoAdminActions (which the new tabbed layout has otherwise
// fully absorbed). Filter pills toggle between All / Curated / Candidates;
// row checkboxes drive a bulk "Curate" / "Remove" action bar so onboarding
// 50 pilot games doesn't mean 50 individual clicks.

type FilterMode = 'all' | 'curated' | 'candidates'

interface GameRow {
    id: number
    name: string
    slug: string
    releaseYear: number | null
    developer: string | null
    metacritic: number | null
    genres: string[] | null
    // true = genres signal a navigable world map (Adventure/RPG/MMO);
    // false = genres are exclusively no-map (Puzzle, Racing…);
    // null  = ambiguous or no genre data.
    mapEligibility: boolean | null
    metadataStatus?: 'pending' | 'resolved' | 'unresolved'
    hasMap?: boolean
    candidateCount?: number
    curated: boolean
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

export function GeoGamesTab() {
    const { t } = useTranslation()
    const [filter, setFilter] = useState<FilterMode>('all')
    const [curated, setCurated] = useState<GameRow[]>([])
    const [candidates, setCandidates] = useState<GameRow[]>([])
    const [selected, setSelected] = useState<Set<number>>(new Set())
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [message, setMessage] = useState<string | null>(null)

    const reload = useCallback(async () => {
        setLoading(true)
        try {
            const [c, s] = await Promise.all([
                fetchJson<{ games: Omit<GameRow, 'curated'>[] }>(
                    '/api/admin/geo/games?curated=true&limit=200',
                ),
                fetchJson<{ games: Omit<GameRow, 'curated'>[] }>(
                    '/api/admin/geo/games?curated=false&limit=200',
                ),
            ])
            setCurated(c.games.map((g) => ({ ...g, curated: true })))
            setCandidates(s.games.map((g) => ({ ...g, curated: false })))
            setError(null)
        } catch (e) {
            setError(String(e))
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void reload()
    }, [reload])

    const rows: GameRow[] = useMemo(() => {
        if (filter === 'curated') return curated
        if (filter === 'candidates') return candidates
        return [...curated, ...candidates]
    }, [filter, curated, candidates])

    const toggleSelect = (id: number) => {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const selectAll = () => {
        if (selected.size === rows.length) setSelected(new Set())
        else setSelected(new Set(rows.map((r) => r.id)))
    }

    // Bulk action: derive each row's *target* curation state from the action
    // verb so a mixed selection (some curated, some not) does the right thing.
    const applyBulk = async (target: boolean) => {
        if (selected.size === 0) return
        setBusy(true)
        setMessage(null)
        setError(null)
        try {
            const items = [...selected].map((gameId) => ({ gameId, curated: target }))
            const data = await fetchJson<{ updated: number; notFound: number }>(
                '/api/admin/geo/curated/bulk',
                {
                    method: 'POST',
                    body: JSON.stringify({ items }),
                },
            )
            setMessage(
                t(
                    target
                        ? 'admin.geo.games.bulk.curatedMessage'
                        : 'admin.geo.games.bulk.removedMessage',
                    { count: data.updated },
                ),
            )
            setSelected(new Set())
            await reload()
        } catch (e) {
            setError(String(e))
        } finally {
            setBusy(false)
        }
    }

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <CardTitle className="text-sm">{t('admin.geo.games.title')}</CardTitle>
                        <CardDescription className="text-xs">
                            {t('admin.geo.games.subtitle')}
                        </CardDescription>
                    </div>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void reload()}
                        disabled={loading}
                        aria-label={t('admin.geo.games.refresh')}
                        className="h-7 w-7 p-0"
                    >
                        <RefreshCw
                            className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
                        />
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {/* Filter pills */}
                <div
                    className="flex flex-wrap items-center gap-1.5"
                    role="group"
                    aria-label={t('admin.geo.games.filter.label')}
                >
                    {(['all', 'curated', 'candidates'] as const).map((f) => (
                        <Button
                            key={f}
                            size="sm"
                            variant={filter === f ? 'default' : 'outline'}
                            onClick={() => {
                                setFilter(f)
                                setSelected(new Set())
                            }}
                            className="h-7 text-xs"
                        >
                            {t(`admin.geo.games.filter.${f}`)}
                            {f === 'curated' && ` (${curated.length})`}
                            {f === 'candidates' && ` (${candidates.length})`}
                            {f === 'all' && ` (${curated.length + candidates.length})`}
                        </Button>
                    ))}
                </div>

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

                {/* Bulk action bar (only when something is selected) */}
                {selected.size > 0 && (
                    <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 p-2 text-xs">
                        <span className="font-medium">
                            {t('admin.geo.games.bulk.selected', { count: selected.size })}
                            {(() => {
                                const noMap = rows.filter(
                                    (r) => selected.has(r.id) && r.mapEligibility === false,
                                ).length
                                return noMap > 0 ? (
                                    <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-warning">
                                        <AlertTriangle className="h-2.5 w-2.5" aria-hidden />
                                        {t('admin.geo.games.bulk.noMapLikely', { count: noMap })}
                                    </span>
                                ) : null
                            })()}
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => void applyBulk(true)}
                                className="h-7 text-xs"
                            >
                                {busy && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                                {t('admin.geo.games.bulk.curate')}
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => void applyBulk(false)}
                                className="h-7 text-xs"
                            >
                                {busy && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                                {t('admin.geo.games.bulk.remove')}
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setSelected(new Set())}
                                disabled={busy}
                                className="h-7 text-xs"
                            >
                                {t('admin.geo.games.bulk.clear')}
                            </Button>
                        </div>
                    </div>
                )}

                {loading && rows.length === 0 ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : rows.length > 0 ? (
                    <div className="overflow-hidden rounded-md border border-border/40">
                        {/* Header */}
                        <div className="flex items-center gap-2 border-b border-border/40 bg-muted/20 px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            <button
                                type="button"
                                onClick={selectAll}
                                className="flex h-4 w-4 items-center justify-center"
                                aria-label={
                                    selected.size === rows.length
                                        ? t('admin.geo.games.deselectAll')
                                        : t('admin.geo.games.selectAll')
                                }
                            >
                                {selected.size === rows.length && rows.length > 0 ? (
                                    <CheckSquare className="h-3.5 w-3.5" />
                                ) : (
                                    <Square className="h-3.5 w-3.5" />
                                )}
                            </button>
                            <span className="flex-1">{t('admin.geo.games.col.name')}</span>
                            <span className="w-16 text-right">
                                {t('admin.geo.games.col.score')}
                            </span>
                            <span className="w-20 text-right">
                                {t('admin.geo.games.col.status')}
                            </span>
                        </div>
                        <ul className="divide-y divide-border/40 max-h-[300px] sm:max-h-[520px] overflow-auto">
                            {rows.map((row) => (
                                <GameRowItem
                                    key={row.id}
                                    row={row}
                                    selected={selected.has(row.id)}
                                    onToggle={() => toggleSelect(row.id)}
                                    t={t}
                                />
                            ))}
                        </ul>
                    </div>
                ) : (
                    <p className="py-6 text-center text-xs text-muted-foreground">
                        {t('admin.geo.games.empty')}
                    </p>
                )}
            </CardContent>
        </Card>
    )
}

function GameRowItem({
    row,
    selected,
    onToggle,
    t,
}: {
    row: GameRow
    selected: boolean
    onToggle: () => void
    t: ReturnType<typeof useTranslation>['t']
}) {
    const score = row.metacritic
    const isTopScore = score !== null && score >= 90
    const noMapLikely = row.mapEligibility === false
    return (
        <li
            className={`flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
                selected ? 'bg-primary/5' : 'hover:bg-muted/20'
            }`}
        >
            <button
                type="button"
                onClick={onToggle}
                className="flex h-4 w-4 items-center justify-center"
                aria-label={selected ? t('admin.geo.games.deselect') : t('admin.geo.games.select')}
            >
                {selected ? (
                    <CheckSquare className="h-3.5 w-3.5 text-primary" />
                ) : (
                    <Square className="h-3.5 w-3.5 text-muted-foreground" />
                )}
            </button>

            <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                    <span className="font-medium truncate">{row.name}</span>
                    {row.releaseYear && (
                        <span className="text-[10px] text-muted-foreground">
                            ({row.releaseYear})
                        </span>
                    )}
                    {noMapLikely && (
                        <span
                            className="inline-flex items-center gap-0.5 rounded-full border border-warning/40 bg-warning/10 px-1.5 py-0 text-[10px] text-warning"
                            title={t('admin.geo.games.noMapLikelyTooltip', {
                                genres: (row.genres ?? []).join(', '),
                            })}
                        >
                            <AlertTriangle className="h-2.5 w-2.5" aria-hidden />
                            {t('admin.geo.games.noMapLikely')}
                        </span>
                    )}
                </div>
                {row.developer && (
                    <p className="text-[10px] text-muted-foreground truncate">
                        {row.developer}
                    </p>
                )}
            </div>

            <span className="w-16 text-right">
                {score !== null ? (
                    <span
                        className={
                            isTopScore
                                ? 'inline-flex items-center gap-0.5 rounded-full border border-score-high/40 bg-score-high/15 px-1.5 py-0 text-[10px] font-semibold tabular-nums text-score-high'
                                : 'text-muted-foreground tabular-nums text-[11px]'
                        }
                    >
                        {isTopScore && <Star className="h-2.5 w-2.5 fill-current" aria-hidden />}
                        {score}
                    </span>
                ) : (
                    <span className="text-muted-foreground">—</span>
                )}
            </span>

            <span className="w-20 text-right">
                {row.curated ? (
                    <Badge
                        variant={row.hasMap ? 'success' : 'warning'}
                        className="text-[10px] px-1.5 py-0"
                    >
                        {row.hasMap
                            ? t('admin.geo.games.status.curatedMapped')
                            : t('admin.geo.games.status.curatedNoMap')}
                    </Badge>
                ) : (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {t('admin.geo.games.status.candidate')}
                    </Badge>
                )}
            </span>
        </li>
    )
}
