import { useTranslation } from 'react-i18next'
import { useGeoFetchStore } from '@/stores/geoFetchStore'

// Sticky-ish summary at the top of the panel. Single progress bar based on
// (ready / total). Per-stage counts shown as tiny chips below.

export function GeoFetchProgressHeader() {
  const { t } = useTranslation()
  const status = useGeoFetchStore((s) => s.status)
  if (!status) return null

  const ready = status.counts.ready
  const total = status.total || 1
  const pct = Math.min(100, Math.round((ready / total) * 100))

  const chips: Array<{ key: keyof typeof status.counts; label: string; color: string }> = [
    { key: 'queued', label: t('admin.geoFetch.stages.queued', 'En attente'), color: 'text-muted-foreground' },
    { key: 'fetching_map', label: t('admin.geoFetch.stages.fetching_map', 'Recherche carte'), color: 'text-neon-purple' },
    { key: 'fetching_candidates', label: t('admin.geoFetch.stages.fetching_candidates', 'Recherche images'), color: 'text-neon-purple' },
    { key: 'awaiting_curation', label: t('admin.geoFetch.stages.awaiting_curation', 'À valider'), color: 'text-warning' },
    { key: 'ready', label: t('admin.geoFetch.stages.ready', 'Prêt'), color: 'text-success' },
    { key: 'blocked', label: t('admin.geoFetch.stages.blocked', 'Bloqué'), color: 'text-error' },
  ]

  return (
    <div className="rounded-md border border-white/10 bg-black/30 p-3 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-white/80">
          {t('admin.geoFetch.progressSummary', '{{ready}}/{{total}} jeux prêts', {
            ready,
            total: status.total,
          })}
        </span>
        <span className="font-mono text-white/60">{pct}%</span>
      </div>
      <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-neon-purple to-neon-pink transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {chips.map((c) => (
          <span key={c.key} className={c.color}>
            {c.label}: <span className="font-mono">{status.counts[c.key]}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
