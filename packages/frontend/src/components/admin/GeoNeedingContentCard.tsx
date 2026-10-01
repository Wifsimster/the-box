import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ChevronRight, MapPin, Target } from 'lucide-react'
import type { GeoGameNeedingContent } from '@the-box/types'
import { fetchAdminJson } from '@/lib/api/admin'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * The "one pin away" diagnostic (issue #331, phase 1). The GeoGamers health
 * card shows the *aggregate* eligible-game count; this card shows *which*
 * games are closest to becoming eligible — games with captures collecting
 * pins but no canonical pin yet — so an admin can spend pinning effort where
 * it moves the eligible-count needle. Each row deep-links into the review
 * queue for that game, where the existing override promotes a candidate.
 */
export function GeoNeedingContentCard() {
    const { t } = useTranslation()
    const [rows, setRows] = useState<GeoGameNeedingContent[] | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [, setSearchParams] = useSearchParams()
    const mounted = useRef(true)

    useEffect(() => {
        mounted.current = true
        void (async () => {
            try {
                const data = await fetchAdminJson<GeoGameNeedingContent[]>(
                    '/api/admin/geo/games-needing-content?limit=10',
                )
                if (mounted.current) setRows(data)
            } catch (e) {
                if (mounted.current) setError(String(e))
            } finally {
                if (mounted.current) setLoading(false)
            }
        })()
        return () => {
            mounted.current = false
        }
    }, [])

    // Deep-link into the review queue seeded on this game. GeoReviewPanel reads
    // the `qGameId`/`qGameName` params once to pre-select the queue tab + game
    // filter, then strips them from the URL.
    const openInQueue = (game: GeoGameNeedingContent) => {
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev)
                next.set('tab', 'geo')
                next.set('sub', 'queue')
                next.set('qGameId', String(game.gameId))
                next.set('qGameName', game.gameName ?? `#${game.gameId}`)
                return next
            },
            { replace: true },
        )
    }

    if (loading) {
        return (
            <Card className="border-border bg-card/50" aria-busy="true">
                <CardHeader>
                    <Skeleton className="h-5 w-48 max-w-full" variant="text" />
                </CardHeader>
                <CardContent className="space-y-3">
                    {[0, 1, 2].map((i) => (
                        <Skeleton key={i} className="h-11 w-full" />
                    ))}
                </CardContent>
            </Card>
        )
    }
    if (error) {
        return (
            <p role="alert" className="flex items-start gap-2 text-sm text-muted-foreground">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                <span className="break-words">
                    {t('admin.geoNeedingContent.loadError')} {error}
                </span>
            </p>
        )
    }

    return (
        <Card className="border-border bg-card/50">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Target className="size-4 text-neon-pink" aria-hidden="true" />
                    <span>{t('admin.geoNeedingContent.title')}</span>
                </CardTitle>
                {rows && rows.length > 0 && (
                    <CardDescription className="text-xs sm:text-sm">
                        {t('admin.geoNeedingContent.description')}
                    </CardDescription>
                )}
            </CardHeader>
            <CardContent>
                {!rows || rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        {t('admin.geoNeedingContent.empty')}
                    </p>
                ) : (
                    <ul className="-mx-2 divide-y divide-border/60">
                        {rows.map((g) => (
                            <li key={g.gameId}>
                                <Button
                                    variant="ghost"
                                    onClick={() => openInQueue(g)}
                                    className="h-auto min-h-11 w-full justify-between gap-3 whitespace-normal px-2 py-2 text-left font-normal"
                                >
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-medium">
                                            {g.gameName ?? `#${g.gameId}`}
                                        </span>
                                        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                            <span>
                                                {t('admin.geoNeedingContent.captures', { count: g.candidateCount })}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <MapPin className="size-3" aria-hidden="true" />
                                                {t('admin.geoNeedingContent.topPins', { count: g.topPinCount })}
                                            </span>
                                            {g.pinsToNextThreshold > 0 && (
                                                <span className="flex items-center gap-1 text-warning">
                                                    <AlertTriangle className="size-3" aria-hidden="true" />
                                                    {t('admin.geoNeedingContent.pinsToThreshold', {
                                                        count: g.pinsToNextThreshold,
                                                    })}
                                                </span>
                                            )}
                                        </span>
                                    </span>
                                    <span className="flex shrink-0 items-center gap-1 text-sm text-primary">
                                        <span className="hidden sm:inline">{t('admin.geoNeedingContent.review')}</span>
                                        <ChevronRight className="size-4" aria-hidden="true" />
                                    </span>
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    )
}
