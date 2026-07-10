import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { fetchAdminJson } from '@/lib/api/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface GeoGamersHealth {
    enabled: boolean
    minRequired: number
    cooldownDays: number
    eligibleGames: number
    eligibleScreenshots: number
    gamesOnCooldown: number
    starved: boolean
    todayChallengeExists: boolean
    currentChallengeDate: string | null
    season: { month: string; players: number }
}

function Stat({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-lg bg-muted/40 px-3 py-2">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-lg font-semibold">{value}</div>
        </div>
    )
}

export function GeoGamersHealthCard() {
    const [health, setHealth] = useState<GeoGamersHealth | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        fetchAdminJson<GeoGamersHealth>('/api/admin/geogamers/health')
            .then((d) => !cancelled && setHealth(d))
            .catch((e) => !cancelled && setError(String(e)))
            .finally(() => !cancelled && setLoading(false))
        return () => {
            cancelled = true
        }
    }, [])

    if (loading) {
        return (
            <div className="flex justify-center py-6">
                <Loader2 className="size-6 animate-spin text-primary" />
            </div>
        )
    }
    if (error || !health) {
        return <p className="py-4 text-sm text-muted-foreground">GeoGamers: {error ?? 'no data'}</p>
    }

    return (
        <Card className="mb-6 border-border bg-card/50">
            <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                    <span>GeoGamers — état du contenu</span>
                    <span
                        className={cn(
                            'flex items-center gap-1 rounded px-2 py-0.5 text-xs font-normal',
                            health.enabled
                                ? 'bg-success/15 text-success'
                                : 'bg-muted text-muted-foreground',
                        )}
                    >
                        {health.enabled ? 'Activé' : 'Désactivé'}
                    </span>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {health.starved ? (
                    <div className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                        <span>
                            Contenu insuffisant : {health.eligibleGames} jeux éligibles (min{' '}
                            {health.minRequired}). Le défi du jour peut être ignoré — ajoute des
                            captures avec pin de consensus.
                        </span>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
                        <CheckCircle2 className="size-4 shrink-0" />
                        <span>
                            Contenu suffisant : {health.eligibleGames} jeux éligibles (min{' '}
                            {health.minRequired}).
                        </span>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Stat label="Jeux éligibles" value={health.eligibleGames} />
                    <Stat label="Captures éligibles" value={health.eligibleScreenshots} />
                    <Stat label="Jeux en cooldown" value={health.gamesOnCooldown} />
                    <Stat label="Joueurs (saison)" value={health.season.players} />
                </div>

                <div className="text-xs text-muted-foreground">
                    Défi du jour :{' '}
                    {health.todayChallengeExists ? 'créé' : 'pas encore'} · Défi courant :{' '}
                    {health.currentChallengeDate ?? '—'} · Cooldown : {health.cooldownDays} j ·
                    Saison : {health.season.month}
                </div>
            </CardContent>
        </Card>
    )
}
