import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Play, Square, RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
    <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
      <div className="flex gap-2">
        <Button
          onClick={() => setStartConfirmOpen(true)}
          disabled={isStarting}
          className="bg-gradient-to-r from-neon-purple to-neon-pink"
        >
          <Play className="size-4 mr-1.5" />
          {t('admin.geoFetch.start', 'Lancer')}
        </Button>
        <Button variant="outline" onClick={() => setCancelConfirmOpen(true)}>
          <Square className="size-4 mr-1.5" />
          {t('admin.geoFetch.cancel', 'Annuler')}
        </Button>
      </div>

      <div className="flex gap-1 overflow-x-auto">
        {STAGE_FILTERS.map((f) => (
          <button
            key={f.value ?? 'all'}
            type="button"
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
        <RefreshCcw className="size-4" />
      </Button>

      <Dialog open={startConfirmOpen} onOpenChange={setStartConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('admin.geoFetch.startConfirm.title', 'Lancer la récupération globale ?')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'admin.geoFetch.startConfirm.body',
                'Tous les jeux curés et résolus seront mis en file. Le serveur tronque la file à 1000 jeux maximum.',
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartConfirmOpen(false)}>
              {t('admin.cancel', 'Annuler')}
            </Button>
            <Button
              className="bg-gradient-to-r from-neon-purple to-neon-pink"
              onClick={async () => {
                setStartConfirmOpen(false)
                await start({ all: true })
              }}
            >
              {t('admin.geoFetch.startConfirm.confirm', 'Lancer')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('admin.geoFetch.cancelConfirm.title', "Annuler l'ingestion en cours ?")}
            </DialogTitle>
            <DialogDescription>
              {t(
                'admin.geoFetch.cancelConfirm.body',
                'Les tâches déjà actives terminent leur exécution. Toutes les tâches en attente (maps:*) seront supprimées de la file.',
                { count: visibleCount },
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelConfirmOpen(false)}>
              {t('admin.cancel', 'Annuler')}
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                setCancelConfirmOpen(false)
                await cancel()
              }}
            >
              {t('admin.geoFetch.cancelConfirm.confirm', 'Tout annuler')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
