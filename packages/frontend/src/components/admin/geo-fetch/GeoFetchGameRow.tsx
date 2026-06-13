import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Clock,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RotateCcw,
  Eye,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useGeoFetchStore } from '@/stores/geoFetchStore'
import type { GeoFetchGameRow as Row, GeoFetchStage } from '@/lib/api/geo-fetch'

interface Props {
  row: Row
  onOpen: (gameId: number) => void
}

// One game's state. Memoized + selector-keyed in the parent so a socket update
// for game X only re-renders that row, not the whole list.

const STAGE_META: Record<
  GeoFetchStage,
  { Icon: typeof Clock; color: string; labelKey: string; fallback: string }
> = {
  queued: { Icon: Clock, color: 'text-muted-foreground', labelKey: 'admin.geoFetch.stages.queued', fallback: 'En attente' },
  fetching_map: { Icon: Loader2, color: 'text-neon-purple', labelKey: 'admin.geoFetch.stages.fetching_map', fallback: 'Recherche carte' },
  fetching_candidates: { Icon: Loader2, color: 'text-neon-purple', labelKey: 'admin.geoFetch.stages.fetching_candidates', fallback: 'Recherche images' },
  awaiting_curation: { Icon: AlertTriangle, color: 'text-warning', labelKey: 'admin.geoFetch.stages.awaiting_curation', fallback: 'À valider' },
  ready: { Icon: CheckCircle2, color: 'text-success', labelKey: 'admin.geoFetch.stages.ready', fallback: 'Prêt' },
  blocked: { Icon: XCircle, color: 'text-error', labelKey: 'admin.geoFetch.stages.blocked', fallback: 'Bloqué' },
}

export const GeoFetchGameRow = memo(function GeoFetchGameRow({ row, onOpen }: Props) {
  const { t } = useTranslation()
  const retryGame = useGeoFetchStore((s) => s.retryGame)
  const meta = STAGE_META[row.current_stage]
  const Icon = meta.Icon
  const isSpinner = row.current_stage === 'fetching_map' || row.current_stage === 'fetching_candidates'

  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 border-b border-white/5 hover:bg-white/5">
      <div className="min-w-0">
        <div className="text-sm text-white truncate">{row.name ?? `#${row.game_id}`}</div>
        <div className="text-xs text-white/40 truncate">{row.slug ?? ''}</div>
      </div>
      <div className="flex items-center gap-1.5 text-sm">
        <Icon className={`size-4 ${meta.color} ${isSpinner ? 'animate-spin' : ''}`} />
        <span className="text-white/80">{t(meta.labelKey, meta.fallback)}</span>
        {row.active_source && isSpinner && (
          <span className="text-white/50">· {row.active_source}</span>
        )}
      </div>
      <div className="text-sm text-white/70 font-mono">
        {row.zones_selected}/{row.zones_total || 0}
      </div>
      <div className="flex items-center gap-1 justify-end">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onOpen(row.game_id)}
          title={t('admin.geoFetch.row.viewMaps', 'Voir les cartes')}
        >
          <Eye className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => void retryGame(row.game_id)}
          title={t('admin.geoFetch.row.retry', 'Réessayer')}
        >
          <RotateCcw className="size-4" />
        </Button>
      </div>
    </div>
  )
})
