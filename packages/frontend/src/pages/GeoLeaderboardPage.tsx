import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/lib/auth-client'
import { useGeoStore } from '@/stores/geoStore'
import { connectGeoSocket } from '@/lib/geo-socket'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Crown, Loader2, Medal, Trophy } from 'lucide-react'
import type { GeoLeaderboardEntry } from '@the-box/types'

function todayIso(): string {
    return new Date().toISOString().slice(0, 10)
}

function currentMonth(): string {
    return new Date().toISOString().slice(0, 7)
}

export default function GeoLeaderboardPage() {
    const { t } = useTranslation()
    const { data: session } = useSession()
    const { leaderboardDaily, leaderboardMonthly, loadLeaderboardDaily, loadLeaderboardMonthly } =
        useGeoStore()

    const [loading, setLoading] = useState(true)
    const date = useMemo(todayIso, [])
    const period = useMemo(currentMonth, [])

    useEffect(() => {
        connectGeoSocket(session?.user?.id)
    }, [session?.user?.id])

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        Promise.all([
            loadLeaderboardDaily(date),
            loadLeaderboardMonthly(period),
        ]).finally(() => {
            if (!cancelled) setLoading(false)
        })
        return () => {
            cancelled = true
        }
    }, [date, period, loadLeaderboardDaily, loadLeaderboardMonthly])

    return (
        <div className="container mx-auto max-w-3xl px-4 py-8 space-y-6">
            <header className="space-y-1">
                <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-fuchsia-400 to-purple-400 bg-clip-text text-transparent">
                    {t('geo.leaderboard.title', 'Geo Leaderboard')}
                </h1>
                <p className="text-sm text-muted-foreground">
                    {t('geo.leaderboard.subtitle', 'Ranked independently from the main game.')}
                </p>
            </header>

            {loading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-fuchsia-500" />
                </div>
            ) : (
                <Tabs defaultValue="daily">
                    <TabsList>
                        <TabsTrigger value="daily">
                            {t('geo.leaderboard.daily', 'Daily')}
                        </TabsTrigger>
                        <TabsTrigger value="monthly">
                            {t('geo.leaderboard.monthly', 'Monthly')}
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="daily">
                        <LeaderboardList entries={leaderboardDaily} />
                    </TabsContent>
                    <TabsContent value="monthly">
                        <LeaderboardList entries={leaderboardMonthly} />
                    </TabsContent>
                </Tabs>
            )}
        </div>
    )
}

function LeaderboardList({ entries }: { entries: GeoLeaderboardEntry[] }) {
    if (entries.length === 0) {
        return (
            <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    No entries yet — be the first.
                </CardContent>
            </Card>
        )
    }
    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-base">Top players</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
                {entries.map((e) => (
                    <LeaderboardRow key={e.userId} entry={e} />
                ))}
            </CardContent>
        </Card>
    )
}

function LeaderboardRow({ entry }: { entry: GeoLeaderboardEntry }) {
    return (
        <div className="flex items-center gap-3 rounded-lg border bg-card/30 px-3 py-2">
            <RankBadge rank={entry.rank} />
            <Avatar className="h-8 w-8">
                <AvatarImage src={entry.avatarUrl} alt={entry.displayName} />
                <AvatarFallback>{entry.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{entry.displayName}</p>
                <p className="text-xs text-muted-foreground truncate">@{entry.username}</p>
            </div>
            <span className="text-sm font-semibold tabular-nums">
                {entry.score.toLocaleString()}
            </span>
        </div>
    )
}

function RankBadge({ rank }: { rank: number }) {
    if (rank === 1) return <Crown className="h-5 w-5 text-amber-400" aria-label="1st" />
    if (rank === 2) return <Medal className="h-5 w-5 text-slate-300" aria-label="2nd" />
    if (rank === 3) return <Trophy className="h-5 w-5 text-amber-700" aria-label="3rd" />
    return <span className="w-5 text-center text-xs text-muted-foreground">{rank}</span>
}
