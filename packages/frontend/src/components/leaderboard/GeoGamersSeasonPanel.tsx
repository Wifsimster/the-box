import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trophy, Medal, Award, Loader2, Sparkles, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { geoGamersApi } from '@/lib/api/geogamers'
import { cn } from '@/lib/utils'
import type { GeoGamersSeasonStanding } from '@the-box/types'

function rankIcon(rank: number) {
    switch (rank) {
        case 1:
            return <Trophy className="size-5 text-medal-gold" />
        case 2:
            return <Medal className="size-5 text-medal-silver" />
        case 3:
            return <Award className="size-5 text-medal-bronze" />
        default:
            return <span className="font-bold text-muted-foreground">{rank}</span>
    }
}

export function GeoGamersSeasonPanel() {
    const { t } = useTranslation()
    const [standings, setStandings] = useState<GeoGamersSeasonStanding[]>([])
    const [players, setPlayers] = useState(0)
    const [month, setMonth] = useState('')
    const [loading, setLoading] = useState(true)
    const [failed, setFailed] = useState(false)

    useEffect(() => {
        let alive = true
        geoGamersApi
            .getSeason()
            .then((res) => {
                if (!alive) return
                setStandings(res.standings)
                setPlayers(res.players)
                setMonth(res.month)
            })
            .catch(() => alive && setFailed(true))
            .finally(() => alive && setLoading(false))
        return () => {
            alive = false
        }
    }, [])

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <Loader2 className="size-8 animate-spin text-primary" />
            </div>
        )
    }

    if (failed) {
        return (
            <p className="py-12 text-center text-muted-foreground">
                {t('leaderboard.geogamers.unavailable')}
            </p>
        )
    }

    return (
        <Card className="border-border bg-card/50">
            <CardHeader>
                <CardTitle className="flex items-center justify-between">
                    <span>{t('leaderboard.geogamers.title', { month })}</span>
                    <span className="flex items-center gap-1 text-sm font-normal text-muted-foreground">
                        <Users className="size-4" />
                        {t('leaderboard.geogamers.players', { count: players })}
                    </span>
                </CardTitle>
            </CardHeader>
            <CardContent>
                {standings.length === 0 ? (
                    <p className="py-8 text-center text-muted-foreground">
                        {t('leaderboard.geogamers.empty')}
                    </p>
                ) : (
                    <div className="space-y-1">
                        {standings.map((s) => (
                            <div
                                key={s.userId}
                                className={cn(
                                    'flex items-center gap-3 rounded-lg px-3 py-2',
                                    s.rank <= 3 ? 'bg-primary/10' : 'bg-transparent',
                                )}
                            >
                                <div className="flex w-8 shrink-0 justify-center">
                                    {rankIcon(s.rank)}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="truncate font-medium">{s.username}</span>
                                        {s.jokerUsed && (
                                            <Sparkles className="size-3.5 shrink-0 text-neon-pink" />
                                        )}
                                        {s.provisional && (
                                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                                {t('leaderboard.geogamers.provisional')}
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-xs text-muted-foreground">
                                        {t('leaderboard.geogamers.daysPlayed', {
                                            count: s.daysPlayed,
                                        })}
                                        {s.droppedDays > 0 &&
                                            ` · ${t('leaderboard.geogamers.dropped')}`}
                                    </span>
                                </div>
                                <span className="shrink-0 text-lg font-bold text-neon-purple">
                                    {s.seasonScore}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
