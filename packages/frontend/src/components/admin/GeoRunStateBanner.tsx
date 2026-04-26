import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import type { GeoRunStatePayload } from '@/hooks/useGeoRunPolling'

// Compact summary line of in-flight BullMQ counts during a manual run.
// Hidden while the queue is idle so it doesn't clutter the layout. Lives
// at the GeoReviewPanel level so it survives Pins/Maps/Games tab switches.
export function GeoRunStateBanner({ state }: { state: GeoRunStatePayload | null }) {
    const { t } = useTranslation()
    if (!state || !state.isActive) return null
    const { active, waiting, delayed, failed } = state.counts
    return (
        <div
            className="flex flex-wrap items-center gap-2 rounded-md border border-neon-pink/30 bg-neon-pink/5 px-3 py-1.5 text-[11px]"
            role="status"
            aria-live="polite"
        >
            <span className="inline-flex items-center gap-1 text-neon-pink">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                {t('admin.geo.run.banner.active', { count: active })}
            </span>
            <span className="text-muted-foreground">
                · {t('admin.geo.run.banner.waiting', { count: waiting + delayed })}
            </span>
            {failed > 0 && (
                <span className="text-destructive">
                    · {t('admin.geo.run.banner.failed', { count: failed })}
                </span>
            )}
        </div>
    )
}
