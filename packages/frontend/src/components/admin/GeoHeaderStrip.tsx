import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Map, ListChecks, AlertTriangle, CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Persistent dataset-health indicator that replaces GeoAdminActions'
// metric/queue tile grids. One thin line of always-visible counters that
// the operator can scan in <1 second:
//   `38/42 maps · 12 pins · 0 errors`
// Refreshes itself every 30s so a long-open admin tab stays current.

interface HealthData {
    coverage: { curated: number; resolved: number; withMap: number; total: number }
    queue: { active: number; waiting: number; delayed: number; failed: number }
    nextChallenge: { id: number; date: string } | null
    failures: Array<unknown>
}

interface GeoHeaderStripProps {
    onScheduleClick?: () => void
    scheduling?: boolean
}

export function GeoHeaderStrip({ onScheduleClick, scheduling }: GeoHeaderStripProps) {
    const { t, i18n } = useTranslation()
    const [health, setHealth] = useState<HealthData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)

    const reload = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/geo/health', { credentials: 'include' })
            const json = await res.json().catch(() => ({}))
            if (!res.ok || !json?.success) throw new Error('health failed')
            setHealth(json.data as HealthData)
            setError(false)
        } catch {
            setError(true)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void reload()
        const id = window.setInterval(() => void reload(), 30_000)
        return () => window.clearInterval(id)
    }, [reload])

    if (loading && !health) {
        return (
            <div className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('admin.geo.strip.loading')}
            </div>
        )
    }

    if (error || !health) {
        return (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
                {t('admin.geo.strip.error')}
            </div>
        )
    }

    const { coverage, queue, nextChallenge } = health
    // "Errors" surfaces both BullMQ failed jobs and active per-game tombstones
    // — anything an operator should investigate. Keeping it as one number
    // avoids a tile grid creeping back in.
    const errorsCount = queue.failed + (health.failures?.length ?? 0)
    const pinsToReview = queue.waiting + queue.active

    return (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border/40 bg-muted/10 px-3 py-2 text-xs">
            <Counter
                icon={<Map className="h-3.5 w-3.5" aria-hidden />}
                value={`${coverage.withMap} / ${coverage.curated}`}
                label={t('admin.geo.strip.maps')}
                tone={
                    coverage.withMap === coverage.curated && coverage.curated > 0
                        ? 'good'
                        : 'neutral'
                }
            />
            <Divider />
            <Counter
                icon={<ListChecks className="h-3.5 w-3.5" aria-hidden />}
                value={pinsToReview}
                label={t('admin.geo.strip.pins')}
                tone={pinsToReview > 0 ? 'warn' : 'neutral'}
            />
            <Divider />
            <Counter
                icon={<AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
                value={errorsCount}
                label={t('admin.geo.strip.errors')}
                tone={errorsCount > 0 ? 'bad' : 'good'}
            />
            {nextChallenge && (
                <>
                    <Divider />
                    <Counter
                        icon={<CalendarClock className="h-3.5 w-3.5" aria-hidden />}
                        value={new Date(nextChallenge.date).toLocaleDateString(i18n.language, {
                            day: '2-digit',
                            month: 'short',
                        })}
                        label={t('admin.geo.strip.nextChallenge')}
                        tone="neutral"
                    />
                </>
            )}
            {onScheduleClick && (
                <Button
                    size="sm"
                    variant="ghost"
                    className="w-full sm:w-auto sm:ml-auto h-7 text-xs"
                    onClick={onScheduleClick}
                    disabled={scheduling}
                >
                    {scheduling ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : (
                        <CalendarClock className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    {t('admin.geo.strip.scheduleNow')}
                </Button>
            )}
        </div>
    )
}

type Tone = 'good' | 'warn' | 'bad' | 'neutral'

function Counter({
    icon,
    value,
    label,
    tone,
}: {
    icon: React.ReactNode
    value: string | number
    label: string
    tone: Tone
}) {
    const valueClass =
        tone === 'good'
            ? 'text-success'
            : tone === 'warn'
              ? 'text-warning'
              : tone === 'bad'
                ? 'text-destructive'
                : 'text-foreground'
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className={`${valueClass}`}>{icon}</span>
            <span className={`font-semibold tabular-nums ${valueClass}`}>{value}</span>
            <span className="text-muted-foreground">{label}</span>
        </span>
    )
}

function Divider() {
    return <span className="h-3 w-px bg-border/60" aria-hidden />
}
