import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowLeft, Trophy, Calendar, Clock, Users, TrendingUp, Award, Gift } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { tournamentService, type Tournament, type TournamentLeaderboardEntry, type TournamentStats } from '@/services/tournamentService'
import { useAuthStore } from '@/stores/authStore'

export default function TournamentDetailPage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { isAuthenticated } = useAuthStore()

    const [loading, setLoading] = useState(true)
    const [tournament, setTournament] = useState<Tournament | null>(null)
    const [leaderboard, setLeaderboard] = useState<TournamentLeaderboardEntry[]>([])
    const [stats, setStats] = useState<TournamentStats | null>(null)
    const [myRank, setMyRank] = useState<number | null>(null)
    const [error, setError] = useState<string | null>(null)

    const loadTournamentData = useCallback(async (tournamentId: number) => {
        try {
            setLoading(true)
            setError(null)

            const [tournamentData, leaderboardData, statsData] = await Promise.all([
                tournamentService.getTournament(tournamentId),
                tournamentService.getTournamentLeaderboard(tournamentId, 100),
                tournamentService.getTournamentStats(tournamentId),
            ])

            setTournament(tournamentData)
            setLeaderboard(leaderboardData)
            setStats(statsData)

            if (isAuthenticated) {
                const rank = await tournamentService.getMyRank(tournamentId)
                setMyRank(rank)
            }
        } catch (err) {
            console.error('Failed to load tournament:', err)
            const errorMessage = err instanceof Error ? err.message : 'Failed to load tournament data'
            setError(errorMessage)
        } finally {
            setLoading(false)
        }
    }, [isAuthenticated])

    useEffect(() => {
        if (id) {
            loadTournamentData(parseInt(id, 10))
        }
    }, [id, loadTournamentData])

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr)
        return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    }

    const getDaysRemaining = (endDate: string) => {
        const end = new Date(endDate)
        const now = new Date()
        const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        return diff
    }

    const getRankBadgeClass = (rank: number) => {
        if (rank === 1) return 'bg-yellow-400 text-yellow-950 hover:bg-yellow-500'
        if (rank === 2) return 'bg-gray-300 text-gray-950 hover:bg-gray-400'
        if (rank === 3) return 'bg-amber-600 text-white hover:bg-amber-700'
        return 'bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100'
    }

    const getRankIcon = (rank: number) => {
        if (rank === 1) return '🥇'
        if (rank === 2) return '🥈'
        if (rank === 3) return '🥉'
        return ''
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
                <div className="container mx-auto px-4 py-8 max-w-7xl">
                    <div className="space-y-4">
                        <Skeleton className="h-[200px] w-full" />
                        <Skeleton className="h-[400px] w-full" />
                    </div>
                </div>
            </div>
        )
    }

    if (error || !tournament) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
                <div className="container mx-auto px-4 py-8 max-w-7xl">
                    <Card className="max-w-md mx-auto text-center py-12">
                        <CardContent>
                            <p className="text-lg text-destructive">{error || 'Tournament not found'}</p>
                            <Button onClick={() => navigate('/tournaments')} className="mt-4">
                                Back to Tournaments
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
            <PageHero
                title={tournament.name}
                subtitle={
                    tournament.isActive
                        ? `Live tournament - ${getDaysRemaining(tournament.endDate)} days remaining`
                        : 'Tournament ended'
                }
                icon={Trophy}
            />

            <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
                <Button variant="ghost" onClick={() => navigate('/tournaments')} className="mb-4">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Tournaments
                </Button>

                {/* Tournament Info Card */}
                <Card className="border-2 border-primary/20">
                    <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-2xl">{tournament.name}</CardTitle>
                            <Badge className={tournament.isActive ? 'bg-green-500' : 'bg-gray-500'}>
                                {tournament.isActive ? 'LIVE NOW' : 'ENDED'}
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                            <div className="flex items-center gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-900">
                                <Calendar className="w-8 h-8 text-primary" />
                                <div>
                                    <p className="text-sm text-muted-foreground">Tournament Period</p>
                                    <p className="font-semibold text-sm">
                                        {formatDate(tournament.startDate)} - {formatDate(tournament.endDate)}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-900">
                                <Clock className="w-8 h-8 text-primary" />
                                <div>
                                    <p className="text-sm text-muted-foreground">Time Remaining</p>
                                    <p className="font-semibold">
                                        {tournament.isActive ? `${getDaysRemaining(tournament.endDate)} days` : 'Ended'}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-900">
                                <Trophy className="w-8 h-8 text-primary" />
                                <div>
                                    <p className="text-sm text-muted-foreground">Type</p>
                                    <p className="font-semibold capitalize">{tournament.type} Tournament</p>
                                </div>
                            </div>

                            {myRank && (
                                <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/10 border-2 border-primary/20">
                                    <Award className="w-8 h-8 text-primary" />
                                    <div>
                                        <p className="text-sm text-muted-foreground">Your Rank</p>
                                        <p className="font-bold text-primary text-lg">#{myRank}</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {tournament.prizeDescription && (
                            <div className="mb-6 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                                <h3 className="font-semibold mb-2 flex items-center gap-2 text-amber-900 dark:text-amber-100">
                                    <Gift className="w-5 h-5" />
                                    Prizes
                                </h3>
                                <p className="text-amber-900 dark:text-amber-100">{tournament.prizeDescription}</p>
                            </div>
                        )}

                        {/* Stats Grid */}
                        {stats && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="text-center p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border">
                                    <Users className="w-6 h-6 mx-auto mb-2 text-primary" />
                                    <p className="text-2xl font-bold text-primary">{stats.totalParticipants}</p>
                                    <p className="text-sm text-muted-foreground">Participants</p>
                                </div>
                                <div className="text-center p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border">
                                    <Trophy className="w-6 h-6 mx-auto mb-2 text-primary" />
                                    <p className="text-2xl font-bold text-primary">{stats.highestScore.toLocaleString()}</p>
                                    <p className="text-sm text-muted-foreground">Highest Score</p>
                                </div>
                                <div className="text-center p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border">
                                    <TrendingUp className="w-6 h-6 mx-auto mb-2 text-primary" />
                                    <p className="text-2xl font-bold text-primary">{stats.averageScore.toLocaleString()}</p>
                                    <p className="text-sm text-muted-foreground">Average Score</p>
                                </div>
                                <div className="text-center p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border">
                                    <Award className="w-6 h-6 mx-auto mb-2 text-primary" />
                                    <p className="text-2xl font-bold text-primary">{Math.round(stats.completionRate * 100)}%</p>
                                    <p className="text-sm text-muted-foreground">Participation</p>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Leaderboard Card */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-xl">
                            <Trophy className="w-6 h-6 text-primary" />
                            Leaderboard
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {leaderboard.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground">
                                No participants yet
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[100px]">Rank</TableHead>
                                            <TableHead>Player</TableHead>
                                            <TableHead className="text-right">Total Score</TableHead>
                                            <TableHead className="text-right">Challenges</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {leaderboard.map((entry) => (
                                            <TableRow key={entry.userId} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                                                <TableCell>
                                                    <Badge className={getRankBadgeClass(entry.rank)}>
                                                        {getRankIcon(entry.rank)} #{entry.rank}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-3">
                                                        {entry.avatarUrl ? (
                                                            <img
                                                                src={entry.avatarUrl}
                                                                alt={entry.displayName || entry.username}
                                                                className="w-8 h-8 rounded-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                                                                {(entry.displayName || entry.username).charAt(0).toUpperCase()}
                                                            </div>
                                                        )}
                                                        <span className="font-medium">{entry.displayName || entry.username}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right font-semibold text-primary">
                                                    {entry.totalScore.toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-right text-muted-foreground">
                                                    {entry.challengesCompleted}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
