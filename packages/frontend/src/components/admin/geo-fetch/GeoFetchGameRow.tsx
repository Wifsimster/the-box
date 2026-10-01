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

  const name = row.name ?? `#${row.game_id}`

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2 border-b border-border/60 hover:bg-muted/40 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="text-sm text-foreground truncate">{name}</div>
        <div className="text-xs text-muted-foreground truncate">{row.slug ?? ''}</div>
      </div>
      <div className="col-start-1 row-start-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm md:col-start-auto md:row-start-auto md:contents">
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon className={`size-4 shrink-0 ${meta.color} ${isSpinner ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span className="text-foreground">{t(meta.labelKey, meta.fallback)}</span>
          {row.active_source && isSpinner && (
            <span className="truncate text-muted-foreground">· {row.active_source}</span>
          )}
        </div>
        <div className="font-mono text-muted-foreground">
          <span className="md:hidden">{t('admin.geoFetch.cols.zones', 'Zones')} </span>
          {row.zones_selected}/{row.zones_total || 0}
        </div>
      </div>
      <div className="col-start-2 row-span-2 row-start-1 flex items-center justify-end gap-1 md:col-start-auto md:row-span-1 md:row-start-auto">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onOpen(row.game_id)}
          aria-label={`${t('admin.geoFetch.row.viewMaps', 'Voir les cartes')} : ${name}`}
          title={t('admin.geoFetch.row.viewMaps', 'Voir les cartes')}
        >
          <Eye className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => void retryGame(row.game_id)}
          aria-label={`${t('admin.geoFetch.row.retry', 'Réessayer')} : ${name}`}
          title={t('admin.geoFetch.row.retry', 'Réessayer')}
        >
          <RotateCcw className="size-4" />
        </Button>
      </div>
    </div>
  )
})
