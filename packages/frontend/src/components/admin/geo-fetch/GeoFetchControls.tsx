import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Play, Square, RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
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
    games,
  } = useGeoFetchStore()
  // Confirm dialogs for the two destructive actions: "Lancer tout" can
  // enqueue jobs against every curated game, and "Annuler" stops every
  // in-flight ingestion. A stray click on either is a real outage.
  const [startConfirmOpen, setStartConfirmOpen] = useState(false)
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const visibleCount = Object.keys(games).length

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <Button
          variant="gaming"
          onClick={() => setStartConfirmOpen(true)}
          disabled={isStarting}
        >
          <Play className="size-4" />
          {t('admin.geoFetch.start', 'Lancer')}
        </Button>
        <Button variant="outline" onClick={() => setCancelConfirmOpen(true)}>
          <Square className="size-4" />
          {t('admin.geoFetch.cancel', 'Annuler')}
        </Button>
      </div>

      <div
        role="group"
        aria-label={t('admin.geoFetch.cols.status', 'Statut')}
        className="-mx-1 flex gap-1 overflow-x-auto scrollbar-hide px-1"
      >
        {STAGE_FILTERS.map((f) => {
          const active = filterStage === f.value
          return (
            <button
              key={f.value ?? 'all'}
              type="button"
              aria-pressed={active}
              onClick={() => setFilterStage(f.value)}
              className={`inline-flex min-h-(--control-h) shrink-0 items-center rounded-md border px-3 text-sm whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                active
                  ? 'border-neon-purple bg-neon-purple/20 text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(f.labelKey, f.fallback)}
            </button>
          )
        })}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2 lg:min-w-[200px]">
        <Input
          type="search"
          aria-label={t('admin.geoFetch.searchPlaceholder', 'Rechercher un jeu…')}
          placeholder={t('admin.geoFetch.searchPlaceholder', 'Rechercher un jeu…')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onBlur={() => void hydrate()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void hydrate()
          }}
          className="flex-1"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void hydrate()}
          aria-label={t('admin.geoFetch.refresh', 'Rafraîchir')}
          title={t('admin.geoFetch.refresh', 'Rafraîchir')}
          className="shrink-0"
        >
          <RefreshCcw className="size-4" />
        </Button>
      </div>

      <ConfirmDialog
        open={startConfirmOpen}
        onOpenChange={setStartConfirmOpen}
        title={t('admin.geoFetch.startConfirm.title', 'Lancer la récupération globale ?')}
        description={t(
          'admin.geoFetch.startConfirm.body',
          'Tous les jeux curés et résolus seront mis en file. Le serveur tronque la file à 1000 jeux maximum.',
        )}
        confirmLabel={t('admin.geoFetch.startConfirm.confirm', 'Lancer')}
        cancelLabel={t('admin.cancel', 'Annuler')}
        onConfirm={async () => {
          setStartConfirmOpen(false)
          await start({ all: true })
        }}
      />

      <ConfirmDialog
        open={cancelConfirmOpen}
        onOpenChange={setCancelConfirmOpen}
        title={t('admin.geoFetch.cancelConfirm.title', "Annuler l'ingestion en cours ?")}
        description={t(
          'admin.geoFetch.cancelConfirm.body',
          'Les tâches déjà actives terminent leur exécution. Toutes les tâches en attente (maps:*) seront supprimées de la file.',
          { count: visibleCount },
        )}
        confirmLabel={t('admin.geoFetch.cancelConfirm.confirm', 'Tout annuler')}
        cancelLabel={t('admin.cancel', 'Annuler')}
        destructive
        onConfirm={async () => {
          setCancelConfirmOpen(false)
          await cancel()
        }}
      />
    </div>
  )
}
