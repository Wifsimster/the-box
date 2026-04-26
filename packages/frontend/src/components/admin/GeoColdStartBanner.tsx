import { useTranslation } from 'react-i18next'
import { Compass } from 'lucide-react'
import type { GeoHealth } from '@/hooks/useGeoHealth'

// Cold-start guidance for a brand-new instance (no curated games or no
// imported maps yet). Surfaces above the Pins/Maps/Games tabs so a
// first-time operator knows the entry point is the Games tab — without
// it they hit "0/0 maps" with no obvious next step.
export function GeoColdStartBanner({ health }: { health: GeoHealth | null }) {
    const { t } = useTranslation()
    if (!health) return null
    const { curated, withMap } = health.coverage

    const stage: 'no-curated' | 'no-maps' | null =
        curated === 0 ? 'no-curated' : withMap === 0 ? 'no-maps' : null
    if (stage === null) return null

    return (
        <div
            className="flex items-start gap-3 rounded-md border border-neon-pink/30 bg-linear-to-r from-neon-pink/5 via-neon-purple/5 to-transparent px-3 py-2.5 text-xs"
            role="note"
        >
            <Compass className="h-4 w-4 text-neon-pink shrink-0 mt-0.5" aria-hidden />
            <div className="space-y-1 leading-relaxed">
                <p className="font-semibold text-foreground">
                    {t(`admin.geo.coldStart.${stage}.title`)}
                </p>
                <p className="text-muted-foreground">
                    {t(`admin.geo.coldStart.${stage}.body`)}
                </p>
            </div>
        </div>
    )
}
