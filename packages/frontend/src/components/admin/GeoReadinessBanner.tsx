import { useTranslation } from 'react-i18next'
import { CalendarCheck, CalendarClock, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { GeoHealth } from '@/hooks/useGeoHealth'

// Top-of-page answer to "is the next daily Géo challenge ready or not?"
// Renders only after cold-start is past (curated > 0 AND withMap > 0) so
// it doesn't fight GeoColdStartBanner. The Planifier action is owned here
// rather than on the metric strip so the readiness state and the only
// action that changes it sit together.
//
// State machine:
//   - nextChallenge present  -> "Ready for {date}", neutral/positive tone
//   - nextChallenge absent   -> "Not ready", with a Planifier button
//
// Backlog: when the backend exposes whether the assigned screenshot has
// an officialised location, this banner can surface the deeper "needs
// moderation" reason — for now `nextChallenge !== null` is the cheapest
// signal that lines up with what the moderator actually does.

interface GeoReadinessBannerProps {
    health: GeoHealth | null
    onSchedule: () => void
    scheduling: boolean
}

export function GeoReadinessBanner({
    health,
    onSchedule,
    scheduling,
}: GeoReadinessBannerProps) {
    const { t, i18n } = useTranslation()
    if (!health) return null
    const { curated, withMap } = health.coverage
    // Cold-start covers these two cases with its own banner — bail so
    // the moderator doesn't see two stacked status surfaces.
    if (curated === 0 || withMap === 0) return null

    const next = health.nextChallenge
    if (next) {
        const date = new Date(next.date).toLocaleDateString(i18n.language, {
            day: '2-digit',
            month: 'long',
        })
        return (
            <div
                className="flex items-center gap-3 rounded-md border border-success/40 bg-success/5 px-3 py-2.5 text-xs"
                role="status"
                aria-live="polite"
            >
                <CalendarCheck className="h-4 w-4 text-success shrink-0" aria-hidden />
                <p className="font-semibold text-foreground">
                    {t('admin.geo.readiness.ready', { date })}
                </p>
            </div>
        )
    }

    return (
        <div
            className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-md border border-warning/40 bg-warning/5 px-3 py-2.5 text-xs"
            role="status"
            aria-live="polite"
        >
            <CalendarClock className="h-4 w-4 text-warning shrink-0" aria-hidden />
            <div className="flex-1 space-y-0.5 leading-relaxed">
                <p className="font-semibold text-foreground">
                    {t('admin.geo.readiness.notReady')}
                </p>
                <p className="text-muted-foreground">
                    {t('admin.geo.readiness.notReadyHint')}
                </p>
            </div>
            <Button
                size="sm"
                onClick={onSchedule}
                disabled={scheduling}
                className="gradient-gaming hover:opacity-90 w-full sm:w-auto"
            >
                {scheduling ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                    <CalendarClock className="h-3.5 w-3.5 mr-1.5" />
                )}
                {t('admin.geo.readiness.scheduleAction')}
            </Button>
        </div>
    )
}
