import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trophy, Medal, Award, Sparkles, Users, Crosshair, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { geoGamersApi } from '@/lib/api/geogamers'
import { cn } from '@/lib/utils'
import type { GeoGamersSeasonStanding } from '@the-box/types'

function rankIcon(rank: number) {
    switch (rank) {
        case 1:
            return <Trophy className="size-5 text-medal-gold" aria-hidden="true" />
        case 2:
            return <Medal className="size-5 text-medal-silver" aria-hidden="true" />
        case 3:
            return <Award className="size-5 text-medal-bronze" aria-hidden="true" />
        default:
            return null
    }
}

export function GeoGamersSeasonPanel({ currentUserId }: { currentUserId?: string | null } = {}) {
    const { t } = useTranslation()
    const [standings, setStandings] = useState<GeoGamersSeasonStanding[]>([])
    const [players, setPlayers] = useState(0)
    const [month, setMonth] = useState('')
    const [loading, setLoading] = useState(true)
    const [failed, setFailed] = useState(false)
    const [attempt, setAttempt] = useState(0)

    useEffect(() => {
        let alive = true
        geoGamersApi
            .getSeason()
            .then((res) => {
                if (!alive) return
                setStandings(res.standings)
                setPlayers(res.players)
                setMonth(res.month)
                setFailed(false)
            })
            .catch(() => alive && setFailed(true))
            .finally(() => alive && setLoading(false))
        return () => {
            alive = false
        }
    }, [attempt])

    const retry = useCallback(() => {
        setLoading(true)
        setAttempt((n) => n + 1)
    }, [])

    if (loading) {
        return (
            <div aria-busy="true" className="space-y-2">
                <span className="sr-only" role="status">{t('leaderboard.loading')}</span>
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg bg-secondary/30 p-3">
                        <Skeleton className="size-5" variant="circular" />
                        <div className="flex-1 space-y-1.5">
                            <Skeleton variant="text" className="h-4 w-32" />
                            <Skeleton variant="text" className="h-3 w-20" />
                        </div>
                        <Skeleton className="h-6 w-12" />
                    </div>
                ))}
            </div>
        )
    }

    if (failed) {
        return (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
                <Crosshair className="size-10 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm sm:text-base text-muted-foreground max-w-xs">
                    {t('leaderboard.geogamers.unavailable')}
                </p>
                <Button variant="outline" onClick={retry}>
                    <RefreshCw aria-hidden="true" />
                    {t('common.retry')}
                </Button>
            </div>
        )
    }

    return (
        <Card className="bg-card/50">
            <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <CardTitle>{t('leaderboard.geogamers.title', { month })}</CardTitle>
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Users className="size-4" aria-hidden="true" />
                        {t('leaderboard.geogamers.players', { count: players })}
                    </span>
                </div>
            </CardHeader>
            <CardContent className="px-2 sm:px-(--card-padding)">
                {standings.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-8 text-center">
                        <Crosshair className="size-10 text-muted-foreground" aria-hidden="true" />
                        <p className="text-sm text-muted-foreground max-w-xs">
                            {t('leaderboard.geogamers.empty')}
                        </p>
                    </div>
                ) : (
                    <ol className="space-y-1 list-none">
                        {standings.map((s) => {
                            const isMe = !!currentUserId && s.userId === currentUserId
                            const icon = rankIcon(s.rank)
                            return (
                                <li
                                    key={s.userId}
                                    aria-current={isMe ? 'true' : undefined}
                                    className={cn(
                                        'flex items-center gap-3 rounded-lg p-3',
                                        isMe
                                            ? 'bg-primary/10 ring-1 ring-primary/40'
                                            : s.rank <= 3
                                              ? 'bg-secondary/50'
                                              : 'bg-transparent',
                                    )}
                                >
                                    <div className="flex w-7 shrink-0 justify-center tabular-nums">
                                        {icon ? (
                                            <>
                                                {icon}
                                                <span className="sr-only">#{s.rank}</span>
                                            </>
                                        ) : (
                                            <span className="text-sm font-bold text-muted-foreground">
                                                {s.rank}
                                            </span>
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex min-w-0 items-center gap-2">
                                            <span className="truncate font-semibold">{s.username}</span>
                                            {isMe && (
                                                <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                                                    {t('leaderboard.you')}
                                                </span>
                                            )}
                                            {s.jokerUsed && (
                                                <Sparkles
                                                    className="size-3.5 shrink-0 text-neon-pink"
                                                    role="img"
                                                    aria-label={t('leaderboard.geogamers.jokerUsed')}
                                                />
                                            )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                            <span>
                                                {t('leaderboard.geogamers.daysPlayed', {
                                                    count: s.daysPlayed,
                                                })}
                                                {s.droppedDays > 0 &&
                                                    ` · ${t('leaderboard.geogamers.dropped')}`}
                                            </span>
                                            {s.provisional && (
                                                <Badge variant="outline" className="px-1.5 py-0 text-[11px] font-medium text-muted-foreground">
                                                    {t('leaderboard.geogamers.provisional')}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                    <span className="shrink-0 text-lg font-bold text-primary tabular-nums">
                                        {s.seasonScore}
                                    </span>
                                </li>
                            )
                        })}
                    </ol>
                )}
            </CardContent>
        </Card>
    )
}
