import { useTranslation } from 'react-i18next'
import { Loader2, Map, ListChecks, AlertTriangle, CalendarClock } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { GeoHealth } from '@/hooks/useGeoHealth'

// Persistent dataset-health indicator. One thin line of always-visible
// counters the operator can scan in <1 second:
//   `38/42 maps · 12 pins · 0 errors`
//
// Health data is owned by the parent (GeoReviewPanel) via `useGeoHealth`
// so the cold-start banner, the readiness banner and these counters all
// agree without duplicate polls.
//
// Counters act as shortcuts: clicking `maps` jumps to the Catalog tab
// on the Maps sub-section, `pins` lands on the moderation queue, and
// `errors` opens a Popover summarising the recent failures.
//
// The Schedule action used to live here as a Button — it now belongs to
// GeoReadinessBanner so the readiness state and the action that changes
// it sit together.

interface GeoHeaderStripProps {
    health: GeoHealth | null
    loading: boolean
    error: boolean
    onMapsClick?: () => void
    onPinsClick?: () => void
}

// `health.failures` is typed as `unknown[]` upstream so a contract drift
// on the backend can't crash the strip. The rendered fields are best-effort.
interface HealthFailureRow {
    gameId?: number
    source?: string
    reason?: string
    attempt?: number
}

export function GeoHeaderStrip({
    health,
    loading,
    error,
    onMapsClick,
    onPinsClick,
}: GeoHeaderStripProps) {
    const { t, i18n } = useTranslation()

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
    const failures = (health.failures as HealthFailureRow[] | undefined) ?? []

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
                onClick={onMapsClick}
                ariaLabel={t('admin.geo.strip.mapsAria')}
            />
            <Divider />
            <Counter
                icon={<ListChecks className="h-3.5 w-3.5" aria-hidden />}
                value={pinsToReview}
                label={t('admin.geo.strip.pins')}
                tone={pinsToReview > 0 ? 'warn' : 'neutral'}
                onClick={onPinsClick}
                ariaLabel={t('admin.geo.strip.pinsAria')}
            />
            <Divider />
            <ErrorsCounter
                count={errorsCount}
                failures={failures}
                queueFailed={queue.failed}
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
        </div>
    )
}

type Tone = 'good' | 'warn' | 'bad' | 'neutral'

function toneClass(tone: Tone): string {
    return tone === 'good'
        ? 'text-success'
        : tone === 'warn'
          ? 'text-warning'
          : tone === 'bad'
            ? 'text-destructive'
            : 'text-foreground'
}

function Counter({
    icon,
    value,
    label,
    tone,
    onClick,
    ariaLabel,
}: {
    icon: React.ReactNode
    value: string | number
    label: string
    tone: Tone
    onClick?: () => void
    ariaLabel?: string
}) {
    const valueClass = toneClass(tone)
    const body = (
        <>
            <span className={`${valueClass}`}>{icon}</span>
            <span className={`font-semibold tabular-nums ${valueClass}`}>{value}</span>
            <span className="text-muted-foreground">{label}</span>
        </>
    )
    if (!onClick) {
        return <span className="inline-flex items-center gap-1.5">{body}</span>
    }
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={ariaLabel}
            className="inline-flex items-center gap-1.5 rounded px-1 -mx-1 hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neon-pink"
        >
            {body}
        </button>
    )
}

// Errors get their own widget so the popover lifecycle stays scoped here:
// the parent doesn't need to know about open state, and the trigger keeps
// the same visual rhythm as the other counters.
function ErrorsCounter({
    count,
    failures,
    queueFailed,
}: {
    count: number
    failures: HealthFailureRow[]
    queueFailed: number
}) {
    const { t } = useTranslation()
    const tone: Tone = count > 0 ? 'bad' : 'good'
    const valueClass = toneClass(tone)
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={t('admin.geo.strip.errorsAria')}
                    className="inline-flex items-center gap-1.5 rounded px-1 -mx-1 hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neon-pink"
                >
                    <span className={valueClass}>
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <span className={`font-semibold tabular-nums ${valueClass}`}>
                        {count}
                    </span>
                    <span className="text-muted-foreground">
                        {t('admin.geo.strip.errors')}
                    </span>
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 text-xs">
                <p className="text-sm font-semibold">
                    {t('admin.geo.strip.errorsPopover.title')}
                </p>
                <p className="mt-1 text-muted-foreground">
                    {t('admin.geo.strip.errorsPopover.summary', {
                        queue: queueFailed,
                        failures: failures.length,
                    })}
                </p>
                {failures.length === 0 ? (
                    <p className="mt-3 text-muted-foreground">
                        {t('admin.geo.strip.errorsPopover.empty')}
                    </p>
                ) : (
                    <ul className="mt-3 space-y-1.5 max-h-60 overflow-auto pr-1">
                        {failures.slice(0, 12).map((f, i) => (
                            <li
                                key={i}
                                className="rounded border border-border/40 bg-muted/20 px-2 py-1.5"
                            >
                                {t('admin.geo.health.failures.row', {
                                    gameId: f.gameId ?? '?',
                                    source: f.source ?? '?',
                                    reason: f.reason ?? '?',
                                    attempt: f.attempt ?? '?',
                                })}
                            </li>
                        ))}
                    </ul>
                )}
            </PopoverContent>
        </Popover>
    )
}

function Divider() {
    return <span className="h-3 w-px bg-border/60" aria-hidden />
}
