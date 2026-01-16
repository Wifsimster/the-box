import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Trophy, Calendar, Gift, AlertCircle } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { tournamentService, type Tournament } from '@/services/tournamentService'

export default function TournamentsPage() {
    const { t, i18n } = useTranslation()
    const navigate = useNavigate()
    const [activeTournaments, setActiveTournaments] = useState<Tournament[]>([])
    const [upcomingTournaments, setUpcomingTournaments] = useState<Tournament[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadTournaments()
    }, [])

    const loadTournaments = async () => {
        try {
            setLoading(true)
            const [active, upcoming] = await Promise.all([
                tournamentService.getActiveTournaments(),
                tournamentService.getUpcomingTournaments(),
            ])
            setActiveTournaments(active)
            setUpcomingTournaments(upcoming)
        } catch (error) {
            console.error('Failed to load tournaments:', error)
        } finally {
            setLoading(false)
        }
    }

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr)
        return date.toLocaleDateString(i18n.language, { month: 'short', day: 'numeric', year: 'numeric' })
    }

    const getDaysRemaining = (endDate: string) => {
        const end = new Date(endDate)
        const now = new Date()
        const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        return diff
    }

    const getTournamentIcon = (type: string) => {
        return type === 'weekly' ? '📅' : '📆'
    }

    const viewTournament = (id: number) => {
        navigate(`/tournaments/${id}`)
    }

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1 },
        },
    }

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 },
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
            <PageHero
                title={t('tournaments.title')}
                subtitle={t('tournaments.subtitle')}
                icon={Trophy}
            />

            <div className="container mx-auto px-4 py-8 max-w-7xl">
                {loading ? (
                    <div className="space-y-4">
                        <Skeleton className="h-[200px] w-full" />
                        <Skeleton className="h-[200px] w-full" />
                        <Skeleton className="h-[200px] w-full" />
                    </div>
                ) : (
                    <Tabs defaultValue="active" className="w-full">
                        <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-8">
                            <TabsTrigger value="active">{t('tournaments.tabs.active')}</TabsTrigger>
                            <TabsTrigger value="upcoming">{t('tournaments.tabs.upcoming')}</TabsTrigger>
                        </TabsList>

                        <TabsContent value="active">
                            {activeTournaments.length === 0 ? (
                                <Card className="max-w-md mx-auto text-center py-12">
                                    <CardContent>
                                        <AlertCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                                        <p className="text-lg text-muted-foreground">{t('tournaments.noActive')}</p>
                                    </CardContent>
                                </Card>
                            ) : (
                                <motion.div
                                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                                    variants={containerVariants}
                                    initial="hidden"
                                    animate="visible"
                                >
                                    {activeTournaments.map((tournament) => (
                                        <motion.div key={tournament.id} variants={itemVariants}>
                                            <Card className="h-full flex flex-col hover:shadow-lg transition-shadow border-2 border-primary/20">
                                                <CardHeader>
                                                    <div className="flex items-start justify-between mb-2">
                                                        <Badge className="bg-green-500 hover:bg-green-600 text-white">
                                                            {t('tournaments.liveNow')}
                                                        </Badge>
                                                    </div>
                                                    <CardTitle className="flex items-center gap-2 text-xl">
                                                        <span className="text-2xl">{getTournamentIcon(tournament.type)}</span>
                                                        {tournament.name}
                                                    </CardTitle>
                                                </CardHeader>
                                                <CardContent className="flex-1 space-y-3">
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-muted-foreground">{t('tournaments.type')}:</span>
                                                        <span className="font-semibold capitalize">{t(`tournaments.${tournament.type}`)}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-muted-foreground">{t('tournaments.period')}:</span>
                                                        <span className="font-semibold text-xs">
                                                            {formatDate(tournament.startDate)} - {formatDate(tournament.endDate)}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-muted-foreground">{t('tournaments.endsIn')}:</span>
                                                        <span className="font-bold text-primary">
                                                            {getDaysRemaining(tournament.endDate)} {t('tournaments.days')}
                                                        </span>
                                                    </div>
                                                    {tournament.prizeDescription && (
                                                        <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                                                            <div className="flex items-start gap-2 text-sm">
                                                                <Gift className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                                                                <span className="text-amber-900 dark:text-amber-100">
                                                                    {tournament.prizeDescription}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </CardContent>
                                                <CardFooter>
                                                    <Button
                                                        onClick={() => viewTournament(tournament.id)}
                                                        className="w-full"
                                                    >
                                                        <Trophy className="w-4 h-4 mr-2" />
                                                        {t('tournaments.viewLeaderboard')}
                                                    </Button>
                                                </CardFooter>
                                            </Card>
                                        </motion.div>
                                    ))}
                                </motion.div>
                            )}
                        </TabsContent>

                        <TabsContent value="upcoming">
                            {upcomingTournaments.length === 0 ? (
                                <Card className="max-w-md mx-auto text-center py-12">
                                    <CardContent>
                                        <AlertCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                                        <p className="text-lg text-muted-foreground">{t('tournaments.noUpcoming')}</p>
                                    </CardContent>
                                </Card>
                            ) : (
                                <motion.div
                                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                                    variants={containerVariants}
                                    initial="hidden"
                                    animate="visible"
                                >
                                    {upcomingTournaments.map((tournament) => (
                                        <motion.div key={tournament.id} variants={itemVariants}>
                                            <Card className="h-full flex flex-col hover:shadow-lg transition-shadow">
                                                <CardHeader>
                                                    <div className="flex items-start justify-between mb-2">
                                                        <Badge variant="secondary">{t('tournaments.upcoming')}</Badge>
                                                    </div>
                                                    <CardTitle className="flex items-center gap-2 text-xl">
                                                        <span className="text-2xl">{getTournamentIcon(tournament.type)}</span>
                                                        {tournament.name}
                                                    </CardTitle>
                                                </CardHeader>
                                                <CardContent className="flex-1 space-y-3">
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-muted-foreground">{t('tournaments.type')}:</span>
                                                        <span className="font-semibold capitalize">{t(`tournaments.${tournament.type}`)}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-muted-foreground">{t('tournaments.starts')}:</span>
                                                        <span className="font-semibold">{formatDate(tournament.startDate)}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-muted-foreground">{t('tournaments.duration')}:</span>
                                                        <span className="font-semibold text-xs">
                                                            {formatDate(tournament.startDate)} - {formatDate(tournament.endDate)}
                                                        </span>
                                                    </div>
                                                    {tournament.prizeDescription && (
                                                        <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                                                            <div className="flex items-start gap-2 text-sm">
                                                                <Gift className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                                                                <span className="text-amber-900 dark:text-amber-100">
                                                                    {tournament.prizeDescription}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </CardContent>
                                                <CardFooter>
                                                    <Button
                                                        onClick={() => viewTournament(tournament.id)}
                                                        variant="outline"
                                                        className="w-full"
                                                    >
                                                        <Calendar className="w-4 h-4 mr-2" />
                                                        {t('tournaments.viewDetails')}
                                                    </Button>
                                                </CardFooter>
                                            </Card>
                                        </motion.div>
                                    ))}
                                </motion.div>
                            )}
                        </TabsContent>
                    </Tabs>
                )}
            </div>
        </div>
    )
}
