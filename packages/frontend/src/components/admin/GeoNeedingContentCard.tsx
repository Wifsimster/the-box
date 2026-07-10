import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, Loader2, MapPin, Target } from 'lucide-react'
import type { GeoGameNeedingContent } from '@the-box/types'
import { fetchAdminJson } from '@/lib/api/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

/**
 * The "one pin away" diagnostic (issue #331, phase 1). The GeoGamers health
 * card shows the *aggregate* eligible-game count; this card shows *which*
 * games are closest to becoming eligible — games with captures collecting
 * pins but no canonical pin yet — so an admin can spend pinning effort where
 * it moves the eligible-count needle. Each row deep-links into the review
 * queue for that game, where the existing override promotes a candidate.
 */
export function GeoNeedingContentCard() {
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
            <div className="flex justify-center py-6">
                <Loader2 className="size-6 animate-spin text-primary" />
            </div>
        )
    }
    if (error) {
        return (
            <p className="py-4 text-sm text-muted-foreground">
                Jeux à compléter : {error}
            </p>
        )
    }

    return (
        <Card className="mb-6 border-border bg-card/50">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Target className="size-4 text-neon-pink" />
                    <span>À un pin de l&apos;éligibilité</span>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {!rows || rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        Aucun jeu en attente de pin canonique : toutes les captures
                        collectées ont déjà une position de consensus, ou aucun jeu
                        n&apos;a encore de carte active avec des captures.
                    </p>
                ) : (
                    <>
                        <p className="text-xs text-muted-foreground">
                            Jeux avec une carte active et des captures qui collectent des
                            pins, mais sans position canonique. Promouvoir une capture
                            (via la file de revue) rend le jeu éligible au mode GeoGamers.
                        </p>
                        <ul className="divide-y divide-border/60">
                            {rows.map((g) => (
                                <li
                                    key={g.gameId}
                                    className="flex items-center justify-between gap-3 py-2"
                                >
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-medium">
                                            {g.gameName ?? `#${g.gameId}`}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                            <span>
                                                {g.candidateCount} capture
                                                {g.candidateCount > 1 ? 's' : ''}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <MapPin className="size-3" />
                                                {g.topPinCount} pin
                                                {g.topPinCount === 1 ? '' : 's'} (max)
                                            </span>
                                            {g.pinsToNextThreshold > 0 && (
                                                <span className="flex items-center gap-1 text-warning">
                                                    <AlertTriangle className="size-3" />
                                                    {g.pinsToNextThreshold} pin
                                                    {g.pinsToNextThreshold === 1 ? '' : 's'}{' '}
                                                    avant recalcul
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="shrink-0"
                                        onClick={() => openInQueue(g)}
                                    >
                                        Revoir
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </CardContent>
        </Card>
    )
}
