import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import { fetchAdminJson } from '@/lib/api/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
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
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{value}</dd>
        </div>
    )
}

export function GeoGamersHealthCard() {
    const { t } = useTranslation()
    const [health, setHealth] = useState<GeoGamersHealth | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [creating, setCreating] = useState(false)
    const [notice, setNotice] = useState<string | null>(null)
    // Guards against setState after unmount (the fetches outlive a quick tab switch).
    const mounted = useRef(true)

    // Promise callbacks rather than `await` so the state writes are visibly
    // asynchronous to the effect that calls this on mount (React Compiler's
    // set-state-in-effect treats writes after `await` as synchronous).
    function load() {
        return fetchAdminJson<GeoGamersHealth>('/api/admin/geogamers/health')
            .then(
                (d) => {
                    if (mounted.current) {
                        setHealth(d)
                        setError(null)
                    }
                },
                (e) => {
                    if (mounted.current) setError(String(e))
                },
            )
            .finally(() => {
                if (mounted.current) setLoading(false)
            })
    }

    useEffect(() => {
        mounted.current = true
        void load()
        return () => {
            mounted.current = false
        }
    }, [])

    async function createChallenge() {
        setCreating(true)
        setNotice(null)
        try {
            const res = await fetchAdminJson<{ message: string }>(
                '/api/admin/geogamers/create-challenge',
                { method: 'POST' },
            )
            if (mounted.current) setNotice(res.message)
            await load()
        } catch (e) {
            if (mounted.current) setNotice(String(e))
        } finally {
            if (mounted.current) setCreating(false)
        }
    }

    if (loading) {
        return (
            <Card className="border-border bg-card/50" aria-busy="true">
                <CardHeader>
                    <Skeleton className="h-5 w-56 max-w-full" variant="text" />
                </CardHeader>
                <CardContent className="space-y-3">
                    <Skeleton className="h-10 w-full" />
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {[0, 1, 2, 3].map((i) => (
                            <Skeleton key={i} className="h-14" />
                        ))}
                    </div>
                </CardContent>
            </Card>
        )
    }
    if (error || !health) {
        return (
            <Card variant="error" className="bg-card/50">
                <CardContent role="alert" className="flex flex-col gap-3 pt-(--card-padding) text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span className="flex items-start gap-2 text-muted-foreground">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                        <span>
                            {t('admin.geogamersHealth.loadError')}
                            {error && <span className="block break-words text-xs">{error}</span>}
                        </span>
                    </span>
                    <Button
                        variant="outline"
                        onClick={() => {
                            setLoading(true)
                            void load()
                        }}
                        className="self-start sm:self-auto"
                    >
                        <RefreshCw className="size-4" />
                        {t('common.retry')}
                    </Button>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="border-border bg-card/50">
            <CardHeader>
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span>{t('admin.geogamersHealth.title')}</span>
                    <span
                        className={cn(
                            'flex items-center gap-1 rounded px-2 py-0.5 text-xs font-normal',
                            health.enabled
                                ? 'bg-success/15 text-success'
                                : 'bg-muted text-muted-foreground',
                        )}
                    >
                        {health.enabled ? t('admin.geogamersHealth.enabled') : t('admin.geogamersHealth.disabled')}
                    </span>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {health.starved ? (
                    <div className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        <span>
                            {t('admin.geogamersHealth.starved', {
                                count: health.eligibleGames,
                                min: health.minRequired,
                            })}
                        </span>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
                        <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                        <span>
                            {t('admin.geogamersHealth.healthy', {
                                count: health.eligibleGames,
                                min: health.minRequired,
                            })}
                        </span>
                    </div>
                )}

                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Stat label={t('admin.geogamersHealth.stats.eligibleGames')} value={health.eligibleGames} />
                    <Stat label={t('admin.geogamersHealth.stats.eligibleScreenshots')} value={health.eligibleScreenshots} />
                    <Stat label={t('admin.geogamersHealth.stats.gamesOnCooldown')} value={health.gamesOnCooldown} />
                    <Stat label={t('admin.geogamersHealth.stats.seasonPlayers')} value={health.season.players} />
                </dl>

                <p className="text-xs text-muted-foreground">
                    {t('admin.geogamersHealth.summary', {
                        today: health.todayChallengeExists
                            ? t('admin.geogamersHealth.todayCreated')
                            : t('admin.geogamersHealth.todayPending'),
                        current: health.currentChallengeDate ?? '—',
                        cooldown: health.cooldownDays,
                        season: health.season.month,
                    })}
                </p>

                {/* Manual first-challenge creation — avoids waiting for the
                    00:05 UTC cron right after enabling the feature. */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <Button
                        variant="outline"
                        disabled={creating || health.todayChallengeExists}
                        onClick={() => void createChallenge()}
                        className="w-full sm:w-auto"
                    >
                        {creating && <Loader2 className="size-4 animate-spin" />}
                        {health.todayChallengeExists
                            ? t('admin.geogamersHealth.alreadyCreated')
                            : t('admin.geogamersHealth.createToday')}
                    </Button>
                    {notice && (
                        <span className="text-xs text-muted-foreground" role="status">
                            {notice}
                        </span>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
