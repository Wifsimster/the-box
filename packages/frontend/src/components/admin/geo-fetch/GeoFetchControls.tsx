import { useTranslation } from 'react-i18next'
import { Play, Square, RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useGeoFetchStore } from '@/stores/geoFetchStore'
import type { GeoFetchStage } from '@/lib/api/geo-fetch'

const STAGE_FILTERS: Array<{ value: GeoFetchStage | null; labelKey: string; fallback: string }> = [
  { value: null, labelKey: 'admin.geoFetch.filters.all', fallback: 'Tous' },
  { value: 'awaiting_curation', labelKey: 'admin.geoFetch.filters.awaiting', fallback: 'À valider' },
  { value: 'blocked', labelKey: 'admin.geoFetch.filters.blocked', fallback: 'Bloqués' },
  { value: 'ready', labelKey: 'admin.geoFetch.filters.ready', fallback: 'Prêts' },
]

export function GeoFetchControls() {
  const { t } = useTranslation()
  const {
    start,
    cancel,
    isStarting,
    filterStage,
    setFilterStage,
    search,
    setSearch,
    hydrate,
  } = useGeoFetchStore()

  return (
    <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
      <div className="flex gap-2">
        <Button
          onClick={() => start({ all: true })}
          disabled={isStarting}
          className="bg-gradient-to-r from-neon-purple to-neon-pink"
        >
          <Play className="h-4 w-4 mr-1.5" />
          {t('admin.geoFetch.start', 'Lancer')}
        </Button>
        <Button variant="outline" onClick={() => void cancel()}>
          <Square className="h-4 w-4 mr-1.5" />
          {t('admin.geoFetch.cancel', 'Annuler')}
        </Button>
      </div>

      <div className="flex gap-1 overflow-x-auto">
        {STAGE_FILTERS.map((f) => (
          <button
            key={f.value ?? 'all'}
            onClick={() => setFilterStage(f.value)}
            className={`px-2.5 py-1 text-xs rounded-md border whitespace-nowrap ${
              filterStage === f.value
                ? 'border-neon-purple bg-neon-purple/20 text-white'
                : 'border-white/10 text-white/60 hover:text-white'
            }`}
          >
            {t(f.labelKey, f.fallback)}
          </button>
        ))}
      </div>

      <div className="flex-1 min-w-[150px]">
        <Input
          placeholder={t('admin.geoFetch.searchPlaceholder', 'Rechercher un jeu…')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onBlur={() => void hydrate()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void hydrate()
          }}
        />
      </div>

      <Button variant="ghost" size="icon" onClick={() => void hydrate()} title={t('admin.geoFetch.refresh', 'Rafraîchir')}>
        <RefreshCcw className="h-4 w-4" />
      </Button>
    </div>
  )
}
