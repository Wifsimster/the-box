import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { useGeoFetchStore } from '@/stores/geoFetchStore'
import { GeoFetchGameRow } from './GeoFetchGameRow'

interface Props {
  onOpenGame: (gameId: number) => void
}

// Simple flat list — virtualization can be added if we ever cross a few
// hundred rows. Each row memoized so socket updates only re-render the
// affected line.

export const GeoFetchGameList = memo(function GeoFetchGameList({ onOpenGame }: Props) {
  const { t } = useTranslation()
  const games = useGeoFetchStore((s) => s.games)
  const isLoading = useGeoFetchStore((s) => s.isLoading)
  const list = Object.values(games).sort((a, b) => {
    // Awaiting-curation rows first, then by recency.
    if (a.current_stage !== b.current_stage) {
      if (a.current_stage === 'awaiting_curation') return -1
      if (b.current_stage === 'awaiting_curation') return 1
    }
    return (b.updated_at ?? '').localeCompare(a.updated_at ?? '')
  })

  if (isLoading && list.length === 0) {
    return (
      <div className="text-sm text-white/60 py-12 text-center">
        {t('admin.geoFetch.loading', 'Chargement…')}
      </div>
    )
  }

  if (list.length === 0) {
    return (
      <div className="rounded-md border border-white/10 bg-black/30 p-8 text-center text-sm text-white/60">
        {t(
          'admin.geoFetch.empty',
          "Aucune carte récupérée. Cliquez sur Lancer pour démarrer le scan.",
        )}
      </div>
    )
  }

  return (
    <div className="rounded-md border border-white/10 overflow-hidden">
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 px-3 py-2 text-xs uppercase tracking-wide text-white/50 border-b border-white/10 bg-black/40">
        <div>{t('admin.geoFetch.cols.game', 'Jeu')}</div>
        <div>{t('admin.geoFetch.cols.status', 'Statut')}</div>
        <div>{t('admin.geoFetch.cols.zones', 'Zones')}</div>
        <div className="text-right">{t('admin.geoFetch.cols.actions', 'Actions')}</div>
      </div>
      <div>
        {list.map((row) => (
          <GeoFetchGameRow key={row.game_id} row={row} onOpen={onOpenGame} />
        ))}
      </div>
    </div>
  )
})
